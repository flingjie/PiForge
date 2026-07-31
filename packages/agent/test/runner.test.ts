import { describe, it, expect } from "vitest";
import { runGraph } from "../src/graph/runner.js";
import type { GraphNode, GraphState, Edge, GraphConfig, ToolSet } from "../src/graph/types.js";
import { DEFAULT_GRAPH_CONFIG } from "../src/graph/types.js";

interface TestState extends GraphState {
  values: string[];
}

function makeState(): TestState {
  return {
    checkpoints: [],
    routeLog: [],
    nodeResults: {},
    status: "running",
    values: [],
  };
}

const emptyTools = (): ToolSet => ({});

describe("runGraph", () => {
  it("executes a linear chain of nodes", async () => {
    const state = makeState();
    const nodes: Record<string, GraphNode<TestState>> = {
      a: {
        name: "a",
        run: async (input) => {
          input.state.values.push("a");
          return "a-done";
        },
      },
      b: {
        name: "b",
        run: async (input) => {
          input.state.values.push("b");
          return "b-done";
        },
      },
      c: {
        name: "c",
        run: async (input) => {
          input.state.values.push("c");
          return "c-done";
        },
      },
    };

    const edges: Edge<TestState>[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c" }, // terminal
    ];

    const result = await runGraph(
      nodes,
      edges,
      state,
      DEFAULT_GRAPH_CONFIG,
      () => emptyTools(),
      new Set(),
    );

    expect(result.values).toEqual(["a", "b", "c"]);
    expect(result.status).toBe("completed");
  });

  it("fans out in parallel when route returns array", async () => {
    const state = makeState();
    const nodes: Record<string, GraphNode<TestState>> = {
      start: {
        name: "start",
        run: async () => "start-done",
      },
      worker_a: {
        name: "worker_a",
        run: async (input) => {
          input.state.values.push("A");
          return "A";
        },
      },
      worker_b: {
        name: "worker_b",
        run: async (input) => {
          input.state.values.push("B");
          return "B";
        },
      },
      worker_c: {
        name: "worker_c",
        run: async (input) => {
          input.state.values.push("C");
          return "C";
        },
      },
    };

    const edges: Edge<TestState>[] = [
      {
        from: "start",
        condition: () => ["worker_a", "worker_b", "worker_c"],
      },
      { from: "worker_a" },
      { from: "worker_b" },
      { from: "worker_c" },
    ];

    const result = await runGraph(
      nodes,
      edges,
      state,
      DEFAULT_GRAPH_CONFIG,
      () => emptyTools(),
      new Set(),
      "start",
    );

    // All three workers ran (order within parallel group is non-deterministic).
    expect(result.values).toContain("A");
    expect(result.values).toContain("B");
    expect(result.values).toContain("C");
    expect(result.status).toBe("completed");
  });

  it("aborts when a node fails", async () => {
    const state = makeState();
    const nodes: Record<string, GraphNode<TestState>> = {
      ok: {
        name: "ok",
        run: async () => "ok",
      },
      boom: {
        name: "boom",
        run: async () => {
          throw new Error("kaboom");
        },
      },
    };

    const edges: Edge<TestState>[] = [
      { from: "ok", to: "boom" },
    ];

    const result = await runGraph(
      nodes,
      edges,
      state,
      DEFAULT_GRAPH_CONFIG,
      () => emptyTools(),
      new Set(),
    );

    expect(result.status).toBe("aborted");
    expect(result.nodeResults["boom"]!.status).toBe("failed");
    expect(result.nodeResults["boom"]!.error).toContain("kaboom");
  });

  it("decrees partial_accepted when maxCycles exceeded", async () => {
    const state = makeState();
    let cycleCount = 0;

    const nodes: Record<string, GraphNode<TestState>> = {
      gate: {
        name: "gate",
        run: async () => ({ accepted: false }),
      },
      work: {
        name: "work",
        run: async (input) => {
          cycleCount++;
          input.state.values.push(`w${cycleCount}`);
          return "work-done";
        },
      },
    };

    const edges: Edge<TestState>[] = [
      { from: "work", to: "gate" },
      {
        from: "gate",
        condition: (s) => {
          // Always reject, causing loop back to work.
          return "work";
        },
      },
    ];

    const config: GraphConfig = { checkpointing: false, maxCycles: 2 };
    const result = await runGraph(
      nodes,
      edges,
      state,
      config,
      () => emptyTools(),
      new Set(),
    );

    // We hit work → gate → work → gate → work → gate (3x, exceeding maxCycles=2).
    expect(result.status).toBe("partial_accepted");
    // work ran 3 times (initial + 2 cycles), then maxCycles(2) exceeded on the 3rd loop.
    expect(cycleCount).toBeGreaterThanOrEqual(2);
  });

  it("writes checkpoints at barrier nodes", async () => {
    const state = makeState();
    const barrierNodes = new Set(["a", "c"]); // checkpoint after a and c.

    const nodes: Record<string, GraphNode<TestState>> = {
      a: {
        name: "a",
        run: async (input) => {
          input.state.values.push("a");
          return "a";
        },
      },
      b: {
        name: "b",
        run: async (input) => {
          input.state.values.push("b");
          return "b";
        },
      },
      c: {
        name: "c",
        run: async (input) => {
          input.state.values.push("c");
          return "c";
        },
      },
    };

    const edges: Edge<TestState>[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c" },
    ];

    const result = await runGraph(
      nodes,
      edges,
      state,
      { checkpointing: true, maxCycles: 3 },
      () => emptyTools(),
      barrierNodes,
    );

    // Checkpoints at "a" and "c".
    expect(result.checkpoints).toHaveLength(2);
    expect(result.checkpoints[0]!.nodeName).toBe("a");
    expect(result.checkpoints[1]!.nodeName).toBe("c");
  });
});
