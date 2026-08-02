import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
    originalPlan: "# Plan\n\n## Decision Points\n- Database Selection: Choose DB.",
    subProblems: [{ id: "gap-1", title: "Database Selection", description: "Choose DB.", sourceSection: "## Decision Points" }],
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
    expect(content).toContain("# Arena Run");
    expect(content).toContain("**Pipeline:** [pipeline-p1](pipeline-p1.md)");
    expect(content).toContain("[auth.md](../../docs/plans/auth.md)");
    expect(content).toContain("## Decision 1: Database Selection");
    expect(content).toContain("**Chosen:** maintain");
    expect(content).toContain("PostgreSQL with a thin Drizzle schema layer");
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
    expect(content).toContain("**Completed:** 3/3");
    expect(content).toContain("| Status | Count |");
    expect(content).toContain("| completed | 3 |");
  });

  it("shows failures correctly", () => {
    const result = makePipelineResult();
    result.report.completed = 2;
    result.report.failed = 1;
    saveTodoTrace("p2", result, tmpDir);

    const content = readFileSync(join(tmpDir, "todo-p2.md"), "utf-8");
    expect(content).toContain("**Completed:** 2/3");
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
  it("saveArenaTrace does not throw when given an impossible path", () => {
    const filePath = join(tmpDir, "not-a-dir");
    writeFileSync(filePath, "block", "utf-8");
    const result = makePipelineResult();
    expect(() => {
      saveArenaTrace("p1", null, result, join(filePath, "sub"));
    }).not.toThrow();
  });
});
