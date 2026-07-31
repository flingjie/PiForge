import type {
  GraphNode,
  GraphState,
  Edge,
  GraphConfig,
  RouteCondition,
  RouteResult,
  NodeResult,
  DEFAULT_GRAPH_CONFIG,
} from "./types.js";
import { parallel } from "./concurrency.js";
import { saveCheckpoint, shouldCheckpoint } from "./checkpoint.js";
import { withRetry } from "./retry.js";
import type { ToolSet } from "./types.js";

/**
 * Execute a graph by walking nodes via edges.
 *
 * ## Traversal
 * Starts from the first node. After a node completes, looks at its outgoing
 * edges to determine the next step. A `RouteCondition` function may return:
 * - A single string → execute that node next
 * - An array of strings → execute all in parallel (barrier)
 * - `null` → stop traversal (end of graph)
 *
 * ## Checkpointing
 * After every parallel barrier, a deep-copied checkpoint is saved so the
 * graph can be resumed from that point.
 *
 * ## Cycles
 * User-gate loops (e.g. reject → back to synthesize) are allowed. Each
 * full cycle increments a counter. When `maxCycles` is exceeded the graph
 * exits with status `"partial_accepted"`.
 *
 * ## Retry
 * Nodes with `retryConfig` are executed via `withRetry()`, which injects
 * feedback from prior attempts.
 */
export async function runGraph<TState extends GraphState>(
  nodes: Record<string, GraphNode<TState>>,
  edges: Edge<TState>[],
  state: TState,
  config: GraphConfig,
  getTools: (nodeName: string) => ToolSet,
  /** Nodes after which a checkpoint should be written. */
  barrierNodes: Set<string>,
  /** Explicit entry node(s). If omitted, auto-detected from edges. */
  entry?: string | string[],
): Promise<TState> {
  // Build adjacency: from → list of { to, condition }
  const adjacency = new Map<string, Edge<TState>[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e);
    adjacency.set(e.from, list);
  }

  // Identify entry points: nodes with no incoming edges.
  // An edge creates an incoming dependency when:
  //   - it has an explicit `to`, OR
  //   - it has a static string condition (which always routes to that node).
  // Dynamic (function) conditions are not treated as incoming since we
  // can't know where they route at analysis time.
  const hasExplicitIncoming = new Set<string>();
  for (const e of edges) {
    if (e.to) hasExplicitIncoming.add(e.to);
    if (typeof e.condition === "string") hasExplicitIncoming.add(e.condition);
  }

  let entryNodes: string[];
  if (entry !== undefined) {
    entryNodes = Array.isArray(entry) ? entry : [entry];
  } else {
    entryNodes = Object.keys(nodes).filter((n) => !hasExplicitIncoming.has(n));
    if (entryNodes.length === 0) {
      entryNodes.push(Object.keys(nodes).sort()[0]!);
    }
  }

  state.status = "running";
  let cycleCount = 0;
  let current: string[] = entryNodes;

  while (current.length > 0) {
    // --- Execute current node(s) ---
    if (current.length === 1) {
      const nodeName = current[0]!;
      const node = nodes[nodeName];
      if (!node) throw new Error(`Node "${nodeName}" not found in graph.`);

      const start = Date.now();
      try {
        const { output, retryCount } = await withRetry(
          node,
          { state, tools: getTools(nodeName) },
          getTools,
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

      await parallel(parallelNodes, state, getTools);

      // After barrier, checkpoint at the group level.
      const barrierName = `barrier:${current.join("+")}`;
      if (config.checkpointing) {
        saveCheckpoint(state, barrierName);
      }
      // Update current to the synthetic barrier node so resolveNext can find
      // outgoing edges from it.
      current = [barrierName];
    }

    // --- Route to next node(s) ---
    const next = resolveNext(current, adjacency, state);

    if (next.length === 0) {
      // Natural end — no more edges.
      break;
    }

    // Detect cycles: if any next node has already been visited and is a
    // repeat point (e.g. user gate rejected → loop back to synthesize).
    const anyRevisited = next.some((n) => state.nodeResults[n] !== undefined);
    if (anyRevisited) {
      cycleCount++;
      if (cycleCount > config.maxCycles) {
        state.status = "partial_accepted";
        break;
      }
    }

    current = next;
  }

  // Only set to completed if the route functions haven't set another status
  // (e.g. "aborted" from validation gate or "partial_accepted" from cycle detection).
  if (state.status === "running") {
    state.status = "completed";
  }
  return state;
}

/**
 * Given a set of completed nodes, resolve the next node(s) by evaluating
 * outgoing edge conditions.
 */
function resolveNext<TState extends GraphState>(
  currentNodeNames: string[],
  adjacency: Map<string, Edge<TState>[]>,
  state: TState,
): string[] {
  const next = new Set<string>();

  for (const from of currentNodeNames) {
    const outEdges = adjacency.get(from);
    if (!outEdges || outEdges.length === 0) continue;

    for (const edge of outEdges) {
      // If edge has an explicit `to` and no condition, route directly.
      // If edge has a condition, evaluate it.
      let result: string | string[] | null;
      if (edge.condition !== undefined) {
        result = evaluateCondition(edge.condition, state);
      } else if (edge.to !== undefined) {
        result = edge.to;
      } else {
        result = null;
      }

      if (result === null) continue;
      if (Array.isArray(result)) {
        for (const n of result) next.add(n);
      } else {
        next.add(result);
      }
    }
  }

  return [...next];
}

/**
 * Evaluate a route condition into concrete next-node name(s).
 */
function evaluateCondition<TState extends GraphState>(
  condition: RouteCondition<TState> | undefined,
  state: TState,
): string | string[] | null {
  if (condition === undefined) return null;
  if (typeof condition === "string") return condition;
  return condition(state);
}
