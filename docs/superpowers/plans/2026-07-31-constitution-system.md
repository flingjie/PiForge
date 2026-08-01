# Constitution System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Design Constitution system — types, Markdown loader, rubric weight merger, and amendment proposal mechanism. The Constitution defines architecture principles, evaluation rubric dimensions with default weights, and agent pool rules shared across all Arena battles.

**Architecture:** A new `constitution/` module inside `packages/agent/src/` that defines types, parses `constitution.md` from `.claude/arena/`, merges Plan weight overrides with Constitution defaults, and manages amendment proposals. Integrates with the existing Arena module by providing typed Constitution objects to the Orchestrator.

**Tech Stack:** TypeScript (strict), Node.js, Vitest. Uses existing `packages/agent/src/arena/types.ts` for ArenaConfig integration.

## Global Constraints

- TypeScript strict mode, no `any`, erasable syntax only
- Top-level imports only, no dynamic imports
- All new code in `packages/agent/src/constitution/`, tests in `packages/agent/test/constitution/`
- Test using Vitest via `npx vitest run` from package root
- Run `npx tsc -p tsconfig.json --noEmit` for type checking

---

## Execution Graph

### Node Table

| ID | Name | Files | Verify | DependsOn |
|----|------|-------|--------|-----------|
| 1  | Constitution Types | `constitution/types.ts` | `npx tsc -p tsconfig.json --noEmit` | - |
| 2  | Loader | `constitution/loader.ts`, `test/constitution/loader.test.ts` | `npx vitest run test/constitution/loader.test.ts` | 1 |
| 3  | Merger | `constitution/merger.ts`, `test/constitution/merger.test.ts` | `npx vitest run test/constitution/merger.test.ts` | 1 |
| 4  | Amendment Proposals | `constitution/proposals.ts`, `test/constitution/proposals.test.ts` | `npx vitest run test/constitution/proposals.test.ts` | 1 |
| 5  | Integration & Export | `src/index.ts`, `constitution/index.ts` | `npx tsc -p tsconfig.json --noEmit && npx vitest run` | 2, 3, 4 |

### Dependency Diagram

```
          [1] Types
           |
   ┌───────┼───────┐
   │       │       │
  [2]     [3]     [4]
 Loader  Merger  Proposals
   │       │       │
   └───────┼───────┘
           │
       [5] Integration
```

### Concurrent Groups

```
G1: [1]
G2: [2, 3, 4]
G3: [5]
```

---

### Task 1: Constitution Types

**Files:**
- Create: `packages/agent/src/constitution/types.ts`

**Interfaces:**
- Produces: `ArchitecturePrinciple`, `RubricDimension`, `AgentPoolEntry`, `AgentPoolRule`, `Constitution`, `RubricOverride`, `AmendmentProposal`

- [ ] **Step 1: Write types.ts**

```typescript
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

/** A weight override for a single rubric dimension, from a Plan. */
export interface RubricOverride {
  /** Which dimension key to override. */
  dimensionKey: string;
  /** New weight to apply. */
  weight: number;
}

/** A proposed amendment to the Constitution. */
export interface AmendmentProposal {
  /** Unique proposal ID. */
  id: string;
  /** When this proposal was created. */
  proposedAt: string;
  /** What is being changed. */
  target: "principle" | "rubric" | "agent_pool" | "agent_rule";
  /** "add", "modify", or "remove". */
  action: "add" | "modify" | "remove";
  /** The proposed change, as a JSON-serializable value. */
  change: Record<string, unknown>;
  /** Why this change is proposed. */
  rationale: string;
  /** The Arena run that generated this proposal. */
  source: string;
  /** Current status. */
  status: "proposed" | "accepted" | "rejected";
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/constitution/types.ts
git commit -m "feat(agent): add Constitution types"
```

---

### Task 2: Loader

**Files:**
- Create: `packages/agent/src/constitution/loader.ts`
- Create: `packages/agent/test/constitution/loader.test.ts`

**Interfaces:**
- Consumes: `Constitution`, `ArchitecturePrinciple`, `RubricDimension`, `AgentPoolEntry`, `AgentPoolRule` from `constitution/types.ts`
- Produces: `loadConstitution(content: string): Constitution`, `loadConstitutionFromFile(path: string): Constitution`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/test/constitution/loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadConstitution } from "../../src/constitution/loader.js";

const sampleMd = `# Design Constitution

## Metadata
- version: 1
- updated: 2026-07-31

## Architecture Principles
1. Simple > Clever — Prefer straightforward solutions over clever ones.
2. Composition > Inheritance — Favor composition for code reuse.

## Rubric
| Key | Label | Weight | Description |
|-----|-------|--------|-------------|
| decoupling | Decoupling | 20 | Module independence |
| maintainability | Maintainability | 20 | Ease of future changes |
| performance | Performance | 10 | Throughput and latency |

## Agent Pool
### Core
| Persona | Description |
|---------|-------------|
| speed | Fastest implementation, minimal abstraction |
| maintain | Long-term maintenance, modularity |
| minimal | YAGNI, delete more than add |

### Extension Rules
| Sub-Problem Type | Add Personas |
|------------------|-------------|
| tech_selection | perf |
| cross_module | scalable |
`;

describe("loadConstitution", () => {
  it("parses version and timestamp", () => {
    const c = loadConstitution(sampleMd);
    expect(c.version).toBe(1);
    expect(c.updatedAt).toBe("2026-07-31");
  });

  it("parses architecture principles", () => {
    const c = loadConstitution(sampleMd);
    expect(c.principles).toHaveLength(2);
    expect(c.principles[0]).toMatchObject({
      order: 1,
      statement: "Simple > Clever",
      description: "Prefer straightforward solutions over clever ones.",
    });
  });

  it("parses rubric dimensions with weights", () => {
    const c = loadConstitution(sampleMd);
    expect(c.rubric).toHaveLength(3);
    expect(c.rubric[0]).toMatchObject({
      key: "decoupling",
      label: "Decoupling",
      defaultWeight: 20,
    });
  });

  it("parses core agent pool entries", () => {
    const c = loadConstitution(sampleMd);
    expect(c.agentPool).toHaveLength(3);
    expect(c.agentPool[0]).toMatchObject({
      persona: "speed",
      type: "core",
    });
  });

  it("parses extension rules", () => {
    const c = loadConstitution(sampleMd);
    expect(c.agentPoolRules).toHaveLength(2);
    expect(c.agentPoolRules[0]).toMatchObject({
      subProblemType: "tech_selection",
      addPersonas: ["perf"],
    });
  });

  it("returns defaults for missing sections", () => {
    const minimal = `# Design Constitution

## Metadata
- version: 1
`;
    const c = loadConstitution(minimal);
    expect(c.principles).toHaveLength(0);
    expect(c.rubric).toHaveLength(0);
    expect(c.agentPool).toHaveLength(0);
    expect(c.agentPoolRules).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/constitution/loader.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write loader implementation**

Create `packages/agent/src/constitution/loader.ts`:

```typescript
import { readFileSync } from "node:fs";
import type {
  Constitution,
  ArchitecturePrinciple,
  RubricDimension,
  AgentPoolEntry,
  AgentPoolRule,
} from "./types.js";

// ---- Metadata ----

const META_VERSION = /^- version:\s*(\d+)/m;
const META_UPDATED = /^- updated:\s*(.+)/m;

function parseMetadata(content: string): { version: number; updatedAt: string } {
  const v = content.match(META_VERSION);
  const d = content.match(META_UPDATED);
  return {
    version: v ? parseInt(v[1]!, 10) : 1,
    updatedAt: d ? d[1]!.trim() : new Date().toISOString().slice(0, 10),
  };
}

// ---- Principles ----

function parsePrinciples(content: string): ArchitecturePrinciple[] {
  const section = extractSection(content, "Architecture Principles");
  if (!section) return [];

  const principles: ArchitecturePrinciple[] = [];
  const lines = section.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.+?)(?:\s+—\s+(.+))?$/);
    if (!match) continue;
    principles.push({
      order: parseInt(match[1]!, 10),
      statement: match[2]!.trim(),
      description: match[3]?.trim(),
    });
  }
  return principles;
}

// ---- Rubric ----

function parseRubric(content: string): RubricDimension[] {
  const section = extractSection(content, "Rubric");
  if (!section) return [];

  return parseTable(section, (cells) => ({
    key: cells[0] ?? "",
    label: cells[1] ?? "",
    defaultWeight: parseInt(cells[2] ?? "0", 10),
    description: cells[3] ?? "",
  }));
}

// ---- Agent Pool ----

function parseAgentPool(content: string): AgentPoolEntry[] {
  const entries: AgentPoolEntry[] = [];

  // Core section
  const coreSection = extractSubSection(content, "Agent Pool", "Core");
  if (coreSection) {
    const core = parseTable(coreSection, (cells) => ({
      persona: cells[0] ?? "",
      type: "core" as const,
      description: cells[1] ?? "",
    }));
    entries.push(...core);
  }

  return entries;
}

function parseAgentPoolRules(content: string): AgentPoolRule[] {
  const section = extractSubSection(content, "Agent Pool", "Extension Rules");
  if (!section) return [];

  return parseTable(section, (cells) => ({
    subProblemType: cells[0] ?? "",
    addPersonas: (cells[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  }));
}

// ---- Helpers ----

function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = content.match(regex);
  return match ? match[1]!.trim() : null;
}

function extractSubSection(content: string, parentHeading: string, subHeading: string): string | null {
  const parent = extractSection(content, parentHeading);
  if (!parent) return null;
  const regex = new RegExp(`###\\s+${escapeRegex(subHeading)}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`, "i");
  const match = parent.match(regex);
  return match ? match[1]!.trim() : null;
}

function parseTable<T>(section: string, rowMapper: (cells: string[]) => T): T[] {
  const lines = section.split("\n");
  const results: T[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    // Skip header separator (|---|---|)
    if (/^\|[-|\s]+\|$/.test(trimmed)) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    if (cells.length > 0 && cells.some((c) => c.length > 0)) {
      results.push(rowMapper(cells));
    }
  }

  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Public API ----

export function loadConstitution(content: string): Constitution {
  const meta = parseMetadata(content);
  return {
    version: meta.version,
    updatedAt: meta.updatedAt,
    principles: parsePrinciples(content),
    rubric: parseRubric(content),
    agentPool: parseAgentPool(content),
    agentPoolRules: parseAgentPoolRules(content),
  };
}

export function loadConstitutionFromFile(path: string): Constitution {
  const content = readFileSync(path, "utf-8");
  return loadConstitution(content);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/constitution/loader.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/constitution/loader.ts packages/agent/test/constitution/loader.test.ts
git commit -m "feat(agent): add Constitution markdown loader"
```

---

### Task 3: Merger

**Files:**
- Create: `packages/agent/src/constitution/merger.ts`
- Create: `packages/agent/test/constitution/merger.test.ts`

**Interfaces:**
- Consumes: `Constitution`, `RubricDimension`, `RubricOverride` from `constitution/types.ts`
- Produces: `mergeRubric(constitution: Constitution, overrides: RubricOverride[]): RubricDimension[]`, `toArenaConfig(constitution: Constitution, overrides?: RubricOverride[]): ArenaConfig`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/test/constitution/merger.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mergeRubric, toArenaConfig } from "../../src/constitution/merger.js";
import type { Constitution, RubricOverride } from "../../src/constitution/types.js";

const sampleConstitution: Constitution = {
  version: 1,
  updatedAt: "2026-07-31",
  principles: [],
  rubric: [
    { key: "decoupling", label: "Decoupling", defaultWeight: 20, description: "..." },
    { key: "maintainability", label: "Maintainability", defaultWeight: 20, description: "..." },
    { key: "performance", label: "Performance", defaultWeight: 10, description: "..." },
  ],
  agentPool: [],
  agentPoolRules: [],
};

describe("mergeRubric", () => {
  it("returns defaults when no overrides", () => {
    const result = mergeRubric(sampleConstitution, []);
    expect(result[0]?.defaultWeight).toBe(20);
    expect(result[2]?.defaultWeight).toBe(10);
  });

  it("applies weight override", () => {
    const overrides: RubricOverride[] = [
      { dimensionKey: "performance", weight: 25 },
    ];
    const result = mergeRubric(sampleConstitution, overrides);
    const perf = result.find((r) => r.key === "performance");
    expect(perf?.defaultWeight).toBe(25);
  });

  it("leaves un-overridden dimensions unchanged", () => {
    const overrides: RubricOverride[] = [
      { dimensionKey: "performance", weight: 25 },
    ];
    const result = mergeRubric(sampleConstitution, overrides);
    const dec = result.find((r) => r.key === "decoupling");
    expect(dec?.defaultWeight).toBe(20);
  });

  it("ignores overrides for unknown dimensions", () => {
    const overrides: RubricOverride[] = [
      { dimensionKey: "nonexistent", weight: 99 },
    ];
    const result = mergeRubric(sampleConstitution, []);
    expect(result).toHaveLength(3);
  });

  it("returns new array (does not mutate input)", () => {
    const orig = sampleConstitution.rubric[0]!.defaultWeight;
    mergeRubric(sampleConstitution, [{ dimensionKey: "decoupling", weight: 99 }]);
    expect(sampleConstitution.rubric[0]!.defaultWeight).toBe(orig);
  });
});

describe("toArenaConfig", () => {
  it("converts to ArenaConfig with rubric weights", () => {
    const config = toArenaConfig(sampleConstitution);
    expect(config.rubric).toEqual({
      decoupling: 20,
      maintainability: 20,
      performance: 10,
    });
    expect(config.maxDepth).toBe(3);
    expect(config.maxCritiqueCycles).toBe(2);
  });

  it("applies overrides", () => {
    const config = toArenaConfig(sampleConstitution, [
      { dimensionKey: "performance", weight: 30 },
    ]);
    expect(config.rubric["performance"]).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/constitution/merger.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write merger implementation**

Create `packages/agent/src/constitution/merger.ts`:

```typescript
import type { Constitution, RubricDimension, RubricOverride } from "./types.js";
import type { ArenaConfig } from "../arena/types.js";

export function mergeRubric(
  constitution: Constitution,
  overrides: RubricOverride[],
): RubricDimension[] {
  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    overrideMap.set(o.dimensionKey, o.weight);
  }

  return constitution.rubric.map((dim) => {
    const overrideWeight = overrideMap.get(dim.key);
    if (overrideWeight !== undefined) {
      return { ...dim, defaultWeight: overrideWeight };
    }
    return { ...dim };
  });
}

export function toArenaConfig(
  constitution: Constitution,
  overrides: RubricOverride[] = [],
): ArenaConfig {
  const merged = mergeRubric(constitution, overrides);
  const rubric: Record<string, number> = {};
  for (const dim of merged) {
    rubric[dim.key] = dim.defaultWeight;
  }

  return {
    maxDepth: 3,
    maxCritiqueCycles: 2,
    rubric,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/constitution/merger.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/constitution/merger.ts packages/agent/test/constitution/merger.test.ts
git commit -m "feat(agent): add Constitution rubric merger"
```

---

### Task 4: Amendment Proposals

**Files:**
- Create: `packages/agent/src/constitution/proposals.ts`
- Create: `packages/agent/test/constitution/proposals.test.ts`

**Interfaces:**
- Consumes: `AmendmentProposal`, `Constitution` from `constitution/types.ts`
- Produces: `createProposal(target, action, change, rationale, source): AmendmentProposal`, `applyProposal(constitution: Constitution, proposal: AmendmentProposal): Constitution`, `serializeProposal(proposal: AmendmentProposal): string`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/test/constitution/proposals.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createProposal,
  applyProposal,
  serializeProposal,
} from "../../src/constitution/proposals.js";
import type { Constitution } from "../../src/constitution/types.js";

const sampleConstitution: Constitution = {
  version: 1,
  updatedAt: "2026-07-31",
  principles: [
    { order: 1, statement: "Simple > Clever" },
  ],
  rubric: [
    { key: "decoupling", label: "Decoupling", defaultWeight: 20, description: "..." },
  ],
  agentPool: [
    { persona: "speed", type: "core", description: "Fast" },
  ],
  agentPoolRules: [
    { subProblemType: "tech_selection", addPersonas: ["perf"] },
  ],
};

describe("createProposal", () => {
  it("creates a proposal with unique id", () => {
    const p1 = createProposal("rubric", "add", { key: "security" }, "Need security dimension", "arena-run-1");
    const p2 = createProposal("rubric", "add", { key: "latency" }, "Need latency dimension", "arena-run-2");
    expect(p1.id).not.toBe(p2.id);
  });

  it("sets status to proposed", () => {
    const p = createProposal("principle", "add", { statement: "New rule" }, "Because", "arena-1");
    expect(p.status).toBe("proposed");
    expect(p.target).toBe("principle");
    expect(p.action).toBe("add");
    expect(p.rationale).toBe("Because");
    expect(p.source).toBe("arena-1");
  });
});

describe("applyProposal", () => {
  it("adds a new principle", () => {
    const p = createProposal("principle", "add", { statement: "Test > Skip" }, "Rationale", "arena-1");
    const updated = applyProposal({ ...sampleConstitution, principles: [...sampleConstitution.principles] }, p);
    expect(updated.principles).toHaveLength(2);
    expect(updated.principles[1]?.statement).toBe("Test > Skip");
  });

  it("adds a new rubric dimension", () => {
    const p = createProposal("rubric", "add", { key: "security", label: "Security", defaultWeight: 15, description: "Safety" }, "Need it", "arena-1");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.rubric).toHaveLength(2);
    expect(updated.rubric[1]?.key).toBe("security");
  });

  it("modifies an existing principle", () => {
    const p = createProposal("principle", "modify", { order: 1, statement: "Simple >= Clever" }, "Updated", "arena-1");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.principles[0]?.statement).toBe("Simple >= Clever");
  });

  it("removes a rubric dimension", () => {
    const p = createProposal("rubric", "remove", { key: "decoupling" }, "Not needed", "arena-1");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.rubric).toHaveLength(0);
  });

  it("adds an agent pool entry", () => {
    const p = createProposal("agent_pool", "add", { persona: "security", type: "extension", description: "Security-focused" }, "Need security persona", "arena-2");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.agentPool).toHaveLength(2);
    expect(updated.agentPool[1]?.persona).toBe("security");
  });
});

describe("serializeProposal", () => {
  it("serializes to markdown", () => {
    const p = createProposal("rubric", "add", { key: "security", defaultWeight: 10 }, "Need security", "arena-1");
    const md = serializeProposal(p);
    expect(md).toContain("## Amendment Proposal");
    expect(md).toContain("security");
    expect(md).toContain("arena-1");
    expect(md).toContain("proposed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/constitution/proposals.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write proposals implementation**

Create `packages/agent/src/constitution/proposals.ts`:

```typescript
import type { AmendmentProposal, Constitution } from "./types.js";

let proposalCounter = 0;

export function createProposal(
  target: AmendmentProposal["target"],
  action: AmendmentProposal["action"],
  change: Record<string, unknown>,
  rationale: string,
  source: string,
): AmendmentProposal {
  proposalCounter++;
  return {
    id: `amend-${proposalCounter}-${Date.now()}`,
    proposedAt: new Date().toISOString(),
    target,
    action,
    change,
    rationale,
    source,
    status: "proposed",
  };
}

export function applyProposal(
  constitution: Constitution,
  proposal: AmendmentProposal,
): Constitution {
  const updated = { ...constitution };

  switch (proposal.target) {
    case "principle": {
      const principles = [...constitution.principles];
      if (proposal.action === "add") {
        principles.push(proposal.change as unknown as Constitution["principles"][number]);
      } else if (proposal.action === "modify") {
        const order = proposal.change.order as number;
        const idx = principles.findIndex((p) => p.order === order);
        if (idx >= 0) {
          principles[idx] = { ...principles[idx], ...(proposal.change as Record<string, unknown>) };
        }
      } else if (proposal.action === "remove") {
        const order = proposal.change.order as number;
        updated.principles = principles.filter((p) => p.order !== order);
        return updated;
      }
      updated.principles = principles;
      break;
    }

    case "rubric": {
      const rubric = [...constitution.rubric];
      if (proposal.action === "add") {
        rubric.push(proposal.change as unknown as Constitution["rubric"][number]);
      } else if (proposal.action === "modify") {
        const key = proposal.change.key as string;
        const idx = rubric.findIndex((r) => r.key === key);
        if (idx >= 0) {
          rubric[idx] = { ...rubric[idx], ...(proposal.change as Record<string, unknown>) };
        }
      } else if (proposal.action === "remove") {
        const key = proposal.change.key as string;
        updated.rubric = rubric.filter((r) => r.key !== key);
        return updated;
      }
      updated.rubric = rubric;
      break;
    }

    case "agent_pool": {
      const pool = [...constitution.agentPool];
      if (proposal.action === "add") {
        pool.push(proposal.change as unknown as Constitution["agentPool"][number]);
      } else if (proposal.action === "modify") {
        const persona = proposal.change.persona as string;
        const idx = pool.findIndex((a) => a.persona === persona);
        if (idx >= 0) {
          pool[idx] = { ...pool[idx], ...(proposal.change as Record<string, unknown>) };
        }
      } else if (proposal.action === "remove") {
        const persona = proposal.change.persona as string;
        updated.agentPool = pool.filter((a) => a.persona !== persona);
        return updated;
      }
      updated.agentPool = pool;
      break;
    }

    case "agent_rule": {
      const rules = [...constitution.agentPoolRules];
      if (proposal.action === "add") {
        rules.push(proposal.change as unknown as Constitution["agentPoolRules"][number]);
      } else if (proposal.action === "modify") {
        const st = proposal.change.subProblemType as string;
        const idx = rules.findIndex((r) => r.subProblemType === st);
        if (idx >= 0) {
          rules[idx] = { ...rules[idx], ...(proposal.change as Record<string, unknown>) };
        }
      } else if (proposal.action === "remove") {
        const st = proposal.change.subProblemType as string;
        updated.agentPoolRules = rules.filter((r) => r.subProblemType !== st);
        return updated;
      }
      updated.agentPoolRules = rules;
      break;
    }
  }

  return updated;
}

export function serializeProposal(proposal: AmendmentProposal): string {
  const lines = [
    "## Amendment Proposal",
    "",
    `- **ID:** ${proposal.id}`,
    `- **Proposed At:** ${proposal.proposedAt}`,
    `- **Target:** ${proposal.target}`,
    `- **Action:** ${proposal.action}`,
    `- **Status:** ${proposal.status}`,
    `- **Source:** ${proposal.source}`,
    "",
    "### Rationale",
    "",
    proposal.rationale,
    "",
    "### Change",
    "",
    "```json",
    JSON.stringify(proposal.change, null, 2),
    "```",
  ];
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/constitution/proposals.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/constitution/proposals.ts packages/agent/test/constitution/proposals.test.ts
git commit -m "feat(agent): add Constitution amendment proposals"
```

---

### Task 5: Integration & Export

**Files:**
- Create: `packages/agent/src/constitution/index.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: All constitution modules
- Produces: Barrel exports and updated package exports

- [ ] **Step 1: Create constitution barrel**

Create `packages/agent/src/constitution/index.ts`:

```typescript
export type {
  ArchitecturePrinciple,
  RubricDimension,
  AgentPoolEntry,
  AgentPoolRule,
  Constitution,
  RubricOverride,
  AmendmentProposal,
} from "./types.js";
export { loadConstitution, loadConstitutionFromFile } from "./loader.js";
export { mergeRubric, toArenaConfig } from "./merger.js";
export { createProposal, applyProposal, serializeProposal } from "./proposals.js";
```

- [ ] **Step 2: Update package index.ts**

Edit `packages/agent/src/index.ts` — append after the Arena exports:

```typescript
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
```

- [ ] **Step 3: Run typecheck**

```bash
cd packages/agent && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd packages/agent && npx vitest run
```

Expected: all tests pass (previous 101 + new constitution tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/constitution/index.ts packages/agent/src/index.ts
git commit -m "feat(agent): integrate Constitution into agent package"
```
