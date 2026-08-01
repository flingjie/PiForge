import { describe, it, expect } from "vitest";
import { runArena } from "../../src/index.js";
import type { LLMProvider, ArenaConfig } from "../../src/index.js";

const samplePlan = `# Auth Module

## Context
Add auth to the API.

## Design Decision: Database Selection
Choose database for credentials.

## Design Decision: API Boundary
Expose /api/auth/* endpoints.
`;

function mockComplete(prompt: string): string {
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
  if (prompt.includes("Fuse the best") || prompt.includes("Design Synthesizer")) {
    return JSON.stringify({ problemId: "gap-1", problemTitle: "DB", chosenApproach: "maintain", decision: "Use recommended.", reasoning: "Best." });
  }
  if (prompt.includes("Design Critic") || prompt.includes("Assume every design is wrong")) {
    return JSON.stringify({ problemId: "gap-1", critiques: [{ solutionPersona: "speed", weaknesses: ["minor"], severity: "minor" }], needsMoreDebate: false });
  }
  const persona = prompt.includes('"speed"') ? "speed" : prompt.includes('"maintain"') ? "maintain" : prompt.includes('"minimal"') ? "minimal" : "perf";
  return JSON.stringify({ persona, problemId: "gap-1", proposal: `${persona} approach.`, scores: { decoupling: 60 }, rationale: `${persona} is right.` });
}

describe("Design Arena E2E", () => {
  it("full pipeline: battle all design decisions → validate", async () => {
    const config: ArenaConfig = { maxDepth: 2, maxCritiqueCycles: 1 };
    const provider: LLMProvider = { complete: (p) => Promise.resolve(mockComplete(p)) };
    const result = await runArena(config, provider, samplePlan);

    expect(result.state.status).toBe("completed");
    expect(result.problemsBattled).toBeGreaterThanOrEqual(2);
    expect(result.state.synthesis?.revisedPlan).toContain("Arena Decision");
    expect(result.state.synthesis?.todoMarkdown).toContain("## Node Table");
  });
});
