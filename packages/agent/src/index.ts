// Graph engine.
export type {
  GraphNode,
  GraphState,
  GraphConfig,
  NodeInput,
  NodeResult,
  Checkpoint,
} from "./graph/types.js";
export { DEFAULT_GRAPH_CONFIG } from "./graph/types.js";
export { runGraph } from "./graph/runner.js";
export { parallel } from "./graph/concurrency.js";
export { saveCheckpoint, restoreCheckpoint, shouldCheckpoint } from "./graph/checkpoint.js";
export { withRetry, RetryExhaustedError } from "./graph/retry.js";

// TODO Graph & Orchestrator.
export type {
  TodoNode,
  TodoGraph,
  TodoConfig,
  NodeExecutor,
  TodoNodeResult,
  ExecutionReport,
} from "./todo/types.js";
export { parseTodoGraph } from "./todo/parser.js";
export { updateStatus, readStatuses } from "./todo/status.js";
export { generateReport } from "./todo/report.js";
export { runOrchestrator } from "./todo/orchestrator.js";

// Reflection protocol.
export type {
  ReflectionState,
  LensOutput,
  ValueLensOutput,
  AbilityLensOutput,
  PatternLensOutput,
  AdversaryVerdict,
  AdversaryOutput,
  ProposedDiff,
  SynthesizeOutput,
  GateResult,
} from "./reflection/state.js";
export { createReflectionState } from "./reflection/state.js";
export { runReflectionGraph } from "./reflection/graph.js";
export { checkSignalDensity, evaluateGate } from "./reflection/validation-gate.js";
export { writeReflection, updateDNA } from "./reflection/tools.js";

// Reflection nodes.
export { valueLensNode } from "./reflection/nodes/value-lens.js";
export { abilityLensNode } from "./reflection/nodes/ability-lens.js";
export { patternLensNode } from "./reflection/nodes/pattern-lens.js";
export { adversaryNode } from "./reflection/nodes/adversary.js";
export { synthesizeNode } from "./reflection/nodes/synthesize.js";

// Design Arena.
export type {
  SubProblem,
  SubProblemType,
  AgentPersona,
  Solution,
  Critique,
  CritiqueResult,
  FusedDecision,
  SynthesisResult,
  ValidationResult,
  ArenaConfig,
  ArenaState,
  AgentProvider,
  ArenaResult,
} from "./arena/types.js";
export { getCoreAgents, getExtensions, getAgentsFor, AGENT_SYSTEM_PROMPTS } from "./arena/agent-pool.js";
export { detectGaps } from "./arena/gap-detector.js";
export { validateDesign } from "./arena/validator.js";
export { runArena } from "./arena/orchestrator.js";

// Design Constitution.
export type {
  ArchitecturePrinciple,
  RubricDimension,
  AgentPoolEntry,
  AgentPoolRule,
  Constitution,
  RubricOverride,
  AmendmentProposal,
} from "./constitution/types.js";
export { loadConstitution, loadConstitutionFromFile } from "./constitution/loader.js";
export { mergeRubric, toArenaConfig } from "./constitution/merger.js";
export { createProposal, applyProposal, serializeProposal } from "./constitution/proposals.js";
