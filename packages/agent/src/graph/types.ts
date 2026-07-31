/** A string-keyed map of tool functions available to graph nodes during execution. */
export type ToolSet = Record<string, (...args: any[]) => unknown>;

/** Input passed to a node's run method: the full graph state plus its per-node tool set. */
export interface NodeInput<TState extends GraphState> {
  state: TState;
  tools: ToolSet;
}

/** A single node in the graph — the fundamental unit of work. */
export interface GraphNode<TState extends GraphState = GraphState, TOutput = unknown> {
  /** Unique name within the graph. Used for routing, checkpointing, and tool lookup. */
  name: string;
  /** Execute this node's work. Receives a snapshot of state and its permitted tools. */
  run: (input: NodeInput<TState>) => Promise<TOutput>;
  /** Optional retry configuration. If omitted, the node is never retried. */
  retryConfig?: RetryConfig<TState>;
}

/** Retry behaviour for a node. */
export interface RetryConfig<TState extends GraphState> {
  /** Maximum number of retry attempts (0 = no retries). */
  maxRetries: number;
  /** Generate feedback to inject into the retry attempt's input. */
  feedbackFn: (attempt: number, error: Error) => Record<string, unknown>;
}

/** Result of routing: the next node (or parallel group) to execute. */
export interface RouteResult {
  /** Name(s) of the next node(s). Array = parallel fan-out. */
  next: string[];
  /** If multiple nodes, whether they must run in parallel. Implies a barrier after. */
  parallel: boolean;
}

/**
 * A routing edge from one node to another, optionally guarded by a condition.
 * When `condition` is omitted the edge is always followed.
 * When `condition` is a function it receives state and returns the next node name(s),
 * or null to signal this edge should NOT be taken.
 * When `condition` is a string it is treated as a static target — the edge always
 * routes to that node name.
 */
export type RouteCondition<TState extends GraphState> =
  | string
  | ((state: TState) => string | string[] | null);

export interface Edge<TState extends GraphState = GraphState> {
  from: string;
  to?: string;
  condition?: RouteCondition<TState>;
}

/** The result logged by a single node execution. */
export interface NodeResult {
  nodeName: string;
  status: "success" | "degraded" | "failed";
  output: unknown;
  error?: string;
  durationMs: number;
  retryCount: number;
}

/** A serializable checkpoint snapshot. */
export interface Checkpoint {
  /** Name of the node that was just completed when this checkpoint was written. */
  nodeName: string;
  timestamp: string;
  /** Deep-copied state snapshot. */
  state: Record<string, unknown>;
}

/**
 * Shared graph state — every graph's state object extends this.
 * Nodes read and mutate properties of the concrete subclass.
 */
export interface GraphState {
  /** Ordered list of checkpoints written during execution. */
  checkpoints: Checkpoint[];
  /** Ordered log of routing decisions. */
  routeLog: string[];
  /** Map of node name → execution result. */
  nodeResults: Record<string, NodeResult>;
  /** Execution status of the entire graph run. */
  status: "running" | "completed" | "aborted" | "partial_accepted";
}

/** Top-level configuration for a graph run. */
export interface GraphConfig {
  /** If true, save a checkpoint after every barrier. Default true. */
  checkpointing: boolean;
  /** Maximum graph-level retry cycles (used by user-gate loops, etc.). Default 3. */
  maxCycles: number;
}

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  checkpointing: true,
  maxCycles: 3,
};
