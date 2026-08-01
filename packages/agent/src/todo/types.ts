// No imports — these types are standalone and do not extend the graph runtime's
// NodeResult because the status unions differ (NodeResult uses "success"|"degraded"|"failed"
// while TodoNodeResult uses "success"|"failed"|"skipped").

/** A single node in the TODO graph, as parsed from todo.md. */
export interface TodoNode {
  id: number;
  name: string;
  files: string[];
  verify: string;
  dependsOn: number[];
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
}

/** The parsed TODO graph — nodes plus execution groups. */
export interface TodoGraph {
  nodes: TodoNode[];
  /** Groups execute sequentially; nodes within a group run in parallel. */
  groups: number[][];
}

/** Configuration for an orchestrator run. */
export interface TodoConfig {
  /** Max retries per node before marking it failed (default 3). */
  maxRetries: number;
  /** Absolute path to the todo.md file. */
  todoPath: string;
  /** When true, parse and validate the graph without executing any nodes. */
  dryRun?: boolean;
}

/** Result of a single node execution. */
export interface TodoNodeResult {
  nodeId: number;
  nodeName: string;
  status: "success" | "failed" | "skipped";
  output: unknown;
  error?: string;
  durationMs: number;
  retryCount: number;
}

/** A function that executes a single node — supplied by the host environment. */
export type NodeExecutor = (node: TodoNode) => Promise<{ output: unknown }>;

/** Final report after an orchestrator run. */
export interface ExecutionReport {
  totalNodes: number;
  completed: number;
  failed: number;
  skipped: number;
  nodes: TodoNodeResult[];
  durationMs: number;
  /** Optional human-readable note about the run (e.g. dry-run). */
  note?: string;
}
