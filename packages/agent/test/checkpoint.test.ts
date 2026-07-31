import { describe, it, expect } from "vitest";
import {
  saveCheckpoint,
  restoreCheckpoint,
  shouldCheckpoint,
} from "../src/graph/checkpoint.js";
import type { GraphState } from "../src/graph/types.js";

interface TestState extends GraphState {
  counter: number;
  data: string;
}

function makeState(): TestState {
  return {
    checkpoints: [],
    nodeResults: {},
    status: "running",
    counter: 42,
    data: "initial",
  };
}

describe("saveCheckpoint", () => {
  it("appends a deep-copied snapshot to state.checkpoints", () => {
    const state = makeState();
    saveCheckpoint(state, "node_a");

    expect(state.checkpoints).toHaveLength(1);
    const cp = state.checkpoints[0]!;
    expect(cp.nodeName).toBe("node_a");
    expect(cp.timestamp).toBeTruthy();
    expect((cp.state as TestState).counter).toBe(42);
  });

  it("checkpoint is independent of live state mutations", () => {
    const state = makeState();
    saveCheckpoint(state, "node_a");

    state.counter = 99;
    expect((state.checkpoints[0]!.state as TestState).counter).toBe(42);
  });
});

describe("restoreCheckpoint", () => {
  it("restores state to the latest checkpoint", () => {
    const state = makeState();
    saveCheckpoint(state, "node_a");
    state.counter = 99;
    state.data = "mutated";

    const restoredFrom = restoreCheckpoint(state);
    expect(restoredFrom).toBe("node_a");
    expect(state.counter).toBe(42);
    expect(state.data).toBe("initial");
  });

  it("throws when no checkpoint exists", () => {
    const state = makeState();
    expect(() => restoreCheckpoint(state)).toThrow("No checkpoint available");
  });
});

describe("shouldCheckpoint", () => {
  it("returns true for barrier nodes", () => {
    const barriers = new Set(["adversary", "synthesize"]);
    expect(shouldCheckpoint("adversary", barriers)).toBe(true);
    expect(shouldCheckpoint("synthesize", barriers)).toBe(true);
  });

  it("returns false for non-barrier nodes", () => {
    const barriers = new Set(["adversary"]);
    expect(shouldCheckpoint("value_lens", barriers)).toBe(false);
  });
});
