import { describe, it, expect } from "vitest";
import { formatDebateSummary } from "../../src/arena/debate-summary.js";
import type { ArenaState } from "../../src/arena/types.js";

function makeState(overrides: Partial<ArenaState> = {}): ArenaState {
  return {
    config: { maxDepth: 2, maxCritiqueCycles: 1 },
    originalPlan: "",
    subProblems: [],
    solutions: new Map(),
    critiques: new Map(),
    currentDepth: 0,
    synthesis: null,
    status: "completed",
    ...overrides,
  };
}

describe("formatDebateSummary", () => {
  it("returns empty string for no solutions", () => {
    const state = makeState();
    expect(formatDebateSummary(state)).toBe("");
  });

  it("formats solutions with scores and critic feedback", () => {
    const state = makeState({
      subProblems: [
        { id: "gap-1", title: "DB Choice", description: "", sourceSection: "" },
      ],
      solutions: new Map([
        ["gap-1", [
          {
            persona: "speed",
            problemId: "gap-1",
            proposal: "Use SQLite for simplicity.",
            scores: { decoupling: 50, maintainability: 40, performance: 30 },
            rationale: "Simple setup.",
          },
          {
            persona: "maintain",
            problemId: "gap-1",
            proposal: "Use PostgreSQL with repository pattern.",
            scores: { decoupling: 80, maintainability: 85, performance: 70 },
            rationale: "Better long-term.",
          },
        ]],
      ]),
      critiques: new Map([
        ["gap-1", {
          problemId: "gap-1",
          critiques: [
            { solutionPersona: "speed", weaknesses: ["Not scalable"], severity: "major" },
            { solutionPersona: "maintain", weaknesses: ["Over-engineered"], severity: "minor" },
          ],
          needsMoreDebate: false,
        }],
      ]),
      synthesis: {
        decisions: [
          {
            problemId: "gap-1",
            problemTitle: "DB Choice",
            chosenApproach: "maintain",
            decision: "Use PostgreSQL with repository pattern.",
            reasoning: "Best balance of maintainability and maturity.",
          },
        ],
        revisedPlan: "",
        todoMarkdown: "",
      },
    });

    const summary = formatDebateSummary(state);

    expect(summary).toContain("## Debate Summary");
    expect(summary).toContain("### DB Choice");
    expect(summary).toContain("**Reviewers:** speed, maintain");
    expect(summary).toContain("#### speed");
    expect(summary).toContain("Use SQLite for simplicity");
    expect(summary).toContain("*Critic (MAJOR):* Not scalable");
    expect(summary).toContain("#### maintain");
    expect(summary).toContain("*Critic (minor):* Over-engineered");
    expect(summary).toContain("**Chosen:** maintain");
    expect(summary).toContain("Use PostgreSQL with repository pattern");
  });

  it("handles missing critic gracefully", () => {
    const state = makeState({
      subProblems: [
        { id: "gap-1", title: "Test", description: "", sourceSection: "" },
      ],
      solutions: new Map([
        ["gap-1", [
          { persona: "speed", problemId: "gap-1", proposal: "test", scores: {}, rationale: "" },
        ]],
      ]),
    });

    const summary = formatDebateSummary(state);
    expect(summary).toContain("speed");
    expect(summary).not.toContain("*Critic");
  });
});
