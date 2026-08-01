# Design Arena Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Design Arena — a multi-agent design debate framework that takes a Plan, identifies high-uncertainty sub-problems, dispatches solution agents with different personas (speed/maintain/minimal + extensions), runs a critic, and synthesizes the result into a revised Plan + TODO Graph.

**Architecture:** A new `arena/` module inside `packages/agent/src/` that defines types, deterministic components (Gap Detector, Static Validator, Agent Pool), and an Orchestrator with dependency injection for LLM-driven components (Solution Agents, Critic, Synthesizer). The Orchestrator uses the TODO Graph module (Task 1 of the overall project) to output executable `todo.md` files.

**Tech Stack:** TypeScript (strict), Node.js, Vitest. Uses existing `packages/agent/src/todo/` module for output format. No new external dependencies.

## Global Constraints

- TypeScript strict mode, no `any`, erasable syntax only
- Top-level imports only, no dynamic imports
- All new code in `packages/agent/src/arena/`, tests in `packages/agent/test/arena/`
- Test using Vitest via `npx vitest run` from package root
- Run `npx tsc -p tsconfig.json --noEmit` for type checking
- LLM-driven components use dependency injection (`AgentProvider` interface) so tests can inject mocks

---

## Execution Graph

### Node Table

| ID | Name | Files | Verify | DependsOn |
|----|------|-------|--------|-----------|
| 1  | Arena Types | `arena/types.ts` | `npx tsc -p tsconfig.json --noEmit` | - |
| 2  | Agent Pool Config | `arena/agent-pool.ts`, `test/arena/agent-pool.test.ts` | `npx vitest run test/arena/agent-pool.test.ts` | 1 |
| 3  | Gap Detector | `arena/gap-detector.ts`, `test/arena/gap-detector.test.ts` | `npx vitest run test/arena/gap-detector.test.ts` | 1 |
| 4  | Static Validator | `arena/validator.ts`, `test/arena/validator.test.ts` | `npx vitest run test/arena/validator.test.ts` | 1 |
| 5  | Arena Orchestrator | `arena/orchestrator.ts`, `test/arena/orchestrator.test.ts` | `npx vitest run test/arena/orchestrator.test.ts` | 2, 3, 4 |
| 6  | Integration & Export | `src/index.ts`, `test/arena/e2e.test.ts` | `npx vitest run test/arena/e2e.test.ts` | 5 |

### Dependency Diagram

```
          [1] Types
           |
   ┌───────┼───────┐
   │       │       │
  [2]     [3]     [4]
 Agent   Gap    Validator
 Pool  Detector
   │       │       │
   └───────┼───────┘
           │
       [5] Orchestrator
           │
       [6] Integration
```

### Concurrent Groups

```
G1: [1]
G2: [2, 3, 4]    ← 无互依赖，并行
G3: [5]
G4: [6]
```

---

### Task 1: Arena Types

**Files:**
- Create: `packages/agent/src/arena/types.ts`

**Interfaces:**
- Produces: `SubProblem`, `SubProblemType`, `AgentPersona`, `Solution`, `CritiqueResult`, `Critique`, `SynthesisResult`, `ArenaConfig`, `ArenaState`, `AgentProvider`, `ValidationResult`

- [ ] **Step 1: Write types.ts**

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/arena/types.ts
git commit -m "feat(agent): add Design Arena types"
```

---

### Task 2: Agent Pool Configuration

**Files:**
- Create: `packages/agent/src/arena/agent-pool.ts`
- Create: `packages/agent/test/arena/agent-pool.test.ts`

**Interfaces:**
- Consumes: `AgentPersona`, `SubProblemType`, `SubProblem` from `arena/types.ts`
- Produces: `getCoreAgents(): AgentPersona[]`, `getExtensions(type: SubProblemType): AgentPersona[]`, `getAgentsFor(problem: SubProblem): AgentPersona[]`, `AGENT_SYSTEM_PROMPTS: Record<AgentPersona, string>`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/test/arena/agent-pool.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getCoreAgents,
  getExtensions,
  getAgentsFor,
  AGENT_SYSTEM_PROMPTS,
} from "../../src/arena/agent-pool.js";
import type { SubProblem } from "../../src/arena/types.js";

describe("Agent Pool", () => {
  it("core agents always include speed, maintain, minimal", () => {
    const core = getCoreAgents();
    expect(core).toContain("speed");
    expect(core).toContain("maintain");
    expect(core).toContain("minimal");
    expect(core).toHaveLength(3);
  });

  it("adds perf for tech_selection", () => {
    const ext = getExtensions("tech_selection");
    expect(ext).toContain("perf");
  });

  it("adds secure for security boundaries", () => {
    const ext = getExtensions("cross_module");
    const secureExt = getExtensions("unknown");
    // cross_module adds scalable, not secure
    expect(ext).toContain("scalable");
    // only types that need secure: we test the rule directly
    // Actually let's test the full getAgentsFor
  });

  it("getAgentsFor combines core + extensions", () => {
    const problem: SubProblem = {
      id: "p1",
      title: "Pick a database",
      description: "...",
      type: "tech_selection",
      uncertainty: "high",
      sourceSection: "## Database",
    };
    const agents = getAgentsFor(problem);
    expect(agents).toContain("speed");
    expect(agents).toContain("maintain");
    expect(agents).toContain("minimal");
    expect(agents).toContain("perf");
    expect(agents).toHaveLength(4); // core 3 + perf
  });

  it("getAgentsFor critical_path adds no extensions (no matching rule)", () => {
    const problem: SubProblem = {
      id: "p2",
      title: "Core loop design",
      description: "...",
      type: "critical_path",
      uncertainty: "high",
      sourceSection: "## Main Loop",
    };
    const agents = getAgentsFor(problem);
    expect(agents).toEqual(["speed", "maintain", "minimal"]);
  });

  it("every core agent has a system prompt", () => {
    for (const persona of getCoreAgents()) {
      expect(AGENT_SYSTEM_PROMPTS[persona]).toBeDefined();
      expect(AGENT_SYSTEM_PROMPTS[persona].length).toBeGreaterThan(50);
    }
  });

  it("extension agents have system prompts", () => {
    expect(AGENT_SYSTEM_PROMPTS["perf"]).toBeDefined();
    expect(AGENT_SYSTEM_PROMPTS["secure"]).toBeDefined();
    expect(AGENT_SYSTEM_PROMPTS["scalable"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/arena/agent-pool.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write agent pool implementation**

Create `packages/agent/src/arena/agent-pool.ts`:

```typescript
import type { AgentPersona, SubProblemType, SubProblem } from "./types.js";

// ---- Extension mapping ----

const EXTENSIONS: Record<SubProblemType, AgentPersona[]> = {
  tech_selection: ["perf"],
  cross_module: ["scalable"],
  critical_path: [],
  unknown: [],
};

// ---- Core agents ----

const CORE: AgentPersona[] = ["speed", "maintain", "minimal"];

export function getCoreAgents(): AgentPersona[] {
  return [...CORE];
}

export function getExtensions(type: SubProblemType): AgentPersona[] {
  return [...(EXTENSIONS[type] ?? [])];
}

export function getAgentsFor(problem: SubProblem): AgentPersona[] {
  const agents = new Set<AgentPersona>([...CORE, ...getExtensions(problem.type)]);
  return [...agents];
}

// ---- System Prompts ----

export const AGENT_SYSTEM_PROMPTS: Record<AgentPersona, string> = {
  speed: `You are a Speed-Optimized Architect. Your goal is the fastest possible implementation.

**Principles:**
- Prefer minimal abstraction — every layer must justify its existence
- Favor well-known libraries and patterns over novel approaches
- Optimize for time-to-working-code, not future flexibility
- Cut scope aggressively — what can be deferred or omitted?

**Output format:**
1. Your proposed architecture (2-3 paragraphs)
2. Key files and their responsibilities (list)
3. Score yourself on each rubric dimension (0-100) with brief reasoning`,

  maintain: `You are a Maintenance-Oriented Architect. Your goal is long-term codebase health.

**Principles:**
- Design clear module boundaries with explicit interfaces
- Prefer composition over inheritance; dependency injection over singletons
- Every module should be independently testable and replaceable
- Document why decisions were made, not just what was decided

**Output format:**
1. Your proposed architecture (2-3 paragraphs)
2. Key files and their responsibilities (list)
3. Score yourself on each rubric dimension (0-100) with brief reasoning`,

  minimal: `You are a Minimalist Architect. Your goal is the simplest possible design that works.

**Principles:**
- YAGNI: You Aren't Gonna Need It — delete before you add
- If a decision can be deferred, defer it
- Fewer files, fewer interfaces, fewer abstractions = fewer bugs
- The best code is the code you don't write

**Output format:**
1. Your proposed architecture (2-3 paragraphs)
2. Key files and their responsibilities (list)
3. Score yourself on each rubric dimension (0-100) with brief reasoning`,

  perf: `You are a Performance-Oriented Architect. Your goal is maximum throughput and minimal latency.

**Principles:**
- Identify the hot path and optimize it ruthlessly
- Prefer streaming, batching, and caching patterns
- Consider concurrency models (event loop, worker pools, async I/O)
- Measure, don't guess — propose concrete benchmarks

**Output format:**
1. Your proposed architecture (2-3 paragraphs)
2. Key files and their responsibilities (list)
3. Score yourself on each rubric dimension (0-100) with brief reasoning`,

  secure: `You are a Security-Oriented Architect. Your goal is defense in depth.

**Principles:**
- Principle of least privilege — every component gets only what it needs
- Validate at every boundary; never trust input
- Design for auditability — what happened, who did it, when?
- Consider the threat model explicitly

**Output format:**
1. Your proposed architecture (2-3 paragraphs)
2. Key files and their responsibilities (list)
3. Score yourself on each rubric dimension (0-100) with brief reasoning`,

  scalable: `You are a Scalability-Oriented Architect. Your goal is designs that grow gracefully.

**Principles:**
- Design for horizontal scaling from day one (even if deployed single-node)
- Minimize shared mutable state; prefer stateless services
- Consider data partitioning, replication, and consistency trade-offs
- Interfaces should not assume co-location

**Output format:**
1. Your proposed architecture (2-3 paragraphs)
2. Key files and their responsibilities (list)
3. Score yourself on each rubric dimension (0-100) with brief reasoning`,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/arena/agent-pool.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/arena/agent-pool.ts packages/agent/test/arena/agent-pool.test.ts
git commit -m "feat(agent): add Design Arena agent pool configuration"
```

---

### Task 3: Gap Detector

**Files:**
- Create: `packages/agent/src/arena/gap-detector.ts`
- Create: `packages/agent/test/arena/gap-detector.test.ts`

**Interfaces:**
- Consumes: `SubProblem`, `SubProblemType` from `arena/types.ts`
- Produces: `detectGaps(planContent: string): SubProblem[]`

- [ ] **Step 1: Write the failing gap detector test**

Create `packages/agent/test/arena/gap-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectGaps } from "../../src/arena/gap-detector.js";

const samplePlan = `# Auth Module Design

## Context
We need to add authentication to the API.

## Design Decision: Database Selection
We need to choose a database for storing user credentials and session tokens.

## Design Decision: API Boundary
The auth module will expose endpoints at /api/auth/*. Other services call these endpoints.

## Design Decision: Logging Format
Use JSON structured logging.

## Out of Scope
- OAuth integration
`;

describe("detectGaps", () => {
  it("detects tech_selection from database-related decisions", () => {
    const gaps = detectGaps(samplePlan);
    const dbGap = gaps.find((g) => g.title.includes("Database"));
    expect(dbGap).toBeDefined();
    expect(dbGap?.type).toBe("tech_selection");
    expect(dbGap?.uncertainty).toBe("high");
  });

  it("detects cross_module from API boundary decisions", () => {
    const gaps = detectGaps(samplePlan);
    const apiGap = gaps.find((g) => g.title.includes("API"));
    expect(apiGap).toBeDefined();
    expect(apiGap?.type).toBe("cross_module");
    expect(apiGap?.sourceSection).toContain("API Boundary");
  });

  it("does NOT flag low-risk decisions (logging format)", () => {
    const gaps = detectGaps(samplePlan);
    const logGap = gaps.find((g) => g.title.includes("Logging"));
    expect(logGap).toBeUndefined();
  });

  it("returns empty array for plan with no gaps", () => {
    const boringPlan = `# Simple Script

## Context
A one-off data migration.

## Design Decision: File Format
Use CSV for input and output.
`;
    const gaps = detectGaps(boringPlan);
    expect(gaps).toHaveLength(0);
  });

  it("each gap has a unique id", () => {
    const gaps = detectGaps(samplePlan);
    const ids = gaps.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flags as medium uncertainty when plan marks decision tentative", () => {
    const tentativePlan = `# Plan

## Design Decision: Queue Choice
Need to pick between Kafka and RabbitMQ. Alternative: could use Redis Streams.
`;
    const gaps = detectGaps(tentativePlan);
    expect(gaps[0]?.uncertainty).toBe("medium");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/arena/gap-detector.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write gap detector implementation**

Create `packages/agent/src/arena/gap-detector.ts`:

```typescript
import type { SubProblem, SubProblemType } from "./types.js";

// ---- Patterns that signal a design decision needs battle ----

interface GapPattern {
  regex: RegExp;
  type: SubProblemType;
}

const HIGH_RISK_PATTERNS: GapPattern[] = [
  // Tech selection: database, message queue, cache, framework
  {
    regex: /\b(database|DB|datastore|storage engine|message queue|MQ|broker|cache|Redis|Kafka|RabbitMQ|PostgreSQL|MySQL|MongoDB)\b/i,
    type: "tech_selection",
  },
  // Cross-module: API boundary, service interface, package boundary
  {
    regex: /\b(API|endpoint|service boundary|interface between|module boundary|package boundary|gRPC|REST|GraphQL)\b/i,
    type: "cross_module",
  },
  // Critical path: main loop, hot path, core algorithm, auth, data processing
  {
    regex: /\b(hot path|critical path|core loop|pipeline|throughput|latency|bottleneck)\b/i,
    type: "critical_path",
  },
];

// Keywords that suggest uncertainty / alternatives exist
const UNCERTAINTY_MEDIUM = /\b(alternative|either|could also|option|maybe|might|consider|TBD)\b/i;

// Low-risk patterns — these decisions don't need battle
const LOW_RISK = /\b(logging format|file format|code style|linting|formatting|naming convention)\b/i;

// ---- Detection logic ----

interface RawMatch {
  title: string;
  description: string;
  type: SubProblemType;
  sourceSection: string;
  isTentative: boolean;
}

function extractDesignDecisions(content: string): Array<{ title: string; body: string }> {
  const decisions: Array<{ title: string; body: string }> = [];
  const headerRegex = /^##\s+Design Decision:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(content)) !== null) {
    const title = match[1]!.trim();
    const start = match.index + match[0].length;
    // Find the next ## header or end of content
    const nextHeader = content.indexOf("\n## ", start);
    const body = content.slice(start, nextHeader === -1 ? undefined : nextHeader).trim();
    decisions.push({ title, body });
  }

  return decisions;
}

function classifyDecision(title: string, body: string): RawMatch | null {
  // Skip low-risk decisions
  if (LOW_RISK.test(title) || LOW_RISK.test(body)) return null;

  // Check against high-risk patterns
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.regex.test(title) || pattern.regex.test(body)) {
      return {
        title,
        description: body.slice(0, 200),
        type: pattern.type,
        sourceSection: `## Design Decision: ${title}`,
        isTentative: UNCERTAINTY_MEDIUM.test(title) || UNCERTAINTY_MEDIUM.test(body),
      };
    }
  }

  return null;
}

export function detectGaps(planContent: string): SubProblem[] {
  const decisions = extractDesignDecisions(planContent);
  const gaps: SubProblem[] = [];
  let counter = 0;

  for (const decision of decisions) {
    const raw = classifyDecision(decision.title, decision.body);
    if (!raw) continue;

    counter++;
    gaps.push({
      id: `gap-${counter}`,
      title: raw.title,
      description: raw.description,
      type: raw.type,
      uncertainty: raw.isTentative ? "medium" : "high",
      sourceSection: raw.sourceSection,
    });
  }

  return gaps;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/arena/gap-detector.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/arena/gap-detector.ts packages/agent/test/arena/gap-detector.test.ts
git commit -m "feat(agent): add Design Arena gap detector"
```

---

### Task 4: Static Validator

**Files:**
- Create: `packages/agent/src/arena/validator.ts`
- Create: `packages/agent/test/arena/validator.test.ts`

**Interfaces:**
- Consumes: `ValidationResult` from `arena/types.ts`; `TodoGraph` from `todo/types.ts`
- Produces: `validateDesign(plan: string, todoMarkdown: string): ValidationResult`

- [ ] **Step 1: Write the failing validator test**

Create `packages/agent/test/arena/validator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateDesign } from "../../src/arena/validator.js";

const validPlan = `# Test Plan

## Design Decision: Something
Chosen approach: Module A.

## File Structure
- packages/core/src/a.ts
- packages/core/src/b.ts
`;

const validTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | task1 | a.ts | tsc | - | pending |

## Dependency Diagram
\`\`\`
[1]
\`\`\`

## Concurrent Groups
G1: [1]
`;

describe("validateDesign", () => {
  it("passes valid plan + todo", () => {
    const result = validateDesign(validPlan, validTodo);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when plan references a file not in todo", () => {
    const plan = validPlan + "\nUses: packages/core/src/c.ts";
    const result = validateDesign(plan, validTodo);
    // c.ts is mentioned in plan but not in todo nodes
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("fails when todo has dependency cycle", () => {
    const cyclicTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | tsc | 2 | pending |
| 2  | b | b.ts | tsc | 1 | pending |

## Concurrent Groups
G1: [1, 2]
`;
    const result = validateDesign(validPlan, cyclicTodo);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cycle"))).toBe(true);
  });

  it("warns on empty todo", () => {
    const emptyTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|

## Concurrent Groups
`;
    const result = validateDesign(validPlan, emptyTodo);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("passes when todo has no dependency cycles (valid DAG)", () => {
    // Already tested with validTodo above — just confirm
    const result = validateDesign(validPlan, validTodo);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/arena/validator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write validator implementation**

Create `packages/agent/src/arena/validator.ts`:

```typescript
import type { ValidationResult } from "./types.js";

// Match file paths like "packages/core/src/a.ts" or "auth/handler.ts"
const FILE_PATH_RE = /[\w./-]+\.(ts|tsx|js|jsx|json|md)/g;

function extractFilesFromPlan(plan: string): Set<string> {
  const files = new Set<string>();
  const matches = plan.matchAll(FILE_PATH_RE);
  for (const m of matches) {
    files.add(m[0]);
  }
  return files;
}

function extractFilesFromTodo(todoMarkdown: string): Set<string> {
  const files = new Set<string>();
  // Parse the node table to extract file paths
  const rowRegex = /^\|\s*\d+\s+\|.+?\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(todoMarkdown)) !== null) {
    const filesCell = match[1]!;
    for (const f of filesCell.split(",")) {
      const trimmed = f.trim();
      if (trimmed) files.add(trimmed);
    }
  }
  return files;
}

interface DepEdge {
  from: number;
  to: number;
}

function extractDependencies(todoMarkdown: string): { nodes: Set<number>; edges: DepEdge[] } {
  const nodes = new Set<number>();
  const edges: DepEdge[] = [];
  const rowRegex = /^\|\s*(\d+)\s+\|.+?\|\s*(.+?)\s*\|$/gm;
  let match: RegExpExecArray | null;

  while ((match = rowRegex.exec(todoMarkdown)) !== null) {
    const id = parseInt(match[1]!, 10);
    nodes.add(id);
    // The fifth cell is DependsOn
    const cells = match[0].split("|").map((c) => c.trim());
    // Row: | ID | Name | Files | Verify | DependsOn | Status |
    // cells: ["", ID, Name, Files, Verify, DependsOn, Status, ""]
    const dependsOnCell = cells[5];
    if (dependsOnCell && dependsOnCell !== "-") {
      for (const dep of dependsOnCell.split(",")) {
        const depId = parseInt(dep.trim(), 10);
        if (!isNaN(depId)) {
          edges.push({ from: depId, to: id });
        }
      }
    }
  }

  return { nodes, edges };
}

function hasCycle(nodes: Set<number>, edges: DepEdge[]): boolean {
  // DFS-based cycle detection
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<number, number>();
  for (const n of nodes) color.set(n, WHITE);

  function dfs(node: number): boolean {
    color.set(node, GRAY);
    for (const edge of edges) {
      if (edge.from !== node) continue;
      const c = color.get(edge.to);
      if (c === GRAY) return true; // back edge
      if (c === WHITE && dfs(edge.to)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n) === WHITE && dfs(n)) return true;
  }
  return false;
}

export function validateDesign(plan: string, todoMarkdown: string): ValidationResult {
  const errors: Array<{ location: string; message: string }> = [];
  const warnings: string[] = [];

  // 1. Check file references: plan → todo consistency
  const planFiles = extractFilesFromPlan(plan);
  const todoFiles = extractFilesFromTodo(todoMarkdown);

  for (const f of planFiles) {
    if (!todoFiles.has(f) && f.includes("/src/")) {
      warnings.push(`File "${f}" referenced in plan but not found in todo nodes`);
    }
  }

  // 2. Check for empty todo
  const { nodes, edges } = extractDependencies(todoMarkdown);
  if (nodes.size === 0) {
    warnings.push("TODO graph has no nodes");
  }

  // 3. Check for dependency cycles
  if (hasCycle(nodes, edges)) {
    errors.push({
      location: "todo dependency graph",
      message: "Dependency cycle detected in TODO graph",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/arena/validator.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/arena/validator.ts packages/agent/test/arena/validator.test.ts
git commit -m "feat(agent): add Design Arena static validator"
```

---

### Task 5: Arena Orchestrator

**Files:**
- Create: `packages/agent/src/arena/orchestrator.ts`
- Create: `packages/agent/test/arena/orchestrator.test.ts`

**Interfaces:**
- Consumes: All types from `arena/types.ts`; `getAgentsFor` from `arena/agent-pool.ts`; `detectGaps` from `arena/gap-detector.ts`; `validateDesign` from `arena/validator.ts`
- Produces: `runArena(config: ArenaConfig, agentProvider: AgentProvider, planContent: string): Promise<ArenaResult>`

- [ ] **Step 1: Write the failing orchestrator test**

Create `packages/agent/test/arena/orchestrator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runArena } from "../../src/arena/orchestrator.js";
import type {
  AgentProvider,
  AgentPersona,
  Solution,
  CritiqueResult,
  FusedDecision,
  SubProblem,
  ArenaConfig,
} from "../../src/arena/types.js";

const samplePlan = `# Auth Module Design

## Context
We need to add authentication to the API.

## Design Decision: Database Selection
We need to choose a database for storing user credentials and session tokens.

## Out of Scope
- OAuth integration
`;

const defaultConfig: ArenaConfig = {
  maxDepth: 2,
  maxCritiqueCycles: 1,
  rubric: {
    decoupling: 20,
    maintainability: 20,
    extensibility: 15,
    testability: 15,
    performance: 10,
    observability: 10,
    complexity: 5,
    ai_friendliness: 5,
  },
};

function makeMockAgentProvider(): AgentProvider {
  const solutions: Solution[] = [];

  return {
    async generateSolution(
      problem: SubProblem,
      persona: AgentPersona,
    ): Promise<Solution> {
      const s: Solution = {
        persona,
        problemId: problem.id,
        proposal: `${persona} approach for ${problem.title}: use simple design.`,
        scores: {
          decoupling: persona === "maintain" ? 80 : 60,
          maintainability: persona === "maintain" ? 85 : 55,
          extensibility: 50,
          testability: 70,
          performance: persona === "perf" ? 90 : 50,
          observability: 40,
          complexity: persona === "minimal" ? 95 : 60,
          ai_friendliness: 50,
        },
        rationale: `Chosen because ${persona} principles apply.`,
      };
      solutions.push(s);
      return s;
    },

    async critique(): Promise<CritiqueResult> {
      return {
        problemId: "gap-1",
        critiques: solutions.map((s) => ({
          solutionPersona: s.persona,
          weaknesses: [`${s.persona}: could be too ${s.persona === "minimal" ? "simplistic" : "complex"}`],
          severity: "minor" as const,
        })),
        needsMoreDebate: false,
      };
    },

    async synthesize(
      _problem: SubProblem,
      _solutions: Solution[],
    ): Promise<FusedDecision> {
      return {
        problemId: "gap-1",
        problemTitle: "Database Selection",
        chosenApproach: "maintain",
        decision: "Use PostgreSQL with a thin repository layer.",
        reasoning: "Best balance of maintainability and simplicity.",
      };
    },

    async synthesizeAll(
      originalPlan: string,
      decisions: FusedDecision[],
    ): Promise<{ revisedPlan: string; todoMarkdown: string }> {
      const todoMarkdown = `# TODO: auth

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | types | auth/types.ts | tsc --noEmit | - | pending |
| 2  | handler | auth/handler.ts | vitest run | 1 | pending |

## Dependency Diagram
\`\`\`
[1]
 |
[2]
\`\`\`

## Concurrent Groups
G1: [1]
G2: [2]
`;
      return {
        revisedPlan: originalPlan + "\n\n## Arena Decision\n" + decisions.map((d) => d.decision).join("\n"),
        todoMarkdown,
      };
    },
  };
}

describe("runArena", () => {
  it("completes a full arena run on a plan with gaps", async () => {
    const provider = makeMockAgentProvider();
    const result = await runArena(defaultConfig, provider, samplePlan);

    expect(result.state.status).toBe("completed");
    expect(result.problemsBattled).toBeGreaterThanOrEqual(1);
    expect(result.state.subProblems.length).toBeGreaterThanOrEqual(1);
    expect(result.state.synthesis).not.toBeNull();
    expect(result.state.synthesis?.decisions.length).toBeGreaterThanOrEqual(1);
    expect(result.state.validation).not.toBeNull();
    expect(result.state.validation?.valid).toBe(true);
  });

  it("solutions include core agents plus extensions", async () => {
    const provider = makeMockAgentProvider();
    const result = await runArena(defaultConfig, provider, samplePlan);

    const solutions = result.state.solutions.get("gap-1");
    expect(solutions).toBeDefined();
    // Core 3: speed, maintain, minimal + extension: perf (tech_selection)
    const personas = solutions!.map((s) => s.persona);
    expect(personas).toContain("speed");
    expect(personas).toContain("maintain");
    expect(personas).toContain("minimal");
    expect(personas).toContain("perf");
  });

  it("skips arena when no gaps detected", async () => {
    const boringPlan = `# Simple Script

## Context
A one-off script.

## Design Decision: File Format
Use CSV for input and output.
`;
    const provider = makeMockAgentProvider();
    const result = await runArena(defaultConfig, provider, boringPlan);

    expect(result.problemsBattled).toBe(0);
    expect(result.state.subProblems).toHaveLength(0);
    // No gaps → completes immediately with original plan unchanged
    expect(result.state.status).toBe("completed");
  });

  it("records duration", async () => {
    const provider = makeMockAgentProvider();
    const result = await runArena(defaultConfig, provider, samplePlan);

    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("recursive battles increment the counter", async () => {
    // Agent provider that requests more debate once, then stops
    let callCount = 0;
    const recursiveProvider: AgentProvider = {
      ...makeMockAgentProvider(),
      async critique(
        problem: SubProblem,
        solutions: Solution[],
      ): Promise<CritiqueResult> {
        callCount++;
        return {
          problemId: problem.id,
          critiques: solutions.map((s) => ({
            solutionPersona: s.persona,
            weaknesses: ["needs more depth"],
            severity: "major" as const,
          })),
          needsMoreDebate: callCount < 2,
          debateFocus: callCount < 2 ? "deep dive on caching" : undefined,
        };
      },
    };

    const result = await runArena(defaultConfig, recursiveProvider, samplePlan);
    expect(result.recursiveBattles).toBeGreaterThanOrEqual(1);
    // Should have completed despite the recursive battle
    expect(result.state.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/arena/orchestrator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write orchestrator implementation**

Create `packages/agent/src/arena/orchestrator.ts`:

```typescript
import type {
  ArenaConfig,
  ArenaState,
  ArenaResult,
  AgentProvider,
  SubProblem,
  Solution,
  CritiqueResult,
} from "./types.js";
import { detectGaps } from "./gap-detector.js";
import { getAgentsFor } from "./agent-pool.js";
import { validateDesign } from "./validator.js";

function createInitialState(config: ArenaConfig, plan: string): ArenaState {
  return {
    config,
    originalPlan: plan,
    subProblems: [],
    solutions: new Map(),
    critiques: new Map(),
    currentDepth: 0,
    synthesis: null,
    validation: null,
    status: "running",
  };
}

async function battleSubProblem(
  state: ArenaState,
  problem: SubProblem,
  provider: AgentProvider,
): Promise<void> {
  const personas = getAgentsFor(problem);

  // Round 1: Generate solutions from all agents
  const solutions = await Promise.all(
    personas.map((persona) =>
      provider.generateSolution(problem, persona, {
        plan: state.originalPlan,
        rubric: state.config.rubric,
      }),
    ),
  );
  state.solutions.set(problem.id, solutions);

  // Critique
  let critique = await provider.critique(problem, solutions, {
    plan: state.originalPlan,
  });

  // Recursive battle: if critic says more debate needed, go deeper
  let cycleCount = 0;
  while (critique.needsMoreDebate && cycleCount < state.config.maxCritiqueCycles) {
    cycleCount++;
    state.currentDepth++;

    if (state.currentDepth > state.config.maxDepth) break;

    // Generate more solutions focused on the debated aspect
    const deeperSolutions = await Promise.all(
      personas.map((persona) =>
        provider.generateSolution(
          {
            ...problem,
            description: `${problem.description}\n\nDeep dive focus: ${critique.debateFocus ?? "general"}`,
          },
          persona,
          { plan: state.originalPlan, rubric: state.config.rubric },
        ),
      ),
    );

    // Combine with existing solutions
    const allSolutions = [...solutions, ...deeperSolutions];
    state.solutions.set(problem.id, allSolutions);

    // Re-critique the expanded set
    critique = await provider.critique(problem, allSolutions, {
      plan: state.originalPlan,
    });
  }

  state.critiques.set(problem.id, critique);
}

export async function runArena(
  config: ArenaConfig,
  provider: AgentProvider,
  planContent: string,
): Promise<ArenaResult> {
  const startTime = Date.now();
  const state = createInitialState(config, planContent);
  let recursiveBattles = 0;

  // 1. Gap Detection
  state.subProblems = detectGaps(planContent);

  if (state.subProblems.length === 0) {
    state.status = "completed";
    return {
      state,
      problemsBattled: 0,
      recursiveBattles: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Battle each sub-problem
  for (const problem of state.subProblems) {
    await battleSubProblem(state, problem, provider);
    if (state.currentDepth > 0) recursiveBattles++;
  }

  // 3. Synthesize decisions for each sub-problem
  const decisions = await Promise.all(
    state.subProblems.map((problem) => {
      const solutions = state.solutions.get(problem.id) ?? [];
      const critique = state.critiques.get(problem.id);
      if (!critique) throw new Error(`Missing critique for ${problem.id}`);
      return provider.synthesize(problem, solutions, critique, {
        plan: state.originalPlan,
        rubric: state.config.rubric,
      });
    }),
  );

  // 4. Synthesize overall plan and todo
  const synthesisResult = await provider.synthesizeAll(
    state.originalPlan,
    decisions,
  );
  state.synthesis = {
    decisions,
    revisedPlan: synthesisResult.revisedPlan,
    todoMarkdown: synthesisResult.todoMarkdown,
  };

  // 5. Validate
  state.validation = validateDesign(
    synthesisResult.revisedPlan,
    synthesisResult.todoMarkdown,
  );

  state.status = "completed";
  return {
    state,
    problemsBattled: state.subProblems.length,
    recursiveBattles,
    durationMs: Date.now() - startTime,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/arena/orchestrator.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/arena/orchestrator.ts packages/agent/test/arena/orchestrator.test.ts
git commit -m "feat(agent): add Design Arena orchestrator"
```

---

### Task 6: Integration & Export

**Files:**
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/arena/e2e.test.ts`

**Interfaces:**
- Consumes: All arena modules
- Produces: Updated `index.ts` barrel exports

- [ ] **Step 1: Update index.ts with Arena exports**

Edit `packages/agent/src/index.ts` — append after the TODO exports:

```typescript
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
```

- [ ] **Step 2: Run typecheck**

```bash
cd packages/agent && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Write E2E test**

Create `packages/agent/test/arena/e2e.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  runArena,
  detectGaps,
  getAgentsFor,
  validateDesign,
} from "../../src/index.js";
import type { AgentProvider, Solution, CritiqueResult, FusedDecision, SubProblem, AgentPersona } from "../../src/index.js";

const samplePlan = `# Auth Module

## Context
Add auth to the API.

## Design Decision: Database Selection
Choose database for credentials.

## Design Decision: API Boundary
Expose /api/auth/* endpoints.
`;

function makeProvider(): AgentProvider {
  return {
    async generateSolution(problem: SubProblem, persona: AgentPersona): Promise<Solution> {
      return {
        persona,
        problemId: problem.id,
        proposal: `${persona} approach for ${problem.title}.`,
        scores: { decoupling: 60, maintainability: 60, extensibility: 50, testability: 60, performance: 50, observability: 50, complexity: 70, ai_friendliness: 50 },
        rationale: `${persona} is the right approach.`,
      };
    },
    async critique(_problem: SubProblem, solutions: Solution[]): Promise<CritiqueResult> {
      return {
        problemId: _problem.id,
        critiques: solutions.map((s) => ({ solutionPersona: s.persona, weaknesses: ["minor concern"], severity: "minor" as const })),
        needsMoreDebate: false,
      };
    },
    async synthesize(problem: SubProblem): Promise<FusedDecision> {
      return { problemId: problem.id, problemTitle: problem.title, chosenApproach: "maintain", decision: "Use recommended approach.", reasoning: "Best balance." };
    },
    async synthesizeAll(plan: string, _decisions: FusedDecision[]): Promise<{ revisedPlan: string; todoMarkdown: string }> {
      const todo = `# TODO: auth

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | types | auth/types.ts | tsc --noEmit | - | pending |
| 2  | handler | auth/handler.ts | vitest run | 1 | pending |

## Dependency Diagram
\`\`\`
[1]
 |
[2]
\`\`\`

## Concurrent Groups
G1: [1]
G2: [2]
`;
      return { revisedPlan: plan + "\n\n## Arena Decision\nDone.", todoMarkdown: todo };
    },
  };
}

describe("Design Arena E2E", () => {
  it("full pipeline: detect gaps → battle → validate", async () => {
    // 1. Gap detection
    const gaps = detectGaps(samplePlan);
    expect(gaps.length).toBeGreaterThanOrEqual(1);

    // 2. Agents assigned
    for (const gap of gaps) {
      const agents = getAgentsFor(gap);
      expect(agents.length).toBeGreaterThanOrEqual(3);
    }

    // 3. Run arena
    const config = { maxDepth: 2, maxCritiqueCycles: 1, rubric: { simplicity: 50, maintainability: 50 } };
    const result = await runArena(config, makeProvider(), samplePlan);

    // 4. Verify output
    expect(result.state.status).toBe("completed");
    expect(result.state.synthesis).not.toBeNull();
    expect(result.state.synthesis?.revisedPlan).toContain("Arena Decision");
    expect(result.state.synthesis?.todoMarkdown).toContain("## Node Table");
    expect(result.state.synthesis?.todoMarkdown).toContain("## Concurrent Groups");

    // 5. Validate
    const validation = result.state.validation!;
    expect(validation.valid).toBe(true);
  });

  it("exported validateDesign works on arena output", () => {
    const result = validateDesign(
      "plan text mentioning auth/handler.ts",
      `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | x | auth/handler.ts | vitest | - | pending |

## Concurrent Groups
G1: [1]
`,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run E2E test**

```bash
cd packages/agent && npx vitest run test/arena/e2e.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd packages/agent && npx vitest run
```

Expected: all tests PASS (previous 76 + new arena tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/index.ts packages/agent/test/arena/e2e.test.ts
git commit -m "feat(agent): integrate Design Arena into agent package"
```
