import { describe, it, expect } from "vitest";
import { createReflectionState } from "../src/reflection/state.js";

describe("createReflectionState", () => {
  it("returns a state with all required fields defaulted", () => {
    const state = createReflectionState();
    expect(state.checkpoints).toEqual([]);
    expect(state.nodeResults).toEqual({});
    expect(state.status).toBe("running");
    expect(state.userDNA).toEqual({});
    expect(state.reflections).toEqual([]);
    expect(state.records).toEqual([]);
    expect(state.transcript).toBe("");
    expect(state.lensOutputs).toEqual({});
    expect(state.gateResult).toBe("0/3");
    expect(state.adversaryOutput).toBeNull();
    expect(state.proposedDiffs).toEqual([]);
    expect(state.acceptedDiffs).toEqual([]);
    expect(state.cycleCount).toBe(0);
  });

  it("accepts overrides for partial construction", () => {
    const state = createReflectionState({
      transcript: "hello world",
      userDNA: { values: { environment: { autonomy: 8 } } },
      gateResult: "3/3",
    });

    expect(state.transcript).toBe("hello world");
    expect(state.userDNA).toEqual({ values: { environment: { autonomy: 8 } } });
    expect(state.gateResult).toBe("3/3");
    // Non-overridden fields still get defaults.
    expect(state.cycleCount).toBe(0);
  });
});
