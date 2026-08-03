// TODO Graph & Orchestrator.
export type {
  TodoNode,
  TodoGraph,
  TodoConfig,
  NodeExecutor,
  TodoNodeResult,
  ExecutionReport,
  NodeStatus,
  BudgetConfig,
  BudgetStatus,
  RouteRule,
  RouteCondition,
  RouteAction,
  RoutingDecision,
  RouteHandler,
} from "./todo/types.js";
export { parseTodoGraph } from "./todo/parser.js";
export { updateStatus, readStatuses } from "./todo/status.js";
export { generateReport } from "./todo/report.js";
export type { GenerateReportOptions } from "./todo/report.js";
export { runOrchestrator, runOrchestratorFromMarkdown } from "./todo/orchestrator.js";
export { createBudget, updateBudget, recordRetry, checkBudget } from "./todo/budget.js";
export { parseMarkdownRoutes, resolveRouting } from "./todo/routing.js";

// Design Arena.
export type {
  SubProblem,
  AgentPersona,
  Solution,
  Critique,
  CritiqueResult,
  FusedDecision,
  SynthesisResult,
  ArenaConfig,
  ArenaState,
  LLMProvider,
  PerspectiveSuggestion,
  PerspectivesResult,
  ArenaResult,
} from "./arena/types.js";
export {
  getCoreAgentsFromConstitution,
  AGENT_SYSTEM_PROMPTS,
  CRITIC_PROMPT,
  SYNTHESIZER_PROMPT,
  SYNTHESIZE_ALL_PROMPT,
} from "./arena/agent-pool.js";
export { runArena } from "./arena/orchestrator.js";
export { suggestPerspectives } from "./arena/perspectives.js";
export { formatDebateSummary } from "./arena/debate-summary.js";
export { createLLMProvider, createCLILLMProvider } from "./arena/llm-provider.js";

// Design Constitution.
export type {
  ArchitecturePrinciple,
  RubricDimension,
  AgentPoolEntry,
  Constitution,
} from "./constitution/types.js";
export { createDefaultConstitution } from "./constitution/defaults.js";

// High-level pipeline entry.
export { runPipeline } from "./pipeline.js";
export type { PipelineOptions, PipelineResult } from "./pipeline.js";

// Pipeline Trace.
export type { TraceOptions, RunSummary } from "./trace/types.js";
export { savePipelineIndex, saveArenaTrace, saveTodoTrace, appendToIndex } from "./trace/store.js";
