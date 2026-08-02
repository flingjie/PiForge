// No imports — standalone types for the Design Arena.

/** A sub-problem extracted from a plan's Design Decision sections. */
export interface SubProblem {
  id: string;
  title: string;
  description: string;
  sourceSection: string;
}

export type AgentPersona = string;

export interface Solution {
  persona: AgentPersona;
  problemId: string;
  proposal: string;
  scores: Record<string, number>;
  rationale: string;
}

export interface Critique {
  solutionPersona: AgentPersona;
  weaknesses: string[];
  severity: "blocker" | "major" | "minor";
}

export interface CritiqueResult {
  problemId: string;
  critiques: Critique[];
  needsMoreDebate: boolean;
  debateFocus?: string;
}

export interface FusedDecision {
  problemId: string;
  problemTitle: string;
  chosenApproach: AgentPersona;
  decision: string;
  reasoning: string;
}

export interface SynthesisResult {
  decisions: FusedDecision[];
  revisedPlan: string;
  todoMarkdown: string;
}

export interface ArenaConfig {
  maxDepth: number;
  maxCritiqueCycles: number;
  outputDir?: string;
}

export interface ArenaState {
  config: ArenaConfig;
  originalPlan: string;
  subProblems: SubProblem[];
  solutions: Map<string, Solution[]>;
  critiques: Map<string, CritiqueResult>;
  currentDepth: number;
  synthesis: SynthesisResult | null;
  status: "running" | "completed" | "aborted";
}

/** Single-method LLM provider. Arena owns all prompt construction and response parsing. */
export interface LLMProvider {
  complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export interface ArenaResult {
  state: ArenaState;
  problemsBattled: number;
  recursiveBattles: number;
  durationMs: number;
}

/** A suggested reviewer perspective for a decision point. */
export interface PerspectiveSuggestion {
  persona: string;
  reason: string;
}

/** LLM-generated perspective suggestions for a set of decision points. */
export interface PerspectivesResult {
  suggestions: Array<{
    decision: string;
    perspectives: PerspectiveSuggestion[];
  }>;
}
