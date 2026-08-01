import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDefaultConstitution,
  runArena,
  runOrchestratorFromMarkdown,
} from "../src/index.js";
import type {
  ArenaConfig,
  LLMProvider,
  NodeExecutor,
} from "../src/index.js";

const constitution = createDefaultConstitution();

const plan = `# Auth Module

## Context
Add auth to the API.

## Design Decision: Database Selection
We need to choose a database for storing user credentials and session tokens.

## Out of Scope
- OAuth
`;

const TODO_MARKDOWN = `# TODO: auth

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | types | auth/types.ts | tsc --noEmit | - | pending |
| 2  | logic | auth/handler.ts | vitest run | 1 | pending |
| 3  | index | auth/index.ts | vitest run | 1 | pending |

## Concurrent Groups
G1: [1]
G2: [2, 3]
`;

/**
 * Mock LLMProvider returning realistic responses for every prompt the Arena
 * builds: solution agents (speed/maintain/minimal), the critic, the per-problem
 * synthesizer, and the final synthesize-all step.
 */
function mockComplete(prompt: string): string {
  // Synthesize All: revised plan + TODO graph.
  if (prompt.includes("revisedPlan") && prompt.includes("todoMarkdown")) {
    return JSON.stringify({
      revisedPlan: `${plan}

## Arena Decision
Use PostgreSQL with a thin repository layer.`,
      todoMarkdown: TODO_MARKDOWN,
    });
  }

  // Per-problem synthesizer.
  if (prompt.includes("Design Synthesizer") || prompt.includes("Fuse the best")) {
    return JSON.stringify({
      problemId: "gap-1",
      problemTitle: "Database Selection",
      chosenApproach: "maintain",
      decision: "Use PostgreSQL with a thin repository layer.",
      reasoning: "Best balance of maintainability and simplicity.",
    });
  }

  // Critic reviews every solution.
  if (prompt.includes("Design Critic") || prompt.includes("Assume every design is wrong")) {
    return JSON.stringify({
      problemId: "gap-1",
      critiques: [
        { solutionPersona: "speed", weaknesses: ["Skips migrations"], severity: "minor" },
        { solutionPersona: "maintain", weaknesses: ["More layers"], severity: "minor" },
        { solutionPersona: "minimal", weaknesses: ["No backup story"], severity: "major" },
      ],
      needsMoreDebate: false,
    });
  }

  // Solution agents — one call per persona.
  const persona = prompt.includes('"speed"')
    ? "speed"
    : prompt.includes('"maintain"')
      ? "maintain"
      : prompt.includes('"minimal"')
        ? "minimal"
        : "perf";

  const scores: Record<string, number> = {
    decoupling: persona === "maintain" ? 85 : 60,
    maintainability: persona === "maintain" ? 88 : 60,
    extensibility: 60,
    testability: persona === "minimal" ? 80 : 60,
    performance: persona === "speed" ? 85 : 60,
    observability: 60,
    complexity: persona === "minimal" ? 90 : 60,
    ai_friendliness: 60,
  };

  return JSON.stringify({
    persona,
    problemId: "gap-1",
    proposal: `${persona} approach to the database layer.`,
    scores,
    rationale: `${persona} philosophy fits this problem.`,
  });
}

const provider: LLMProvider = {
  complete: (p) => Promise.resolve(mockComplete(p)),
};

describe("Arena → TODO Graph → Orchestrator pipeline", () => {
  it("runs the full pipeline end to end", async () => {
    // 1. Run Arena.
    const config: ArenaConfig = { maxDepth: 2, maxCritiqueCycles: 1 };
    const arenaResult = await runArena(config, provider, plan, constitution);

    // 2. Verify Arena output.
    expect(arenaResult.state.status).toBe("completed");
    expect(arenaResult.state.synthesis).not.toBeNull();
    expect(arenaResult.state.synthesis?.todoMarkdown).toContain("## Node Table");
    expect(arenaResult.state.synthesis?.revisedPlan).toContain("Arena Decision");

    // 3. Feed TODO to Orchestrator.
    const executor: NodeExecutor = async (node) => ({
      output: `created ${node.files.join(", ")}`,
    });

    const report = await runOrchestratorFromMarkdown(
      arenaResult.state.synthesis!.todoMarkdown,
      executor,
    );

    // 4. Verify execution.
    expect(report.completed).toBeGreaterThan(0);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
  });

  it("writes Arena output files when outputDir is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pipeline-arena-"));
    try {
      const config: ArenaConfig = {
        maxDepth: 2,
        maxCritiqueCycles: 1,
        outputDir: dir,
      };
      const result = await runArena(config, provider, plan, constitution);

      expect(result.state.status).toBe("completed");
      expect(existsSync(join(dir, "plan.md"))).toBe(true);
      expect(existsSync(join(dir, "todo.md"))).toBe(true);
      expect(readFileSync(join(dir, "plan.md"), "utf8")).toContain("Arena Decision");
      expect(readFileSync(join(dir, "todo.md"), "utf8")).toContain("## Node Table");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
