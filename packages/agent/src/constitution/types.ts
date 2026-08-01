/** A single architecture principle (e.g. "Simple > Clever"). */
export interface ArchitecturePrinciple {
  /** Order number (1-based). */
  order: number;
  /** Short statement of the principle. */
  statement: string;
  /** Optional elaboration. */
  description?: string;
}

/** A rubric evaluation dimension. */
export interface RubricDimension {
  /** Short kebab-case key, e.g. "decoupling". */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Default weight (0-100). All weights are relative; Arena normalizes them. */
  defaultWeight: number;
  /** What this dimension measures. */
  description: string;
}

/** A single entry in the agent pool (one persona). */
export interface AgentPoolEntry {
  /** Persona identifier. */
  persona: string;
  /** Type: "core" (always dispatched) or "extension" (dispatched by rule). */
  type: "core" | "extension";
  /** Short description of the persona's design philosophy. */
  description: string;
}

/** A dispatch rule for extension agents. */
export interface AgentPoolRule {
  /** Sub-problem type that triggers this extension. */
  subProblemType: string;
  /** Personas to add for this sub-problem type. */
  addPersonas: string[];
}

/** The complete Design Constitution, as parsed from constitution.md. */
export interface Constitution {
  /** Semantic version of the constitution format. */
  version: number;
  /** Last modification timestamp. */
  updatedAt: string;
  /** Ordered architecture principles. */
  principles: ArchitecturePrinciple[];
  /** Rubric dimensions with default weights. */
  rubric: RubricDimension[];
  /** Agent pool entries (core + extension personas). */
  agentPool: AgentPoolEntry[];
  /** Dispatch rules for extension agents. */
  agentPoolRules: AgentPoolRule[];
}
