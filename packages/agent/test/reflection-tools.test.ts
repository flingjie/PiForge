import { describe, it, expect } from "vitest";
import { writeReflection, updateDNA } from "../src/reflection/tools.js";
import { createReflectionState } from "../src/reflection/state.js";

describe("writeReflection", () => {
  it("appends a reflection event to state.reflections", () => {
    const state = createReflectionState();
    expect(state.reflections).toHaveLength(0);

    const result = writeReflection(state, {
      lensOutputs: { value: { status: "passed" } },
      adversaryOutput: null,
      proposedDiffs: [],
    });

    expect(result).toBe(true);
    expect(state.reflections).toHaveLength(1);
    const event = state.reflections[0] as Record<string, unknown>;
    expect(event.status).toBe("complete");
  });
});

describe("updateDNA", () => {
  it("adds a new preference", () => {
    const state = createReflectionState();

    const applied = updateDNA(state, [
      { section: "preferences", action: "add", target: "theme", value: "dark", rationale: "user prefers dark mode" },
    ]);

    expect(applied).toBe(1);
    expect((state.userDNA.preferences as Record<string, unknown>).theme).toBe("dark");
  });

  it("modifies an existing value", () => {
    const state = createReflectionState({ userDNA: { preferences: { theme: "light" } } });

    updateDNA(state, [
      { section: "preferences", action: "modify", target: "theme", value: "dark", rationale: "switched" },
    ]);

    expect((state.userDNA.preferences as Record<string, unknown>).theme).toBe("dark");
  });

  it("removes an existing value", () => {
    const state = createReflectionState({ userDNA: { preferences: { theme: "light", fontSize: 14 } } });

    updateDNA(state, [
      { section: "preferences", action: "remove", target: "theme", value: null, rationale: "no longer relevant" },
    ]);

    expect((state.userDNA.preferences as Record<string, unknown>).theme).toBeUndefined();
    expect((state.userDNA.preferences as Record<string, unknown>).fontSize).toBe(14);
  });
});
