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
  status: NodeStatus;
  /** Optional markdown-defined routing rules (parsed from "Routes" column). */
  routes?: RouteRule[];
}

export type NodeStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped"
  | "escalated"
  | "degraded";

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
  /** Budget limits for the run. When exceeded, the orchestrator stops with a partial report. */
  budget?: BudgetConfig;
  /** Programmatic route handler for complex conditional routing. */
  routeHandler?: RouteHandler;
}

/** Result of a single node execution. */
export interface TodoNodeResult {
  nodeId: number;
  nodeName: string;
  status: "success" | "failed" | "skipped" | "escalated" | "degraded";
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
  escalated: number;
  degraded: number;
  nodes: TodoNodeResult[];
  durationMs: number;
  /** Optional human-readable note about the run (e.g. dry-run). */
  note?: string;
  /** Budget status at the end of the run. Present only when budget is configured. */
  budget?: BudgetStatus;
}

// ---- Budget ----

/** Budget limits for an orchestrator run. */
export interface BudgetConfig {
  maxTimeMs: number;
  maxRetriesPerNode: number;
  /** Approximate token budget (honor-system, not precise). */
  maxTokens?: number;
}

/** Current budget consumption during a run. */
export interface BudgetStatus {
  elapsedMs: number;
  tokensUsed: number;
  nodeRetries: Map<number, number>;
  exceeded: "none" | "time" | "tokens" | "retries";
}

// ---- Routing ----

/** A declarative routing rule, parsed from the markdown Routes column. */
export interface RouteRule {
  condition: RouteCondition;
  action: RouteAction;
}

export type RouteCondition =
  | "on_success"
  | "on_fail"
  | "on_skipped"
  | "on_budget_exceeded";

export type RouteAction =
  | { kind: "retry"; extraAttempts: number }
  | { kind: "escalate"; reason: string }
  | { kind: "stop"; reason: string }
  | { kind: "activate"; nodeIds: number[] }
  | { kind: "deactivate"; nodeIds: number[] };

/** A routing decision returned by the route handler or markdown rules. */
export type RoutingDecision =
  | { action: "continue" }
  | { action: "retry"; extraAttempts?: number; delayMs?: number }
  | { action: "stop"; reason: string }
  | { action: "escalate"; reason: string }
  | { action: "activate"; nodeIds: number[]; timing?: "deferred" }
  | { action: "deactivate"; nodeIds: number[] };

/** Called after every node completes. Return null to fall through to markdown-defined rules. */
export interface RouteHandler {
  onNodeComplete(
    node: TodoNode,
    result: TodoNodeResult,
    graph: TodoGraph,
    budget: BudgetStatus,
  ): Promise<RoutingDecision | null>;
}
