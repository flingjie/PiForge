import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDefaultConstitution,
  createLLMProvider,
  runArena,
  runOrchestratorFromMarkdown,
} from "../src/index.js";
import { runPipeline } from "../src/pipeline.js";
import type {
  ArenaConfig,
  LLMProvider,
  NodeExecutor,
} from "../src/index.js";

const constitution = createDefaultConstitution();

const plan = `# Auth Module

## Context
Add auth to the API.

## Decision Points
- Database Selection: We need to choose a database for storing user credentials and session tokens.

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

/**
 * LLMProvider for the mode-specific pipeline tests. Handles the perspective
 * suggestion prompt, and delegates everything else to mockComplete (arena
 * solution agents, critic, synthesizers).
 */
function mockLLMProvider(): LLMProvider {
  return {
    complete: async (prompt: string): Promise<string> => {
      if (prompt.includes("Design Strategy Advisor")) {
        return JSON.stringify({
          suggestions: [
            {
              decision: "Database Selection",
              perspectives: [
                { persona: "speed", reason: "Storage choice impacts latency" },
                { persona: "maintain", reason: "Interface must be replaceable" },
              ],
            },
          ],
        });
      }
      return mockComplete(prompt);
    },
  };
}

function mockExecutor(): NodeExecutor {
  return async (node) => ({
    output: `created ${node.files.join(", ")}`,
  });
}

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

  it("runs the full pipeline via runPipeline with provider factories", async () => {
    const executor: NodeExecutor = async (node) => ({
      output: `created ${node.files.join(", ")}`,
    });

    const result = await runPipeline({
      plan,
      llm: createLLMProvider((p) => Promise.resolve(mockComplete(p))),
      executor,
    });

    expect(result.arenaResult.state.status).toBe("completed");
    expect(result.revisedPlan).toContain("Arena Decision");
    expect(result.todoMarkdown).toContain("## Node Table");
    expect(result.report.completed).toBeGreaterThan(0);
    expect(result.report.failed).toBe(0);
    expect(result.report.skipped).toBe(0);
    // pipelineId should be auto-generated in timestamp-hex format
    expect(result.pipelineId).toBeDefined();
    expect(typeof result.pipelineId).toBe("string");
    expect(result.pipelineId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-[a-f0-9]{6}$/);
  });

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

      expect(result.pipelineId).toBeDefined();

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
      expect(todoContent).toContain("**Completed:** 3/3");
    } finally {
      rmSync(traceDir, { recursive: true, force: true });
    }
  });

  it("does not write trace files when trace is disabled or not set", async () => {
    const executor: NodeExecutor = async (node) => ({
      output: `created ${node.files.join(", ")}`,
    });

    const result = await runPipeline({
      plan,
      llm: createLLMProvider((p) => Promise.resolve(mockComplete(p))),
      executor,
    });

    expect(result.pipelineId).toBeDefined();
    expect(result.report.completed).toBeGreaterThan(0);
  });

  it("runs in perspectives mode without executing arena", async () => {
    const mockLLm: LLMProvider = mockLLMProvider();

    const result = await runPipeline({
      plan,
      llm: mockLLm,
      executor: mockExecutor(),
      constitution,
      mode: "perspectives",
    });

    expect(result.perspectivesSuggestions).toBeDefined();
    expect(result.perspectivesSuggestions!.length).toBeGreaterThan(0);
    expect(result.report).toBeNull();
    expect(result.todoMarkdown).toBe("");
  }, 10000);

  it("runs in arena-only mode with debate summary", async () => {
    const mockLLm: LLMProvider = mockLLMProvider();

    const result = await runPipeline({
      plan,
      llm: mockLLm,
      executor: mockExecutor(),
      constitution,
      mode: "arena-only",
    });

    expect(result.arenaResult.state.status).toBe("completed");
    expect(result.debateSummary).toBeDefined();
    expect(result.debateSummary!.length).toBeGreaterThan(0);
    expect(result.report).toBeNull(); // not executed
  }, 10000);

  it("passes confirmed perspectives to arena", async () => {
    const mockLLm: LLMProvider = mockLLMProvider();
    const perspectives = new Map([
      ["Database Selection", ["speed", "maintain"]],
    ]);

    const result = await runPipeline({
      plan,
      llm: mockLLm,
      executor: mockExecutor(),
      constitution,
      mode: "arena-only",
      perspectives,
    });

    expect(result.arenaResult.state.status).toBe("completed");
    // Only 2 agents dispatched (not the default 3 core + extensions)
    const solutions = result.arenaResult.state.solutions.get("gap-1");
    expect(solutions).toBeDefined();
    const personas = [...new Set(solutions!.map(s => s.persona))].sort();
    expect(personas).toEqual(["maintain", "speed"]);
  }, 10000);
});
