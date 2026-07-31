import type { GraphNode, GraphState, NodeResult, ToolSet } from "./types.js";

/**
 * Run multiple nodes in parallel and wait for all to complete (barrier).
 * Each node receives the same state snapshot and its own permitted tool set.
 * Results are merged back into `state.nodeResults`.
 *
 * If any node throws, its slot is recorded as `failed` but the barrier still
 * waits for all siblings — partial failure does not cancel siblings.
 */
export async function parallel<TState extends GraphState>(
  nodes: GraphNode<TState>[],
  state: TState,
  getTools: (nodeName: string) => ToolSet,
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  const tasks = nodes.map(async (node) => {
    const start = Date.now();
    try {
      const tools = getTools(node.name);
      const output = await node.run({ state, tools });
      const nodeResult: NodeResult = {
        nodeName: node.name,
        status: "success",
        output,
        durationMs: Date.now() - start,
        retryCount: 0,
      };
      state.nodeResults[node.name] = nodeResult;
      results[node.name] = output;
    } catch (err) {
      const nodeResult: NodeResult = {
        nodeName: node.name,
        status: "failed",
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        retryCount: 0,
      };
      state.nodeResults[node.name] = nodeResult;
      results[node.name] = null;
    }
  });

  await Promise.all(tasks);
  return results;
}
