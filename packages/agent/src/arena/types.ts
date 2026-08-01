// No imports — standalone types for the Design Arena.

/** Classification of a sub-problem that may need design debate. */
export type SubProblemType =
  | "tech_selection"
  | "cross_module"
  | "critical_path"
  | "unknown";

/** A sub-problem identified by the Gap Detector. */
export interface SubProblem {
  /** Unique identifier within the arena run. */
  id: string;
  /** Short human-readable title. */
  title: string;
  /** Description extracted from the plan. */
  description: string;
  /** Type classification — drives which extension agents are dispatched. */
  type: SubProblemType;
  /** How uncertain this sub-problem appears to be. */
  uncertainty: "high" | "medium";
  /** The section of the plan this was extracted from (for context). */
  sourceSection: string;
}

/** Agent personas available in the arena. */
export type AgentPersona =
  | "speed"
  | "maintain"
  | "minimal"
  | "perf"
  | "secure"
  | "scalable";

/** A single solution from one agent for one sub-problem. */
export interface Solution {
  /** Which agent produced this solution. */
  persona: AgentPersona;
  /** Which sub-problem this addresses. */
  problemId: string;
  /** The agent's proposed approach. */
  proposal: string;
  /** Scores per rubric dimension (dimension name → 0-100 score). */
  scores: Record<string, number>;
  /** Why this approach was chosen over alternatives. */
  rationale: string;
}

/** One critique of one solution. */
export interface Critique {
  /** Index into the solutions array. */
  solutionPersona: AgentPersona;
  /** Weaknesses found in this solution. */
  weaknesses: string[];
  /** How severe the weaknesses are. */
  severity: "blocker" | "major" | "minor";
}

/** The critic's full output for one sub-problem. */
export interface CritiqueResult {
  problemId: string;
  critiques: Critique[];
  /** Whether the debate was sufficient or needs more rounds. */
  needsMoreDebate: boolean;
  /** If more debate needed, what specific aspect to debate. */
  debateFocus?: string;
}

/** One fused decision from the synthesizer. */
export interface FusedDecision {
  problemId: string;
  problemTitle: string;
  /** Which approach was chosen (persona name). */
  chosenApproach: AgentPersona;
  /** The final design text. */
  decision: string;
  /** Why this was chosen over alternatives. */
  reasoning: string;
}

/** The synthesizer's full output. */
export interface SynthesisResult {
  decisions: FusedDecision[];
  /** Complete revised plan.md content. */
  revisedPlan: string;
  /** Generated todo.md content (TODO Graph format). */
  todoMarkdown: string;
}

/** Static validation check result. */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ location: string; message: string }>;
  warnings: string[];
}

/** Configuration for an arena run. */
export interface ArenaConfig {
  /** Max recursive battle depth (default 3). */
  maxDepth: number;
  /** Max critique cycles per sub-problem (default 2). */
  maxCritiqueCycles: number;
  /** Rubric dimensions with weights (dimension → weight). */
  rubric: Record<string, number>;
}

/** Runtime state of an arena run. */
export interface ArenaState {
  config: ArenaConfig;
  /** Original plan content. */
  originalPlan: string;
  /** Detected sub-problems. */
  subProblems: SubProblem[];
  /** Solutions per sub-problem (problemId → solutions). */
  solutions: Map<string, Solution[]>;
  /** Critique results per sub-problem. */
  critiques: Map<string, CritiqueResult>;
  /** Depth counter for recursive battles. */
  currentDepth: number;
  /** Final synthesis result (null until complete). */
  synthesis: SynthesisResult | null;
  /** Validation result (null until complete). */
  validation: ValidationResult | null;
  /** Arena run status. */
  status: "running" | "completed" | "aborted";
}

/**
 * Abstract interface for dispatching LLM-driven agents.
 * The host environment (Claude Code, etc.) provides the implementation.
 */
export interface AgentProvider {
  /** Dispatch a solution agent for a sub-problem. */
  generateSolution(
    problem: SubProblem,
    persona: AgentPersona,
    context: { plan: string; rubric: Record<string, number> },
  ): Promise<Solution>;

  /** Run the critic over a set of solutions. */
  critique(
    problem: SubProblem,
    solutions: Solution[],
    context: { plan: string },
  ): Promise<CritiqueResult>;

  /** Synthesize a final design from all solutions and critiques. */
  synthesize(
    problem: SubProblem,
    solutions: Solution[],
    critique: CritiqueResult,
    context: { plan: string; rubric: Record<string, number> },
  ): Promise<FusedDecision>;

  /** Synthesize the overall plan from all sub-problem decisions. */
  synthesizeAll(
    originalPlan: string,
    decisions: FusedDecision[],
  ): Promise<{ revisedPlan: string; todoMarkdown: string }>;
}

/** Result of a complete arena run. */
export interface ArenaResult {
  state: ArenaState;
  /** Number of sub-problems battled. */
  problemsBattled: number;
  /** Number of recursive sub-battles. */
  recursiveBattles: number;
  /** Wall-clock duration. */
  durationMs: number;
}
