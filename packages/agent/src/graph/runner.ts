import type { GraphNode, GraphState, GraphConfig, NodeResult } from "./types.js";
import { parallel } from "./concurrency.js";
import { saveCheckpoint, shouldCheckpoint } from "./checkpoint.js";
import { withRetry } from "./retry.js";

/**
 * Execute a graph by walking from entry nodes and calling `route` after each
 * step to determine what runs next.
 *
 * ## Traversal
 * - The caller provides entry node names.
 * - After every node (or parallel group) completes, `route(nodeName, state)` is called.
 * - `route` returns the next node name(s) to execute, `null` to stop, or an array
 *   to fan out in parallel (barrier).
 *
 * ## Checkpointing
 * After every parallel barrier, a deep-copied checkpoint is saved.
 *
 * ## Cycles
 * `route` may return a node that has already been visited (e.g. user gate reject
 * loops back to adversary). Each full cycle increments a counter. When `maxCycles`
 * is exceeded the graph exits with status `"partial_accepted"`.
 *
 * ## Retry
 * Nodes with `retryConfig` are executed via `withRetry()`, which injects
 * feedback from prior attempts.
 */
export async function runGraph<TState extends GraphState>(
  nodes: Record<string, GraphNode<TState>>,
  state: TState,
  config: GraphConfig,
  route: (nodeName: string, state: TState) => string[] | null,
  /** Nodes after which a checkpoint should be written. */
  barrierNodes: Set<string>,
  /** Entry node name(s). Parallel if multiple. */
  entry: string[],
): Promise<TState> {
  state.status = "running";
  let cycleCount = 0;
  let current: string[] = entry;

  while (current.length > 0) {
    // --- Execute ---
    if (current.length === 1) {
      const nodeName = current[0]!;
      const node = nodes[nodeName];
      if (!node) throw new Error(`Node "${nodeName}" not found in graph.`);

      const start = Date.now();
      try {
        const { output, retryCount } = await withRetry(
          node,
          { state },
          nodeName,
        );
        state.nodeResults[nodeName] = {
          nodeName,
          status: "success",
          output,
          durationMs: Date.now() - start,
          retryCount,
        };
      } catch (err) {
        state.nodeResults[nodeName] = {
          nodeName,
          status: "failed",
          output: null,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
          retryCount: (err as any)?.attempts ?? 0,
        };
        state.status = "aborted";
        return state;
      }

      if (shouldCheckpoint(nodeName, barrierNodes)) {
        saveCheckpoint(state, nodeName);
      }
    } else {
      // Parallel fan-out
      const parallelNodes = current
        .map((n) => nodes[n])
        .filter((n): n is GraphNode<TState> => !!n);
      if (parallelNodes.length === 0) {
        throw new Error(`No valid nodes in parallel group: ${current.join(", ")}`);
      }

      await parallel(parallelNodes, state);

      const barrierName = `barrier:${current.join("+")}`;
      if (config.checkpointing) {
        saveCheckpoint(state, barrierName);
      }
      current = [barrierName];
    }

    // --- Route to next ---
    const next = route(current[0]!, state);

    if (!next || next.length === 0) {
      break;
    }

    // Detect cycles
    if (next.some((n) => state.nodeResults[n] !== undefined)) {
      cycleCount++;
      if (cycleCount > config.maxCycles) {
        state.status = "partial_accepted";
        break;
      }
    }

    current = next;
  }

  if (state.status === "running") {
    state.status = "completed";
  }
  return state;
}
