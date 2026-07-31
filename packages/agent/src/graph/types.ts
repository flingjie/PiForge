/** Input passed to a node's run method: the full graph state. */
export interface NodeInput<TState extends GraphState> {
  state: TState;
}

/** A single node in the graph — the fundamental unit of work. */
export interface GraphNode<TState extends GraphState = GraphState, TOutput = unknown> {
  /** Unique name within the graph. Used for routing, checkpointing, and logging. */
  name: string;
  /** Execute this node's work. Receives the current graph state. */
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
