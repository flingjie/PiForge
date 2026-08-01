import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

  it("writes plan.md and todo.md when outputDir is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arena-output-"));
    try {
      const config: ArenaConfig = { ...defaultConfig, outputDir: dir };
      const provider = makeMockAgentProvider();
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
