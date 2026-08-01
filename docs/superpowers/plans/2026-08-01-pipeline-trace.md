# Pipeline Trace: Decision Provenance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a markdown-wiki trace module to `@piforge/agent` that persists pipeline outputs (arena decisions, todo execution results) as interlinked markdown files in `output/traces/`.

**Architecture:** New `src/trace/` module (types.ts, store.ts, index.ts) with zero external dependencies beyond `node:fs` and `node:path`. `runPipeline()` calls trace functions post-hoc after completion. Trace is best-effort — failures are caught and logged, never thrown to the caller.

**Tech Stack:** TypeScript (strict), Node.js built-ins only (`node:fs`, `node:path`, `node:crypto`), Vitest.

## Global Constraints

- No external npm dependencies — only Node.js built-ins
- Trace failures must never cause pipeline failures (try/catch + console.error)
- All trace functions are synchronous file I/O (no async needed for these small writes)
- Test with the existing mock LLM provider from `test/pipeline.test.ts` — no real API calls
- `PipelineResult` gains `pipelineId: string` field
- `PipelineOptions` gains optional `trace?: TraceOptions` field

## File Structure

| Responsibility | File |
|---------------|------|
| Trace types (`TraceOptions`, `RunSummary`) | `packages/agent/src/trace/types.ts` (create) |
| Markdown generation + file I/O | `packages/agent/src/trace/store.ts` (create) |
| Public re-exports | `packages/agent/src/trace/index.ts` (create) |
| Pipeline integration (add trace call) | `packages/agent/src/pipeline.ts` (modify) |
| Main package re-exports | `packages/agent/src/index.ts` (modify) |
| Unit tests for store functions | `packages/agent/test/trace/store.test.ts` (create) |
| Integration test (full pipeline with trace) | `packages/agent/test/pipeline.test.ts` (modify) |

---

### Task 1: Trace Types

**Files:**
- Create: `packages/agent/src/trace/types.ts`

**Interfaces:**
- Produces: `TraceOptions`, `RunSummary`

- [ ] **Step 1: Write types.ts**

```typescript
/** Configuration for the trace module, set via PipelineOptions.trace. */
export interface TraceOptions {
  /** When false, no trace files are written. Default false. */
  enabled: boolean;
  /** Directory for trace output files. Default "output/traces". */
  outputDir: string;
  /** Path to the upstream plan file (e.g. "docs/superpowers/plans/2026-08-01-auth.md"). */
  planPath?: string;
}

/** Summary row for index.md — one per pipeline run. */
export interface RunSummary {
  /** ISO-8601 timestamp of the run. */
  time: string;
  /** Relative path to the upstream plan file, or null. */
  planPath: string | null;
  /** Number of design decisions resolved in the arena phase. */
  decisionsCount: number;
  /** Number of todo nodes that completed successfully. */
  todoCompleted: number;
  /** Total number of todo nodes in the graph. */
  todoTotal: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: PASS (new file has no imports, no errors)

---

### Task 2: Write Failing Unit Tests for Store Functions

**Files:**
- Create: `packages/agent/test/trace/store.test.ts`

**Interfaces:**
- Consumes: `TraceOptions`, `RunSummary` from Task 1
- Produces: (none — this is a test file)
- Also consumes: `PipelineResult`, `PipelineOptions` from `../../src/pipeline.js`
- Also consumes: `ArenaState`, `ArenaResult`, `Solution`, `CritiqueResult`, `FusedDecision`, `SynthesisResult` from `../../src/arena/types.js`

- [ ] **Step 1: Write the test file (tests will fail — store.ts does not exist yet)**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  savePipelineIndex,
  saveArenaTrace,
  saveTodoTrace,
  appendToIndex,
} from "../../src/trace/store.js";
import type { TraceOptions, RunSummary } from "../../src/trace/types.js";
import type { PipelineResult } from "../../src/pipeline.js";
import type { ArenaState, Solution, CritiqueResult, FusedDecision, SynthesisResult } from "../../src/arena/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "trace-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makePipelineResult(overrides: Partial<{
  pipelineId: string;
  problemsBattled: number;
  decisions: FusedDecision[];
  solutions: Map<string, Solution[]>;
  critiques: Map<string, CritiqueResult>;
}> = {}): PipelineResult {
  const solutions = new Map<string, Solution[]>();
  solutions.set("gap-1", [
    {
      persona: "speed",
      problemId: "gap-1",
      proposal: "SQLite with raw SQL, no ORM.",
      scores: { decoupling: 60, maintainability: 55 },
      rationale: "Fastest to implement.",
    },
    {
      persona: "maintain",
      problemId: "gap-1",
      proposal: "PostgreSQL + Drizzle with migration tooling.",
      scores: { decoupling: 85, maintainability: 88 },
      rationale: "Long-term maintainability.",
    },
    {
      persona: "minimal",
      problemId: "gap-1",
      proposal: "JSON file on disk, swap later if needed.",
      scores: { decoupling: 70, maintainability: 65 },
      rationale: "Simplest possible solution.",
    },
  ]);

  const critiques = new Map<string, CritiqueResult>();
  critiques.set("gap-1", {
    problemId: "gap-1",
    critiques: [
      { solutionPersona: "speed", weaknesses: ["No migration story — schema drift inevitable"], severity: "major" },
      { solutionPersona: "maintain", weaknesses: ["Over-engineered for current scope"], severity: "minor" },
      { solutionPersona: "minimal", weaknesses: ["No concurrent write safety"], severity: "blocker" },
    ],
    needsMoreDebate: false,
  });

  const decisions: FusedDecision[] = overrides.decisions ?? [{
    problemId: "gap-1",
    problemTitle: "Database Selection",
    chosenApproach: "maintain",
    decision: "PostgreSQL with a thin Drizzle schema layer.",
    reasoning: "Best balance of maintainability and simplicity.",
  }];

  const synthesis: SynthesisResult = {
    decisions,
    revisedPlan: "# Revised Plan\n\nUses PostgreSQL.",
    todoMarkdown: "# TODO\n\n## Node Table\n| ID | Name |\n|----|------|\n| 1  | init |",
  };

  const state: ArenaState = {
    config: { maxDepth: 2, maxCritiqueCycles: 1 },
    originalPlan: "# Plan\n\n## Design Decision: Database Selection\n...",
    subProblems: [{ id: "gap-1", title: "Database Selection", description: "Choose DB.", sourceSection: "## Design Decision: Database Selection" }],
    solutions: overrides.solutions ?? solutions,
    critiques: overrides.critiques ?? critiques,
    currentDepth: 0,
    synthesis,
    status: "completed",
  };

  return {
    pipelineId: overrides.pipelineId ?? "test-pipeline-1",
    revisedPlan: synthesis.revisedPlan,
    todoMarkdown: synthesis.todoMarkdown,
    report: {
      totalNodes: 3,
      completed: 3,
      failed: 0,
      skipped: 0,
      nodes: [],
      durationMs: 100,
    },
    arenaResult: {
      state,
      problemsBattled: overrides.problemsBattled ?? 1,
      recursiveBattles: 0,
      durationMs: 3200,
    },
  };
}

describe("savePipelineIndex", () => {
  it("writes a pipeline index page with correct content", () => {
    savePipelineIndex("p1", "docs/plans/auth.md", tmpDir);

    const content = readFileSync(join(tmpDir, "pipeline-p1.md"), "utf-8");
    expect(content).toContain("# Pipeline: p1");
    expect(content).toContain("[auth.md](../../docs/plans/auth.md)");
  });

  it("writes pipeline page with null planPath", () => {
    savePipelineIndex("p2", null, tmpDir);

    const content = readFileSync(join(tmpDir, "pipeline-p2.md"), "utf-8");
    expect(content).toContain("# Pipeline: p2");
    expect(content).toContain("(no plan)");
  });
});

describe("saveArenaTrace", () => {
  it("writes arena trace with decisions, alternatives, and critiques", () => {
    const result = makePipelineResult();
    saveArenaTrace("p1", "docs/plans/auth.md", result, tmpDir);

    const content = readFileSync(join(tmpDir, "arena-p1.md"), "utf-8");
    // Header
    expect(content).toContain("# Arena Run");
    expect(content).toContain("**Pipeline:** [pipeline-p1](pipeline-p1.md)");
    expect(content).toContain("[auth.md](../../docs/plans/auth.md)");
    // Decision
    expect(content).toContain("## Decision 1: Database Selection");
    expect(content).toContain("**Chosen:** maintain");
    expect(content).toContain("PostgreSQL with a thin Drizzle schema layer");
    // Alternatives table
    expect(content).toContain("| Persona | Proposal | Scores | Critique | Severity |");
    expect(content).toContain("| speed | SQLite with raw SQL");
    expect(content).toContain("No migration story");
    expect(content).toContain("| major |");
    expect(content).toContain("| maintain | PostgreSQL + Drizzle");
    expect(content).toContain("Over-engineered");
    expect(content).toContain("| minor |");
    expect(content).toContain("| minimal | JSON file on disk");
    expect(content).toContain("No concurrent write safety");
    expect(content).toContain("| blocker |");
  });

  it("renders multiple decisions correctly", () => {
    const result = makePipelineResult({
      problemsBattled: 2,
      decisions: [
        {
          problemId: "gap-1",
          problemTitle: "Database Selection",
          chosenApproach: "maintain",
          decision: "Use PostgreSQL.",
          reasoning: "Best balance.",
        },
        {
          problemId: "gap-2",
          problemTitle: "Auth Strategy",
          chosenApproach: "speed",
          decision: "Use JWT with no refresh tokens.",
          reasoning: "Simplest to implement.",
        },
      ],
    });
    saveArenaTrace("p1", null, result, tmpDir);

    const content = readFileSync(join(tmpDir, "arena-p1.md"), "utf-8");
    expect(content).toContain("## Decision 1: Database Selection");
    expect(content).toContain("## Decision 2: Auth Strategy");
  });
});

describe("saveTodoTrace", () => {
  it("writes a todo execution summary page", () => {
    const result = makePipelineResult();
    saveTodoTrace("p1", result, tmpDir);

    const content = readFileSync(join(tmpDir, "todo-p1.md"), "utf-8");
    expect(content).toContain("# Todo Execution");
    expect(content).toContain("**Pipeline:** [pipeline-p1](pipeline-p1.md)");
    expect(content).toContain("Completed: 3/3");
    expect(content).toContain("| Status | Count |");
    expect(content).toContain("| completed | 3 |");
  });

  it("shows failures correctly", () => {
    const result = makePipelineResult();
    result.report.completed = 2;
    result.report.failed = 1;
    saveTodoTrace("p2", result, tmpDir);

    const content = readFileSync(join(tmpDir, "todo-p2.md"), "utf-8");
    expect(content).toContain("Completed: 2/3");
    expect(content).toContain("| completed | 2 |");
    expect(content).toContain("| failed | 1 |");
  });
});

describe("appendToIndex", () => {
  it("creates index.md with header and first run on first call", () => {
    const summary: RunSummary = {
      time: "2026-08-01T21:30:00Z",
      planPath: "docs/plans/auth.md",
      decisionsCount: 1,
      todoCompleted: 3,
      todoTotal: 3,
    };
    appendToIndex("p1", tmpDir, summary);

    const content = readFileSync(join(tmpDir, "index.md"), "utf-8");
    expect(content).toContain("# Pipeline Traces");
    expect(content).toContain("| Pipeline | Time | Plan | Decisions | Todo |");
    expect(content).toContain("[p1](pipeline-p1.md) | 2026-08-01T21:30:00Z");
    expect(content).toContain("| 1 | 3/3 |");
  });

  it("appends a second run below the first", () => {
    const summary1: RunSummary = {
      time: "2026-08-01T21:30:00Z",
      planPath: null,
      decisionsCount: 1,
      todoCompleted: 3,
      todoTotal: 3,
    };
    const summary2: RunSummary = {
      time: "2026-08-01T22:00:00Z",
      planPath: null,
      decisionsCount: 2,
      todoCompleted: 5,
      todoTotal: 5,
    };
    appendToIndex("p1", tmpDir, summary1);
    appendToIndex("p2", tmpDir, summary2);

    const content = readFileSync(join(tmpDir, "index.md"), "utf-8");
    const lines = content.split("\n");
    const dataLines = lines.filter((l) => l.startsWith("| ["));
    expect(dataLines).toHaveLength(2);
    expect(dataLines[0]).toContain("[p1]");
    expect(dataLines[1]).toContain("[p2]");
  });
});

describe("error handling", () => {
  it("saveArenaTrace does not throw on read-only directory", () => {
    // Make directory read-only by writing a file over where the subdir should be
    // Actually, simpler: pass a path that can't be created (e.g. /dev/null/foo)
    const result = makePipelineResult();
    // This should not throw — trace is best-effort
    expect(() => {
      saveArenaTrace("p1", null, result, "/dev/null/invalid");
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test file (expect failure — store.ts does not exist)**

Run: `cd packages/agent && npx vitest run test/trace/store.test.ts`
Expected: FAIL — "Cannot find module '../../src/trace/store.js'"

---

### Task 3: Implement store.ts

**Files:**
- Create: `packages/agent/src/trace/store.ts`

**Interfaces:**
- Consumes: `TraceOptions`, `RunSummary` from `./types.js`, `PipelineResult` from `../pipeline.js`
- Produces: `savePipelineIndex`, `saveArenaTrace`, `saveTodoTrace`, `appendToIndex`

- [ ] **Step 1: Implement store.ts**

```typescript
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TraceOptions, RunSummary } from "./types.js";
import type { PipelineResult } from "../pipeline.js";

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function safeWrite(callback: () => void): void {
  try {
    callback();
  } catch (err) {
    console.error("[trace] Failed to write trace file:", err instanceof Error ? err.message : String(err));
  }
}

function formatScores(scores: Record<string, number>): string {
  return Object.entries(scores)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

/** Escape pipe characters in markdown table cells. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Write the pipeline overview page: `pipeline-<pipelineId>.md`.
 */
export function savePipelineIndex(
  pipelineId: string,
  planPath: string | null,
  outputDir: string,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const planLink = planPath
      ? `[${planPath.split("/").pop()}](../../${planPath})`
      : "(no plan)";

    const content = [
      `# Pipeline: ${pipelineId}`,
      "",
      `**Plan:** ${planLink}`,
      "",
    ].join("\n");

    writeFileSync(join(outputDir, `pipeline-${pipelineId}.md`), content, "utf-8");
  });
}

/**
 * Write the arena decision trace page: `arena-<pipelineId>.md`.
 * This is the core trace artifact — one page containing every decision
 * with its alternatives and critiques.
 */
export function saveArenaTrace(
  pipelineId: string,
  planPath: string | null,
  result: PipelineResult,
  outputDir: string,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const { state } = result.arenaResult;

    const planLink = planPath
      ? `[${planPath.split("/").pop()}](../../${planPath})`
      : "(no plan)";

    const lines: string[] = [
      `# Arena Run`,
      "",
      `**Pipeline:** [pipeline-${pipelineId}](pipeline-${pipelineId}.md)`,
      `**Plan:** ${planLink}`,
      `**Status:** ${state.status}`,
      `**Duration:** ${(result.arenaResult.durationMs / 1000).toFixed(1)}s`,
      `**Problems battled:** ${result.arenaResult.problemsBattled} (recursive: ${result.arenaResult.recursiveBattles})`,
      "",
    ];

    if (!state.synthesis) {
      lines.push("(No synthesis result)");
      writeFileSync(join(outputDir, `arena-${pipelineId}.md`), lines.join("\n"), "utf-8");
      return;
    }

    for (const decision of state.synthesis.decisions) {
      const idx = state.synthesis.decisions.indexOf(decision) + 1;
      lines.push(`## Decision ${idx}: ${decision.problemTitle}`);
      lines.push("");
      lines.push(`**Chosen:** ${decision.chosenApproach}`);
      lines.push(`**Decision:** ${decision.decision}`);
      lines.push("");
      lines.push("### Reasoning");
      lines.push(decision.reasoning);
      lines.push("");

      // Build alternatives table: join solutions with their critiques.
      const solutions = state.solutions.get(decision.problemId) ?? [];
      const critiqueResult = state.critiques.get(decision.problemId);

      if (solutions.length > 0) {
        lines.push("### Alternatives Considered");
        lines.push("");
        lines.push("| Persona | Proposal | Scores | Critique | Severity |");
        lines.push("|---------|----------|--------|----------|----------|");

        for (const sol of solutions) {
          const crit = critiqueResult?.critiques.find(
            (c) => c.solutionPersona === sol.persona,
          );
          const proposal = escapeCell(sol.proposal.slice(0, 120));
          const scores = escapeCell(formatScores(sol.scores));
          const weakness = crit?.weaknesses.join("; ") ?? "-";
          const severity = crit?.severity ?? "-";

          lines.push(
            `| ${sol.persona} | ${proposal} | ${scores} | ${escapeCell(weakness)} | ${severity} |`,
          );
        }

        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    writeFileSync(join(outputDir, `arena-${pipelineId}.md`), lines.join("\n"), "utf-8");
  });
}

/**
 * Write the todo execution summary page: `todo-<pipelineId>.md`.
 */
export function saveTodoTrace(
  pipelineId: string,
  result: PipelineResult,
  outputDir: string,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const { report } = result;

    const lines: string[] = [
      `# Todo Execution`,
      "",
      `**Pipeline:** [pipeline-${pipelineId}](pipeline-${pipelineId}.md)`,
      `**Arena:** [arena-${pipelineId}](arena-${pipelineId}.md)`,
      `**Completed:** ${report.completed}/${report.totalNodes}`,
      "",
      "## Node Summary",
      "",
      "| Status | Count |",
      "|--------|-------|",
      `| completed | ${report.completed} |`,
      `| failed | ${report.failed} |`,
      `| skipped | ${report.skipped} |`,
      "",
      `**Duration:** ${(report.durationMs / 1000).toFixed(1)}s`,
      "",
    ];

    writeFileSync(join(outputDir, `todo-${pipelineId}.md`), lines.join("\n"), "utf-8");
  });
}

/**
 * Append a run entry to the global index file: `index.md`.
 * Creates the file with a header on first call; appends a table row on subsequent calls.
 */
export function appendToIndex(
  pipelineId: string,
  outputDir: string,
  summary: RunSummary,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const indexPath = join(outputDir, "index.md");

    const planCell = summary.planPath
      ? `[${summary.planPath.split("/").pop()?.replace(".md", "") ?? summary.planPath}](${summary.planPath})`
      : "-";

    const row = `| [${pipelineId}](pipeline-${pipelineId}.md) | ${summary.time} | ${planCell} | ${summary.decisionsCount} | ${summary.todoCompleted}/${summary.todoTotal} |`;

    if (!existsSync(indexPath)) {
      const header = [
        "# Pipeline Traces",
        "",
        "| Pipeline | Time | Plan | Decisions | Todo |",
        "|----------|------|------|-----------|------|",
        row,
        "",
      ].join("\n");
      writeFileSync(indexPath, header, "utf-8");
    } else {
      const existing = readFileSync(indexPath, "utf-8");
      writeFileSync(indexPath, existing.trimEnd() + "\n" + row + "\n", "utf-8");
    }
  });
}
```

- [ ] **Step 2: Run unit tests**

Run: `cd packages/agent && npx vitest run test/trace/store.test.ts`
Expected: PASS (8 tests) — BUT one test may fail on macOS: the read-only directory test. The `/dev/null/invalid` path may not behave as expected on macOS. If it fails, skip the error handling test for now and verify manually.

- [ ] **Step 3: Handle test failure on macOS for the error-handling test**

The `/dev/null/invalid` approach is unreliable across platforms. Replace that test with one that writes to a file path where the parent is a regular file (this will throw ENOENT or ENOTDIR, which should be caught):

```typescript
describe("error handling", () => {
  it("saveArenaTrace does not throw when given an impossible path", () => {
    // Create a regular file, then try to write inside it (will fail, but not throw)
    const filePath = join(tmpDir, "not-a-dir");
    writeFileSync(filePath, "block", "utf-8");
    const result = makePipelineResult();
    expect(() => {
      saveArenaTrace("p1", null, result, join(filePath, "sub"));
    }).not.toThrow();
  });
});
```

Note: `mkdtempSync` creates a directory, and `rmSync` cleans it. We need to add `writeFileSync` import. Add `import { writeFileSync } from "node:fs"` to the test file imports.

Run again: `cd packages/agent && npx vitest run test/trace/store.test.ts`
Expected: PASS (8 tests)

---

### Task 4: Create trace/index.ts

**Files:**
- Create: `packages/agent/src/trace/index.ts`

**Interfaces:**
- Consumes: all exports from `./types.js` and `./store.js`
- Produces: public re-exports of the same

- [ ] **Step 1: Write index.ts**

```typescript
export type { TraceOptions, RunSummary } from "./types.js";
export { savePipelineIndex, saveArenaTrace, saveTodoTrace, appendToIndex } from "./store.js";
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: PASS

---

### Task 5: Integrate Trace into runPipeline

**Files:**
- Modify: `packages/agent/src/pipeline.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `TraceOptions` from `./trace/types.js`, store functions from `./trace/store.js`
- Produces: Updated `PipelineOptions` (adds `trace?` and `pipelineId?`), updated `PipelineResult` (adds `pipelineId`)
- Modifies: `runPipeline()` adds trace calls at end

- [ ] **Step 1: Modify pipeline.ts**

**Edit 1** — Add trace imports after existing imports:

```typescript
import { savePipelineIndex, saveArenaTrace, saveTodoTrace, appendToIndex } from "./trace/store.js";
import type { TraceOptions } from "./trace/types.js";
```

**Edit 2** — Add `pipelineId` and `trace` to `PipelineOptions`:

```typescript
export interface PipelineOptions {
  plan: string;
  llm: LLMProvider;
  executor: NodeExecutor;
  constitution?: Constitution;
  arena?: Partial<ArenaConfig>;
  outputDir?: string;
  /** Identifier for this pipeline run. Auto-generated if not provided. */
  pipelineId?: string;
  /** Trace configuration. When enabled, writes markdown trace files after completion. */
  trace?: TraceOptions;
}
```

**Edit 3** — Add `pipelineId` to `PipelineResult`:

```typescript
export interface PipelineResult {
  /** Identifier for this pipeline run. */
  pipelineId: string;
  revisedPlan: string;
  todoMarkdown: string;
  report: ExecutionReport;
  arenaResult: ArenaResult;
}
```

**Edit 4** — Modify `runPipeline()` to generate `pipelineId` (before `const constitution` line) and add trace calls (after `return` value construction, before the return):

In the function body, at the start:

```typescript
  const pipelineId = options.pipelineId ?? crypto.randomUUID();
```

Replace the `return {` block with:

```typescript
  const result: PipelineResult = {
    pipelineId,
    revisedPlan: arenaResult.state.synthesis.revisedPlan,
    todoMarkdown: arenaResult.state.synthesis.todoMarkdown,
    report,
    arenaResult,
  };

  if (options.trace?.enabled) {
    const traceDir = options.trace.outputDir || "output/traces";
    savePipelineIndex(pipelineId, options.trace.planPath ?? null, traceDir);
    saveArenaTrace(pipelineId, options.trace.planPath ?? null, result, traceDir);
    saveTodoTrace(pipelineId, result, traceDir);
    appendToIndex(pipelineId, traceDir, {
      time: new Date().toISOString(),
      planPath: options.trace.planPath ?? null,
      decisionsCount: arenaResult.problemsBattled,
      todoCompleted: report.completed,
      todoTotal: report.totalNodes,
    });
  }

  return result;
```

Note: `crypto.randomUUID()` requires the `node:crypto` import. Add it if not present. Node.js 19+ has it globally, but for safety add: `import { randomUUID } from "node:crypto";`.

- [ ] **Step 2: Modify index.ts** — Add trace module re-exports after the pipeline section:

```typescript
// Pipeline Trace.
export type { TraceOptions, RunSummary } from "./trace/types.js";
export { savePipelineIndex, saveArenaTrace, saveTodoTrace, appendToIndex } from "./trace/store.js";
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: PASS

---

### Task 6: Run Existing Tests (Make Sure Nothing Broke)

- [ ] **Step 1: Run all existing tests**

Run: `cd packages/agent && npx vitest run`
Expected: PASS (all 54 existing tests + 8 new trace unit tests = 62 tests)

---

### Task 7: Write Integration Test (Pipeline with Trace Enabled)

**Files:**
- Modify: `packages/agent/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `runPipeline` from `../../src/pipeline.js`
- Adds: new test case "writes trace files when trace is enabled"

- [ ] **Step 1: Add integration test at the end of the existing describe block**

Add after the last test in the `describe("Arena → TODO Graph → Orchestrator pipeline", () => {` block:

```typescript
  it("writes trace files when trace is enabled", async () => {
    const traceDir = mkdtempSync(join(tmpdir(), "pipeline-trace-"));
    try {
      const executor: NodeExecutor = async (node) => ({
        output: `created ${node.files.join(", ")}`,
      });

      const result = await runPipeline({
        plan,
        llm: createLLMProvider((p) => Promise.resolve(mockComplete(p))),
        executor,
        trace: {
          enabled: true,
          outputDir: traceDir,
          planPath: "docs/superpowers/plans/2026-08-01-auth.md",
        },
      });

      // Pipeline result should have pipelineId
      expect(result.pipelineId).toBeDefined();
      expect(typeof result.pipelineId).toBe("string");

      // All four trace files should exist
      expect(existsSync(join(traceDir, `pipeline-${result.pipelineId}.md`))).toBe(true);
      expect(existsSync(join(traceDir, `arena-${result.pipelineId}.md`))).toBe(true);
      expect(existsSync(join(traceDir, `todo-${result.pipelineId}.md`))).toBe(true);
      expect(existsSync(join(traceDir, "index.md"))).toBe(true);

      // Arena trace should contain the decision
      const arenaContent = readFileSync(join(traceDir, `arena-${result.pipelineId}.md`), "utf-8");
      expect(arenaContent).toContain("## Decision 1: Database Selection");
      expect(arenaContent).toContain("| speed |");
      expect(arenaContent).toContain("| maintain |");
      expect(arenaContent).toContain("| minimal |");

      // Index should contain the run
      const indexContent = readFileSync(join(traceDir, "index.md"), "utf-8");
      expect(indexContent).toContain(result.pipelineId);

      // Todo trace should show completion
      const todoContent = readFileSync(join(traceDir, `todo-${result.pipelineId}.md`), "utf-8");
      expect(todoContent).toContain("Completed: 3/3");
    } finally {
      rmSync(traceDir, { recursive: true, force: true });
    }
  });

  it("does not write trace files when trace is disabled or not set", async () => {
    const executor: NodeExecutor = async (node) => ({
      output: `created ${node.files.join(", ")}`,
    });

    // No trace option at all — should work fine
    const result = await runPipeline({
      plan,
      llm: createLLMProvider((p) => Promise.resolve(mockComplete(p))),
      executor,
    });

    expect(result.pipelineId).toBeDefined();
    expect(result.report.completed).toBeGreaterThan(0);
  });
```

Add the import for `mkdtempSync`, `rmSync`, `existsSync`, `readFileSync` at the top — they may already be imported for the existing outputDir test. Check and add if missing:

```typescript
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
```

- [ ] **Step 2: Run integration tests**

Run: `cd packages/agent && npx vitest run test/pipeline.test.ts`
Expected: PASS (5 tests — 3 existing + 2 new)

---

### Task 8: Final Verification

- [ ] **Step 1: Typecheck the full package**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `cd packages/agent && npx vitest run`
Expected: PASS (56 existing + 8 unit + 2 integration = 64 tests)
