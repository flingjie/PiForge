import { describe, it, expect } from "vitest";
import { checkSignalDensity, evaluateGate } from "../src/reflection/validation-gate.js";
import { createReflectionState } from "../src/reflection/state.js";
import type {
  ValueLensOutput,
  AbilityLensOutput,
  PatternLensOutput,
  LensOutput,
} from "../src/reflection/state.js";

const richValueOutput: ValueLensOutput = {
  lens: "value",
  segments: [{ label: "seg1", topic: "topic", emotional_tone: "excited", signal_strength: "high" }],
  focus_segments: ["seg1"],
  summary: "rich value output",
  candidate_values: [{ key: "creation", score: 0.9, evidence: "user loves building" }],
  attraction_signals: [{ topic: "devtools", confidence: 0.85 }],
  emotional_spikes: [{ moment: "t=0", emotion: "excitement", trigger: "new idea" }],
  status: "passed",
};

const richAbilityOutput: AbilityLensOutput = {
  lens: "ability",
  segments: [{ label: "seg1", topic: "topic", emotional_tone: "neutral", signal_strength: "medium" }],
  focus_segments: ["seg1"],
  summary: "rich ability output",
  demonstrated_abilities: [{ ability: "TypeScript", evidence: "extensive use" }],
  emerging_edges: [{ edge: "Rust", confidence: 0.6 }],
  new_connections: [],
  status: "passed",
};

const richPatternOutput: PatternLensOutput = {
  lens: "pattern",
  segments: [{ label: "seg1", topic: "topic", emotional_tone: "neutral", signal_strength: "medium" }],
  focus_segments: ["seg1"],
  summary: "rich pattern output",
  identified_patterns: [{ pattern: "deep work", occurrences: 3 }],
  abstraction_layers: [],
  cross_domain_connections: [],
  energy_signature: { energizing: ["coding"], draining: ["meetings"] },
  recurring_dilemmas: ["scope creep vs depth"],
  decision_heuristics: [],
  status: "passed",
};

const emptyLensOutput: LensOutput = {
  lens: "value",
  segments: [],
  focus_segments: [],
  summary: "empty",
  status: "failed",
};

describe("checkSignalDensity", () => {
  it("returns true for rich value output", () => {
    expect(checkSignalDensity(richValueOutput)).toBe(true);
  });

  it("returns true for rich ability output", () => {
    expect(checkSignalDensity(richAbilityOutput)).toBe(true);
  });

  it("returns true for rich pattern output", () => {
    expect(checkSignalDensity(richPatternOutput)).toBe(true);
  });

  it("returns false when both candidate_values and attraction_signals are empty", () => {
    const weak: ValueLensOutput = { ...richValueOutput, candidate_values: [], attraction_signals: [] };
    expect(checkSignalDensity(weak)).toBe(false);
  });

  it("returns false when both demonstrated_abilities and emerging_edges are empty", () => {
    const weak: AbilityLensOutput = {
      ...richAbilityOutput,
      demonstrated_abilities: [],
      emerging_edges: [],
    };
    expect(checkSignalDensity(weak)).toBe(false);
  });

  it("returns false when both identified_patterns and recurring_dilemmas are empty", () => {
    const weak: PatternLensOutput = {
      ...richPatternOutput,
      identified_patterns: [],
      recurring_dilemmas: [],
    };
    expect(checkSignalDensity(weak)).toBe(false);
  });
});

describe("evaluateGate", () => {
  it("returns 3/3 when all three lenses produce signals", () => {
    const state = createReflectionState();
    state.lensOutputs["value"] = richValueOutput;
    state.lensOutputs["ability"] = richAbilityOutput;
    state.lensOutputs["pattern"] = richPatternOutput;

    const result = evaluateGate(state);
    expect(result).toBe("3/3");
    expect(state.lensOutputs["value"]!.status).toBe("passed");
    expect(state.lensOutputs["ability"]!.status).toBe("passed");
    expect(state.lensOutputs["pattern"]!.status).toBe("passed");
  });

  it("returns 2/3 when one lens is degraded", () => {
    const state = createReflectionState();
    state.lensOutputs["value"] = { ...richValueOutput, candidate_values: [], attraction_signals: [] };
    state.lensOutputs["ability"] = richAbilityOutput;
    state.lensOutputs["pattern"] = richPatternOutput;

    const result = evaluateGate(state);
    expect(result).toBe("2/3");
    expect(state.lensOutputs["value"]!.status).toBe("degraded");
  });

  it("returns 0/3 and marks missing lenses as failed", () => {
    const state = createReflectionState();

    const result = evaluateGate(state);
    expect(result).toBe("0/3");
    expect(state.lensOutputs["value"]!.status).toBe("failed");
  });
});
