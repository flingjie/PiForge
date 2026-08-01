import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runArena } from "../../src/arena/orchestrator.js";
import type { LLMProvider, ArenaConfig } from "../../src/arena/types.js";

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
    decoupling: 20, maintainability: 20, extensibility: 15,
    testability: 15, performance: 10, observability: 10,
    complexity: 5, ai_friendliness: 5,
  },
};

function mockComplete(prompt: string, hints: { firstCritique?: boolean } = {}): string {
  // Synthesize all
  if (prompt.includes("revisedPlan") && prompt.includes("todoMarkdown")) {
    const todo = `# TODO: auth
## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | types | auth/types.ts | tsc --noEmit | - | pending |
## Concurrent Groups
G1: [1]`;
    return JSON.stringify({ revisedPlan: samplePlan + "\n## Arena Decision\nDone.", todoMarkdown: todo });
  }

  // Synthesize per problem
  if (prompt.includes("Design Synthesizer") || prompt.includes("Fuse the best")) {
    return JSON.stringify({ problemId: "gap-1", problemTitle: "Database Selection", chosenApproach: "maintain", decision: "Use PostgreSQL with a thin repository layer.", reasoning: "Best balance." });
  }

  // Critique
  if (prompt.includes("Design Critic") || prompt.includes("Assume every design is wrong")) {
    if (hints.firstCritique) {
      return JSON.stringify({
        problemId: "gap-1",
        critiques: [{ solutionPersona: "speed", weaknesses: ["needs depth"], severity: "major" }],
        needsMoreDebate: true,
        debateFocus: "caching",
      });
    }
    return JSON.stringify({
      problemId: "gap-1",
      critiques: [
        { solutionPersona: "speed", weaknesses: ["simplistic"], severity: "minor" },
        { solutionPersona: "maintain", weaknesses: ["over-engineered"], severity: "minor" },
        { solutionPersona: "minimal", weaknesses: ["edge cases"], severity: "major" },
        { solutionPersona: "perf", weaknesses: ["premature"], severity: "minor" },
      ],
      needsMoreDebate: false,
    });
  }

  // Solution agent
  const persona = prompt.includes('"speed"') ? "speed" :
    prompt.includes('"maintain"') ? "maintain" :
    prompt.includes('"minimal"') ? "minimal" : "perf";

  const scores: Record<string, number> = {};
  for (const k of Object.keys(defaultConfig.rubric)) {
    if (k === "maintainability" && persona === "maintain") scores[k] = 85;
    else if (k === "performance" && persona === "perf") scores[k] = 90;
    else if (k === "complexity" && persona === "minimal") scores[k] = 95;
    else scores[k] = persona === "maintain" ? 70 : 60;
  }

  return JSON.stringify({ persona, problemId: "gap-1", proposal: `${persona} approach.`, scores, rationale: `${persona} is best.` });
}

describe("runArena", () => {
  it("completes a full arena run", async () => {
    const provider: LLMProvider = { complete: (p) => Promise.resolve(mockComplete(p)) };
    const result = await runArena(defaultConfig, provider, samplePlan);

    expect(result.state.status).toBe("completed");
    expect(result.problemsBattled).toBeGreaterThanOrEqual(1);
    expect(result.state.synthesis).not.toBeNull();
    expect(result.state.synthesis?.decisions.length).toBeGreaterThanOrEqual(1);
    expect(result.state.validation).not.toBeNull();
    expect(result.state.validation?.valid).toBe(true);
  });

  it("solutions include core agents plus extensions", async () => {
    const provider: LLMProvider = { complete: (p) => Promise.resolve(mockComplete(p)) };
    const result = await runArena(defaultConfig, provider, samplePlan);

    const solutions = result.state.solutions.get("gap-1");
    expect(solutions).toBeDefined();
    const personas = solutions!.map((s) => s.persona);
    expect(personas).toContain("speed");
    expect(personas).toContain("maintain");
    expect(personas).toContain("minimal");
    expect(personas).toContain("perf");
  });

  it("skips arena when no gaps detected", async () => {
    const boringPlan = `# Simple Script\n\n## Context\nA one-off script.\n\n## Design Decision: File Format\nUse CSV.\n`;
    const provider: LLMProvider = { complete: () => Promise.resolve("{}") };
    const result = await runArena(defaultConfig, provider, boringPlan);

    expect(result.problemsBattled).toBe(0);
    expect(result.state.status).toBe("completed");
    expect(result.state.synthesis).not.toBeNull();
    expect(result.state.synthesis?.revisedPlan).toBe(boringPlan);
  });

  it("records duration", async () => {
    const provider: LLMProvider = { complete: (p) => Promise.resolve(mockComplete(p)) };
    const result = await runArena(defaultConfig, provider, samplePlan);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("recursive battles increment counter", async () => {
    let critiqueCalls = 0;
    const provider: LLMProvider = {
      complete: (p) => {
        if (p.includes("Design Synthesizer") || p.includes("Fuse the best")) {
          return Promise.resolve(JSON.stringify({ problemId: "gap-1", problemTitle: "DB", chosenApproach: "maintain", decision: "Use PG.", reasoning: "Best." }));
        }
        if (p.includes("revisedPlan")) {
          return Promise.resolve(JSON.stringify({ revisedPlan: "ok", todoMarkdown: "G1: [1]" }));
        }
        if (p.includes("Design Critic") || p.includes("Assume every design is wrong")) {
          critiqueCalls++;
          return Promise.resolve(JSON.stringify({
            problemId: "gap-1",
            critiques: [{ solutionPersona: "speed", weaknesses: ["depth"], severity: "major" }],
            needsMoreDebate: critiqueCalls < 2,
            debateFocus: critiqueCalls < 2 ? "caching" : undefined,
          }));
        }
        return Promise.resolve(JSON.stringify({ persona: "speed", problemId: "gap-1", proposal: "test", scores: {}, rationale: "test" }));
      },
    };

    const result = await runArena(defaultConfig, provider, samplePlan);
    expect(result.recursiveBattles).toBeGreaterThanOrEqual(1);
    expect(critiqueCalls).toBe(2);
    expect(result.state.status).toBe("completed");
  }, 10000);

  it("writes plan.md and todo.md when outputDir is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arena-output-"));
    try {
      const config: ArenaConfig = { ...defaultConfig, outputDir: dir };
      const provider: LLMProvider = { complete: (p) => Promise.resolve(mockComplete(p)) };
      const result = await runArena(config, provider, samplePlan);

      expect(result.state.status).toBe("completed");
      const planPath = join(dir, "plan.md");
      const todoPath = join(dir, "todo.md");
      expect(existsSync(planPath)).toBe(true);
      expect(existsSync(todoPath)).toBe(true);
      expect(readFileSync(planPath, "utf8")).toContain("Arena Decision");
      expect(readFileSync(todoPath, "utf8")).toContain("## Node Table");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
