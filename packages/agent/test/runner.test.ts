import { describe, it, expect } from "vitest";
import { runGraph } from "../src/graph/runner.js";
import type { GraphNode, GraphState } from "../src/graph/types.js";
import { DEFAULT_GRAPH_CONFIG } from "../src/graph/types.js";

interface TestState extends GraphState {
  values: string[];
}

function makeState(): TestState {
  return { checkpoints: [], nodeResults: {}, status: "running", values: [] };
}

describe("runGraph", () => {
  it("executes a linear chain via route function", async () => {
    const state = makeState();
    const nodes: Record<string, GraphNode<TestState>> = {
      a: { name: "a", run: async (i) => { i.state.values.push("a"); return "a"; } },
      b: { name: "b", run: async (i) => { i.state.values.push("b"); return "b"; } },
      c: { name: "c", run: async (i) => { i.state.values.push("c"); return "c"; } },
    };

    const route = (name: string): string[] | null => {
      switch (name) {
        case "a": return ["b"];
        case "b": return ["c"];
        default: return null;
      }
    };

    const result = await runGraph(nodes, state, DEFAULT_GRAPH_CONFIG, route, new Set(), ["a"]);
    expect(result.values).toEqual(["a", "b", "c"]);
    expect(result.status).toBe("completed");
  });

  it("fans out in parallel when route returns array", async () => {
    const state = makeState();
    const nodes: Record<string, GraphNode<TestState>> = {
      start: { name: "start", run: async () => "start" },
      worker_a: { name: "worker_a", run: async (i) => { i.state.values.push("A"); return "A"; } },
      worker_b: { name: "worker_b", run: async (i) => { i.state.values.push("B"); return "B"; } },
      worker_c: { name: "worker_c", run: async (i) => { i.state.values.push("C"); return "C"; } },
    };

    const route = (name: string): string[] | null => {
      if (name === "start") return ["worker_a", "worker_b", "worker_c"];
      return null;
    };

    const result = await runGraph(nodes, state, DEFAULT_GRAPH_CONFIG, route, new Set(), ["start"]);
    expect(result.values).toContain("A");
    expect(result.values).toContain("B");
    expect(result.values).toContain("C");
    expect(result.status).toBe("completed");
  });

  it("aborts when a node fails", async () => {
    const state = makeState();
    const nodes: Record<string, GraphNode<TestState>> = {
      ok: { name: "ok", run: async () => "ok" },
      boom: { name: "boom", run: async () => { throw new Error("kaboom"); } },
    };

    const route = (name: string): string[] | null => name === "ok" ? ["boom"] : null;

    const result = await runGraph(nodes, state, DEFAULT_GRAPH_CONFIG, route, new Set(), ["ok"]);
    expect(result.status).toBe("aborted");
    expect(result.nodeResults["boom"]!.status).toBe("failed");
    expect(result.nodeResults["boom"]!.error).toContain("kaboom");
  });

  it("partial_accepted when maxCycles exceeded", async () => {
    const state = makeState();
    let cycleCount = 0;

    const nodes: Record<string, GraphNode<TestState>> = {
      gate: { name: "gate", run: async () => ({ accepted: false }) },
      work: { name: "work", run: async (i) => { cycleCount++; i.state.values.push(`w${cycleCount}`); return "work"; } },
    };

    const route = (name: string): string[] | null => {
      if (name === "work") return ["gate"];
      if (name === "gate") return ["work"]; // always loops back
      return null;
    };

    const result = await runGraph(
      nodes, state, { checkpointing: false, maxCycles: 2 }, route, new Set(), ["work"],
    );
    expect(result.status).toBe("partial_accepted");
  });

  it("writes checkpoints at barrier nodes", async () => {
    const state = makeState();
    const barrierNodes = new Set(["a", "c"]);

    const nodes: Record<string, GraphNode<TestState>> = {
      a: { name: "a", run: async (i) => { i.state.values.push("a"); return "a"; } },
      b: { name: "b", run: async (i) => { i.state.values.push("b"); return "b"; } },
      c: { name: "c", run: async (i) => { i.state.values.push("c"); return "c"; } },
    };

    const route = (name: string): string[] | null => {
      if (name === "a") return ["b"];
      if (name === "b") return ["c"];
      return null;
    };

    const result = await runGraph(
      nodes, state, { checkpointing: true, maxCycles: 3 }, route, barrierNodes, ["a"],
    );
    expect(result.checkpoints).toHaveLength(2);
    expect(result.checkpoints[0]!.nodeName).toBe("a");
    expect(result.checkpoints[1]!.nodeName).toBe("c");
  });
});
