import { readFileSync } from "node:fs";
import type {
  TodoConfig,
  TodoGraph,
  TodoNode,
  TodoNodeResult,
  NodeExecutor,
  ExecutionReport,
} from "./types.js";
import { parseTodoGraph } from "./parser.js";
import { updateStatus } from "./status.js";
import { generateReport } from "./report.js";
import { withRetry, RetryExhaustedError } from "../graph/retry.js";
import type { GraphState, GraphNode, NodeInput } from "../graph/types.js";

// Internal wrapper state that satisfies GraphState for withRetry compatibility.
interface OrchestratorNodeState extends GraphState {
  _todoNode: TodoNode;
}

function findTransitiveDependents(
  graph: TodoGraph,
  failedIds: Set<number>,
): Set<number> {
  const toSkip = new Set<number>();

  function markDownstream(nodeId: number): void {
    for (const node of graph.nodes) {
      if (toSkip.has(node.id)) continue;
      if (node.dependsOn.includes(nodeId)) {
        toSkip.add(node.id);
        markDownstream(node.id);
      }
    }
  }

  for (const id of failedIds) {
    markDownstream(id);
  }

  return toSkip;
}

function wrapNodeIntoGraphNode(
  node: TodoNode,
  executor: NodeExecutor,
  maxRetries: number,
): GraphNode<OrchestratorNodeState, unknown> {
  return {
    name: node.name,
    run: async (_input: NodeInput<OrchestratorNodeState>) => {
      return executor(node);
    },
    retryConfig:
      maxRetries > 0
        ? {
            maxRetries,
            feedbackFn: (attempt: number, error: Error) => ({
              attempt,
              error: error.message,
              nodeId: node.id,
            }),
          }
        : undefined,
  };
}

export async function runOrchestrator(
  config: TodoConfig,
  executor: NodeExecutor,
): Promise<ExecutionReport> {
  const content = readFileSync(config.todoPath, "utf-8");
  const graph = parseTodoGraph(content);
  const results: TodoNodeResult[] = [];
  const failedIds = new Set<number>();
  const startTime = Date.now();

  for (const group of graph.groups) {
    // Check which nodes in this group should be skipped due to upstream failures.
    const toSkip = findTransitiveDependents(graph, failedIds);
    const activeNodes = group.filter((id) => !toSkip.has(id));
    const skippedInGroup = group.filter((id) => toSkip.has(id));

    // Mark skipped nodes.
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

    // Execute active nodes in parallel within the group.
    const groupTasks = activeNodes.map(
      async (nodeId): Promise<TodoNodeResult> => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found in graph`);

        updateStatus(config.todoPath, nodeId, "in_progress");

        const graphNode = wrapNodeIntoGraphNode(
          node,
          executor,
          config.maxRetries,
        );

        const nodeState: OrchestratorNodeState = {
          _todoNode: node,
          checkpoints: [],
          nodeResults: {},
          status: "running",
        };

        const nodeStart = Date.now();

        try {
          const { output, retryCount } = await withRetry(
            graphNode,
            { state: nodeState },
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
            retryCount:
              err instanceof RetryExhaustedError ? err.attempts : 0,
          };
        }
      },
    );

    const groupResults = await Promise.all(groupTasks);
    results.push(...groupResults);
  }

  return generateReport(results, startTime);
}
