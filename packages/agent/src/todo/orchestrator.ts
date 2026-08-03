import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  TodoConfig,
  TodoNode,
  TodoNodeResult,
  NodeExecutor,
  ExecutionReport,
  RoutingDecision,
} from "./types.js";
import { parseTodoGraph } from "./parser.js";
import { updateStatus } from "./status.js";
import { generateReport } from "./report.js";
import { createBudget, updateBudget as updateB, recordRetry, checkBudget } from "./budget.js";
import { resolveRouting } from "./routing.js";

/** Error thrown when a node exhausts all retry attempts. */
class RetryExhaustedError extends Error {
  constructor(
    public readonly nodeName: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(`Node "${nodeName}" failed after ${attempts} attempt(s): ${lastError.message}`);
    this.name = "RetryExhaustedError";
  }
}

async function executeWithRetry(
  node: TodoNode,
  executor: NodeExecutor,
  maxRetries: number,
  nodeName: string,
): Promise<{ output: unknown; retryCount: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const output = await executor(node);
      return { output, retryCount: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new RetryExhaustedError(nodeName, maxRetries + 1, lastError as Error);
}

function findTransitiveDependents(
  graph: { nodes: { id: number; dependsOn: number[] }[] },
  failedIds: Set<number>,
): Set<number> {
  const toSkip = new Set<number>();

  function markDownstream(nodeId: number): void {
    for (const n of graph.nodes) {
      if (toSkip.has(n.id)) continue;
      if (n.dependsOn.includes(nodeId)) {
        toSkip.add(n.id);
        markDownstream(n.id);
      }
    }
  }

  for (const id of failedIds) {
    markDownstream(id);
  }

  return toSkip;
}

/** Runtime state accumulated during a run, mutated by the orchestrator loop. */
interface RunState {
  results: TodoNodeResult[];
  failedIds: Set<number>;
  deactivatedIds: Set<number>;
  escalatedIds: Set<number>;
  dynamicQueue: number[];
  budget: import("./types.js").BudgetStatus;
  stopped: boolean;
  stopReason: string | null;
}

async function executeSingleNode(
  node: TodoNode,
  executor: NodeExecutor,
  config: TodoConfig,
  state: RunState,
): Promise<TodoNodeResult> {
  updateStatus(config.todoPath, node.id, "in_progress");
  const nodeStart = Date.now();

  try {
    const { output, retryCount } = await executeWithRetry(
      node,
      executor,
      config.maxRetries,
      node.name,
    );

    const result: TodoNodeResult = {
      nodeId: node.id,
      nodeName: node.name,
      status: "success",
      output,
      durationMs: Date.now() - nodeStart,
      retryCount,
    };

    // Update budget: normal execution retries
    if (config.budget) {
      state.budget = updateB(state.budget, result.durationMs, 0);
      for (let i = 0; i < retryCount; i++) {
        state.budget = recordRetry(state.budget, config.budget, node.id);
      }
      const exceeded = checkBudget(state.budget, config.budget);
      if (exceeded !== "none") state.budget = { ...state.budget, exceeded };
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryCount =
      err instanceof RetryExhaustedError
        ? err.attempts - 1
        : 0;

    const result: TodoNodeResult = {
      nodeId: node.id,
      nodeName: node.name,
      status: "failed",
      output: null,
      error,
      durationMs: Date.now() - nodeStart,
      retryCount,
    };

    if (config.budget) {
      state.budget = updateB(state.budget, result.durationMs, 0);
      for (let i = 0; i <= config.maxRetries; i++) {
        state.budget = recordRetry(state.budget, config.budget, node.id);
      }
      const exceeded = checkBudget(state.budget, config.budget);
      if (exceeded !== "none") state.budget = { ...state.budget, exceeded };
    }

    return result;
  }
}

async function applyRoutingDecision(
  decision: RoutingDecision,
  node: TodoNode,
  result: TodoNodeResult,
  state: RunState,
  config: TodoConfig,
  executor: NodeExecutor,
): Promise<TodoNodeResult | null> {
  switch (decision.action) {
    case "continue":
      return null;

    case "retry": {
      // Execute the node again (routing-level retry, not execution-level retry)
      updateStatus(config.todoPath, node.id, "in_progress");
      const nodeStart = Date.now();

      try {
        const { output } = await executeWithRetry(
          node,
          executor,
          (decision.extraAttempts ?? 1), // routing retries (including the initial retry attempt)
          node.name,
        );

        const retryResult: TodoNodeResult = {
          nodeId: node.id,
          nodeName: node.name,
          status: "success",
          output,
          durationMs: Date.now() - nodeStart,
          retryCount: result.retryCount + 1,
        };

        state.budget = updateB(state.budget, retryResult.durationMs, 0);
        for (let i = 0; i < (decision.extraAttempts ?? 1); i++) {
          state.budget = recordRetry(state.budget, config.budget!, node.id);
        }

        updateStatus(config.todoPath, node.id, "completed");
        return retryResult;
      } catch {
        // Routing retry also failed — keep the original failure
        return null;
      }
    }

    case "escalate": {
      state.escalatedIds.add(node.id);
      return {
        ...result,
        status: "escalated",
        error: decision.reason,
      };
    }

    case "stop": {
      state.stopped = true;
      state.stopReason = decision.reason;
      return null;
    }

    case "activate": {
      state.dynamicQueue.push(...decision.nodeIds);
      return null;
    }

    case "deactivate": {
      for (const id of decision.nodeIds) {
        state.deactivatedIds.add(id);
      }
      return null;
    }

    default:
      return null;
  }
}

/** Process a batch of node IDs in parallel. Handles execution, routing, and status updates. */
async function runNodeBatch(
  nodeIds: number[],
  graph: import("./types.js").TodoGraph,
  config: TodoConfig,
  executor: NodeExecutor,
  state: RunState,
  hasBudget: boolean,
): Promise<void> {
  if (state.stopped) return;

  // Budget check before batch
  if (hasBudget) {
    const exceeded = checkBudget(state.budget, config.budget!);
    if (exceeded !== "none") {
      state.budget = { ...state.budget, exceeded };
      state.stopped = true;
      state.stopReason = `Budget exceeded: ${exceeded}`;
      return;
    }
  }

  const tasks = nodeIds.map(
    async (nodeId): Promise<void> => {
      if (state.stopped) return;

      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // Execute
      let result = await executeSingleNode(node, executor, config, state);

      // Resolve routing decision
      const decision = await resolveRouting(
        node,
        result,
        graph,
        state.budget,
        config.routeHandler,
      );

      // Apply routing decision — may replace result
      const routingResult = await applyRoutingDecision(
        decision,
        node,
        result,
        state,
        config,
        executor,
      );

      if (routingResult !== null) {
        result = routingResult;
      }

      // Update status based on final result
      if (result.status === "failed") {
        state.failedIds.add(nodeId);
        updateStatus(config.todoPath, nodeId, "failed");
      } else if (result.status === "escalated") {
        updateStatus(config.todoPath, nodeId, "escalated");
      } else {
        updateStatus(config.todoPath, nodeId, "completed");
      }

      state.results.push(result);
    },
  );

  await Promise.all(tasks);
}

export async function runOrchestrator(
  config: TodoConfig,
  executor: NodeExecutor,
): Promise<ExecutionReport> {
  const content = readFileSync(config.todoPath, "utf-8");
  const graph = parseTodoGraph(content);

  // Dry-run: parse and validate, execute nothing.
  if (config.dryRun) {
    const nodes: TodoNodeResult[] = graph.nodes.map((n) => ({
      nodeId: n.id,
      nodeName: n.name,
      status: "success",
      output: null,
      durationMs: 0,
      retryCount: 0,
    }));
    return {
      totalNodes: nodes.length,
      completed: nodes.length,
      failed: 0,
      skipped: 0,
      escalated: 0,
      degraded: 0,
      nodes,
      durationMs: 0,
      note: "dry-run: graph parsed and validated; no nodes were executed",
    };
  }

  const state: RunState = {
    results: [],
    failedIds: new Set(),
    deactivatedIds: new Set(),
    escalatedIds: new Set(),
    dynamicQueue: [],
    budget: config.budget
      ? createBudget(config.budget)
      : { elapsedMs: 0, tokensUsed: 0, nodeRetries: new Map(), exceeded: "none" },
    stopped: false,
    stopReason: null,
  };

  const startTime = Date.now();
  const hasBudget = config.budget !== undefined;

  // ---- Process static groups ----
  for (const group of graph.groups) {
    const toSkip = findTransitiveDependents(graph, state.failedIds);
    const activeNodes = group.filter(
      (id) => !toSkip.has(id) && !state.deactivatedIds.has(id),
    );
    const skippedInGroup = group.filter(
      (id) => toSkip.has(id) || state.deactivatedIds.has(id),
    );

    for (const id of skippedInGroup) {
      const skipReason = state.deactivatedIds.has(id) ? "deactivated" : "skipped";
      updateStatus(config.todoPath, id, "skipped");
      state.results.push({
        nodeId: id,
        nodeName: graph.nodes.find((n) => n.id === id)?.name ?? `node-${id}`,
        status: "skipped",
        output: null,
        durationMs: 0,
        retryCount: 0,
        error: skipReason === "deactivated" ? "Deactivated by routing decision" : undefined,
      });
    }

    if (activeNodes.length === 0) continue;

    await runNodeBatch(activeNodes, graph, config, executor, state, hasBudget);
    if (state.stopped) break;
  }

  // ---- Process dynamic queue (deferred) ----
  if (state.dynamicQueue.length > 0) {
    const seen = new Set(state.results.map((r) => r.nodeId).concat([...state.failedIds]));
    const newNodes = state.dynamicQueue.filter((id) => !seen.has(id));
    await runNodeBatch(newNodes, graph, config, executor, state, hasBudget);
  }

  return generateReport(state.results, startTime, {
    budget: state.budget,
    escalated: state.escalatedIds.size,
    note: state.stopReason ?? undefined,
  });
}

/**
 * Runs the orchestrator directly from an in-memory TODO markdown string.
 */
export async function runOrchestratorFromMarkdown(
  todoMarkdown: string,
  executor: NodeExecutor,
  options?: { maxRetries?: number; budget?: import("./types.js").BudgetConfig; routeHandler?: import("./types.js").RouteHandler },
): Promise<ExecutionReport> {
  const dir = mkdtempSync(join(tmpdir(), "piforge-todo-"));
  const todoPath = join(dir, "todo.md");
  try {
    writeFileSync(todoPath, todoMarkdown, "utf-8");
    return await runOrchestrator(
      {
        maxRetries: options?.maxRetries ?? 0,
        todoPath,
        budget: options?.budget,
        routeHandler: options?.routeHandler,
      },
      executor,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
