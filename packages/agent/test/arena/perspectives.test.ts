import { describe, it, expect } from "vitest";
import { suggestPerspectives } from "../../src/arena/perspectives.js";
import { createDefaultConstitution } from "../../src/constitution/defaults.js";
import type { LLMProvider, SubProblem } from "../../src/arena/types.js";

const decisionPoints: SubProblem[] = [
  { id: "gap-1", title: "Database Selection", description: "Choose a database.", sourceSection: "## Decision Points" },
  { id: "gap-2", title: "API Design", description: "Design the REST API.", sourceSection: "## Decision Points" },
];

const constitution = createDefaultConstitution();

function mockProvider(responses: string[]): LLMProvider {
  let idx = 0;
  return {
    complete: async (): Promise<string> => {
      const r = responses[idx % responses.length]!;
      idx++;
      return r;
    },
  };
}

describe("suggestPerspectives", () => {
  it("returns perspectives for each decision point", async () => {
    const json = JSON.stringify({
      suggestions: [
        {
          decision: "Database Selection",
          perspectives: [
            { persona: "perf", reason: "Storage choice impacts latency" },
            { persona: "maintain", reason: "Interface must be replaceable" },
          ],
        },
        {
          decision: "API Design",
          perspectives: [
            { persona: "minimal", reason: "Keep endpoints simple" },
          ],
        },
      ],
    });

    const result = await suggestPerspectives(
      mockProvider([json]),
      decisionPoints,
      constitution,
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.decision).toBe("Database Selection");
    expect(result[0]!.perspectives).toHaveLength(2);
    expect(result[0]!.perspectives[0]!.persona).toBe("perf");
    expect(result[0]!.perspectives[0]!.reason).toBe("Storage choice impacts latency");

    expect(result[1]!.decision).toBe("API Design");
    expect(result[1]!.perspectives).toHaveLength(1);
  });

  it("returns empty array for no decision points", async () => {
    const result = await suggestPerspectives(mockProvider([]), [], constitution);
    expect(result).toHaveLength(0);
  });

  it("handles missing suggestions gracefully", async () => {
    const json = JSON.stringify({ suggestions: [] });
    const result = await suggestPerspectives(
      mockProvider([json]),
      decisionPoints,
      constitution,
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.perspectives).toHaveLength(0);
  });

  it("retries on invalid JSON", async () => {
    const badJson = "not valid json";
    const goodJson = JSON.stringify({
      suggestions: [
        { decision: "Database Selection", perspectives: [] },
        { decision: "API Design", perspectives: [] },
      ],
    });

    const result = await suggestPerspectives(
      mockProvider([badJson, goodJson]),
      decisionPoints,
      constitution,
    );

    expect(result).toHaveLength(2);
  });
});
