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
