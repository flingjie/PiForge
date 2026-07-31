import { describe, it, expect } from "vitest";
import { parallel } from "../src/graph/concurrency.js";
import type { GraphNode, GraphState } from "../src/graph/types.js";

interface TestState extends GraphState {
  values: string[];
}

function makeState(): TestState {
  return {
    checkpoints: [],
    nodeResults: {},
    status: "running",
    values: [],
  };
}

function makeNode(name: string, delayMs: number, value: string): GraphNode<GraphState> {
  return { name, run: async () => { await new Promise((r) => setTimeout(r, delayMs)); return { value }; } };
}

function makeFailingNode(name: string, message: string): GraphNode<GraphState> {
  return { name, run: async () => { throw new Error(message); } };
}

describe("parallel", () => {
  it("runs nodes in parallel and waits for all", async () => {
    const state = makeState();
    const nodes = [makeNode("a", 10, "A"), makeNode("b", 5, "B"), makeNode("c", 15, "C")];

    const start = Date.now();
    const results = await parallel(nodes, state);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(results).toEqual({ a: { value: "A" }, b: { value: "B" }, c: { value: "C" } });
    expect(state.nodeResults["a"]!.status).toBe("success");
    expect(state.nodeResults["b"]!.status).toBe("success");
    expect(state.nodeResults["c"]!.status).toBe("success");
  });

  it("records failures without cancelling siblings", async () => {
    const state = makeState();
    const nodes = [makeNode("a", 5, "A"), makeFailingNode("b", "boom"), makeNode("c", 5, "C")];

    const results = await parallel(nodes, state);

    expect(results["a"]).toEqual({ value: "A" });
    expect(results["b"]).toBeNull();
    expect(results["c"]).toEqual({ value: "C" });
    expect(state.nodeResults["a"]!.status).toBe("success");
    expect(state.nodeResults["b"]!.status).toBe("failed");
    expect(state.nodeResults["b"]!.error).toBe("boom");
    expect(state.nodeResults["c"]!.status).toBe("success");
  });
});
