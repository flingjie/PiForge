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
  LLMProvider,
  ArenaResult,
} from "./arena/types.js";
export {
  getCoreAgentsFromConstitution,
  getExtensionsFromConstitution,
  getAgentsForFromConstitution,
  AGENT_SYSTEM_PROMPTS,
  CRITIC_PROMPT,
  SYNTHESIZER_PROMPT,
  SYNTHESIZE_ALL_PROMPT,
} from "./arena/agent-pool.js";
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
export { createDefaultConstitution } from "./constitution/defaults.js";
export { createProposal, applyProposal, serializeProposal, writeProposal, readProposals } from "./constitution/proposals.js";
