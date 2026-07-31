import type { GraphState } from "../graph/types.js";

/**
 * The output of a single lens agent (value, ability, or pattern).
 * Mirrors the schema defined in reflection-protocol.md.
 */
export interface LensOutput {
  lens: "value" | "ability" | "pattern";
  segments: { label: string; topic: string; emotional_tone: string; signal_strength: "high" | "medium" | "low" }[];
  focus_segments: string[];
  summary: string;
  status: "passed" | "degraded" | "failed";
  [key: string]: unknown;
}

/** Value lens specific output. */
export interface ValueLensOutput extends LensOutput {
  lens: "value";
  candidate_values: { key: string; score: number; evidence: string }[];
  attraction_signals: { topic: string; confidence: number }[];
  emotional_spikes: { moment: string; emotion: string; trigger: string }[];
}

/** Ability lens specific output. */
export interface AbilityLensOutput extends LensOutput {
  lens: "ability";
  demonstrated_abilities: { ability: string; evidence: string }[];
  emerging_edges: { edge: string; confidence: number }[];
  new_connections: { domains: string[]; insight: string }[];
}

/** Pattern lens specific output. */
export interface PatternLensOutput extends LensOutput {
  lens: "pattern";
  identified_patterns: { pattern: string; occurrences: number }[];
  abstraction_layers: { case: string; pattern: string; principle: string }[];
  cross_domain_connections: { domains: string[]; thread: string }[];
  energy_signature: { energizing: string[]; draining: string[] };
  recurring_dilemmas: string[];
  decision_heuristics: { context: string; rule: string }[];
}

/** Adversary verdict over a single finding. */
export interface AdversaryVerdict {
  signal: string;
  verdict: "confirmed" | "uncertain" | "rejected";
  reasoning: string;
  alternative_framing?: string;
  perspective_switch?: string;
}

/** Full adversary output. */
export interface AdversaryOutput {
  verdicts: AdversaryVerdict[];
  action_experiments: { insight: string; rule: string; verify: string }[];
  deep_dive_candidates: string[];
  filtered_signals: string[];
  overall_quality_score: number;
  surviving_signals_summary: string;
}

/** A proposed diff to user DNA. */
export interface ProposedDiff {
  section: "values" | "beliefs" | "criteria" | "preferences";
  action: "add" | "modify" | "remove";
  target: string;
  value: unknown;
  rationale: string;
}

/** Synthesize output. */
export interface SynthesizeOutput {
  proposed_diffs: ProposedDiff[];
  action_experiments: { insight: string; rule: string; verify: string }[];
  summary: string;
  degraded_lenses: string[];
}

/** Result of the validation gate: number of lenses that passed. */
export type GateResult = "3/3" | "2/3" | "1/3" | "0/3";

/**
 * Reflection graph state — extends the generic graph state with
 * reflection-specific data.
 */
export interface ReflectionState extends GraphState {
  // --- Input data ---
  userDNA: Record<string, unknown>;
  reflections: Record<string, unknown>[];
  records: Record<string, unknown>[];
  transcript: string;

  // --- Lens outputs ---
  lensOutputs: Record<string, LensOutput>;

  // --- Gate ---
  gateResult: GateResult;

  // --- Adversary ---
  adversaryOutput: AdversaryOutput | null;

  // --- Synthesize ---
  proposedDiffs: ProposedDiff[];
  acceptedDiffs: ProposedDiff[];

  // --- Cycle tracking ---
  cycleCount: number;

  // --- Retry feedback (injected by retry module) ---
  _feedback?: Record<string, unknown>;
}

/** Create a fresh, empty reflection state. */
export function createReflectionState(overrides: Partial<ReflectionState> = {}): ReflectionState {
  return {
    checkpoints: [],
    nodeResults: {},
    status: "running",
    userDNA: {},
    reflections: [],
    records: [],
    transcript: "",
    lensOutputs: {},
    gateResult: "0/3",
    adversaryOutput: null,
    proposedDiffs: [],
    acceptedDiffs: [],
    cycleCount: 0,
    ...overrides,
  };
}
