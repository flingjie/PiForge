import { describe, it, expect } from "vitest";
import { mergeRubric } from "../../src/constitution/merger.js";
import type { Constitution, RubricOverride } from "../../src/constitution/types.js";

const sampleConstitution: Constitution = {
  version: 1,
  updatedAt: "2026-07-31",
  principles: [],
  rubric: [
    { key: "decoupling", label: "Decoupling", defaultWeight: 20, description: "..." },
    { key: "maintainability", label: "Maintainability", defaultWeight: 20, description: "..." },
    { key: "performance", label: "Performance", defaultWeight: 10, description: "..." },
  ],
  agentPool: [],
  agentPoolRules: [],
};

describe("mergeRubric", () => {
  it("returns defaults when no overrides", () => {
    const result = mergeRubric(sampleConstitution, []);
    expect(result[0]?.defaultWeight).toBe(20);
    expect(result[2]?.defaultWeight).toBe(10);
  });

  it("applies weight override", () => {
    const overrides: RubricOverride[] = [
      { dimensionKey: "performance", weight: 25 },
    ];
    const result = mergeRubric(sampleConstitution, overrides);
    const perf = result.find((r) => r.key === "performance");
    expect(perf?.defaultWeight).toBe(25);
  });

  it("leaves un-overridden dimensions unchanged", () => {
    const overrides: RubricOverride[] = [
      { dimensionKey: "performance", weight: 25 },
    ];
    const result = mergeRubric(sampleConstitution, overrides);
    const dec = result.find((r) => r.key === "decoupling");
    expect(dec?.defaultWeight).toBe(20);
  });

  it("ignores overrides for unknown dimensions", () => {
    const overrides: RubricOverride[] = [
      { dimensionKey: "nonexistent", weight: 99 },
    ];
    const result = mergeRubric(sampleConstitution, overrides);
    expect(result).toHaveLength(3);
  });

  it("returns new array (does not mutate input)", () => {
    const orig = sampleConstitution.rubric[0]!.defaultWeight;
    mergeRubric(sampleConstitution, [{ dimensionKey: "decoupling", weight: 99 }]);
    expect(sampleConstitution.rubric[0]!.defaultWeight).toBe(orig);
  });
});
