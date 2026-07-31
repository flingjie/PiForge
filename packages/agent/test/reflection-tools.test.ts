import { describe, it, expect } from "vitest";
import { reflectionTools } from "../src/reflection/tools.js";
import { createReflectionState } from "../src/reflection/state.js";

describe("readState", () => {
  it("returns a snapshot of the current reflection state", () => {
    const state = createReflectionState({
      userDNA: { values: { creation: 9 } },
      transcript: "sample transcript",
    });

    const result = reflectionTools.readState?.execute({}, state) as Record<string, unknown>;
    expect(result.userDNA).toEqual({ values: { creation: 9 } });
    expect(result.transcript).toBe("sample transcript");
  });

  it("throws when state is not provided", () => {
    expect(() => reflectionTools.readState?.execute({})).toThrow("no state provided");
  });
});

describe("writeReflection", () => {
  it("appends a reflection event to state.reflections", () => {
    const state = createReflectionState();
    expect(state.reflections).toHaveLength(0);

    const result = reflectionTools.writeReflection?.execute(
      { lensOutputs: { value: { status: "passed" } } },
      state,
    ) as { written: boolean };

    expect(result.written).toBe(true);
    expect(state.reflections).toHaveLength(1);
    const event = state.reflections[0] as Record<string, unknown>;
    expect(event.status).toBe("complete");
  });
});

describe("updateDNA", () => {
  it("adds a new preference", () => {
    const state = createReflectionState();

    const result = reflectionTools.updateDNA?.execute(
      {
        diffs: [
          {
            section: "preferences",
            action: "add",
            target: "theme",
            value: "dark",
            rationale: "user prefers dark mode",
          },
        ],
      },
      state,
    ) as { applied: number };

    expect(result.applied).toBe(1);
    expect((state.userDNA.preferences as Record<string, unknown>).theme).toBe("dark");
  });

  it("modifies an existing value", () => {
    const state = createReflectionState({
      userDNA: { preferences: { theme: "light" } },
    });

    reflectionTools.updateDNA?.execute(
      {
        diffs: [
          {
            section: "preferences",
            action: "modify",
            target: "theme",
            value: "dark",
            rationale: "user switched to dark mode",
          },
        ],
      },
      state,
    );

    expect((state.userDNA.preferences as Record<string, unknown>).theme).toBe("dark");
  });

  it("removes an existing value", () => {
    const state = createReflectionState({
      userDNA: { preferences: { theme: "light", fontSize: 14 } },
    });

    reflectionTools.updateDNA?.execute(
      {
        diffs: [
          {
            section: "preferences",
            action: "remove",
            target: "theme",
            value: null,
            rationale: "no longer relevant",
          },
        ],
      },
      state,
    );

    expect((state.userDNA.preferences as Record<string, unknown>).theme).toBeUndefined();
    expect((state.userDNA.preferences as Record<string, unknown>).fontSize).toBe(14);
  });
});

describe("getTranscript", () => {
  it("returns the stored transcript", () => {
    const state = createReflectionState({ transcript: "hello world" });
    const result = reflectionTools.getTranscript?.execute({}, state) as { transcript: string };
    expect(result.transcript).toBe("hello world");
  });
});
