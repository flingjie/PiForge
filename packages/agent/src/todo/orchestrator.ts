import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  TodoConfig,
  TodoNode,
  TodoNodeResult,
  NodeExecutor,
  ExecutionReport,
} from "./types.js";
import { parseTodoGraph } from "./parser.js";
import { updateStatus } from "./status.js";
import { generateReport } from "./report.js";

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
      nodes,
      durationMs: 0,
      note: "dry-run: graph parsed and validated; no nodes were executed",
    };
  }

  const results: TodoNodeResult[] = [];
  const failedIds = new Set<number>();
  const startTime = Date.now();

  for (const group of graph.groups) {
    const toSkip = findTransitiveDependents(graph, failedIds);
    const activeNodes = group.filter((id) => !toSkip.has(id));
    const skippedInGroup = group.filter((id) => toSkip.has(id));

    for (const id of skippedInGroup) {
      updateStatus(config.todoPath, id, "skipped");
      results.push({
        nodeId: id,
        nodeName: graph.nodes.find((n) => n.id === id)?.name ?? `node-${id}`,
        status: "skipped",
        output: null,
        durationMs: 0,
        retryCount: 0,
      });
    }

    if (activeNodes.length === 0) continue;

    const groupTasks = activeNodes.map(
      async (nodeId): Promise<TodoNodeResult> => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found in graph`);

        updateStatus(config.todoPath, nodeId, "in_progress");

        const nodeStart = Date.now();

        try {
          const { output, retryCount } = await executeWithRetry(
            node,
            executor,
            config.maxRetries,
            node.name,
          );
          updateStatus(config.todoPath, nodeId, "completed");
          return {
            nodeId,
            nodeName: node.name,
            status: "success",
            output,
            durationMs: Date.now() - nodeStart,
            retryCount,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          updateStatus(config.todoPath, nodeId, "failed");
          failedIds.add(nodeId);
          return {
            nodeId,
            nodeName: node.name,
            status: "failed",
            output: null,
            error,
            durationMs: Date.now() - nodeStart,
            retryCount: err instanceof RetryExhaustedError ? err.attempts : 0,
          };
        }
      },
    );

    const groupResults = await Promise.all(groupTasks);
    results.push(...groupResults);
  }

  return generateReport(results, startTime);
}

/**
 * Runs the orchestrator directly from an in-memory TODO markdown string,
 * without requiring a pre-existing file. Writes the markdown to a temp file,
 * delegates to {@link runOrchestrator}, then cleans up the temp file.
 */
export async function runOrchestratorFromMarkdown(
  todoMarkdown: string,
  executor: NodeExecutor,
  options?: { maxRetries?: number },
): Promise<ExecutionReport> {
  const dir = mkdtempSync(join(tmpdir(), "piforge-todo-"));
  const todoPath = join(dir, "todo.md");
  try {
    writeFileSync(todoPath, todoMarkdown, "utf-8");
    return await runOrchestrator(
      { maxRetries: options?.maxRetries ?? 0, todoPath },
      executor,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
