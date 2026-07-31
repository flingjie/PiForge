import { describe, it, expect } from "vitest";
import { withRetry, RetryExhaustedError } from "../src/graph/retry.js";
import type { GraphNode, GraphState } from "../src/graph/types.js";

interface TestState extends GraphState {
  _feedback?: Record<string, unknown>;
}

function makeState(): TestState {
  return { checkpoints: [], nodeResults: {}, status: "running" };
}

describe("withRetry", () => {
  it("returns output on first success, no retries", async () => {
    const node: GraphNode<TestState> = {
      name: "test",
      run: async () => "ok",
      retryConfig: { maxRetries: 2, feedbackFn: () => ({}) },
    };

    const result = await withRetry(node, { state: makeState() }, "test");
    expect(result.output).toBe("ok");
    expect(result.retryCount).toBe(0);
  });

  it("retries on failure and succeeds", async () => {
    let calls = 0;
    const node: GraphNode<TestState> = {
      name: "flaky",
      run: async () => { calls++; if (calls < 2) throw new Error("transient"); return "recovered"; },
      retryConfig: { maxRetries: 2, feedbackFn: (n) => ({ attempt: n, hint: "try harder" }) },
    };

    const result = await withRetry(node, { state: makeState() }, "flaky");
    expect(result.output).toBe("recovered");
    expect(result.retryCount).toBe(1);
    expect(calls).toBe(2);
  });

  it("throws RetryExhaustedError when all retries fail", async () => {
    const node: GraphNode<TestState> = {
      name: "doomed",
      run: async () => { throw new Error("always fails"); },
      retryConfig: { maxRetries: 1, feedbackFn: (n) => ({ attempt: n }) },
    };

    await expect(withRetry(node, { state: makeState() }, "doomed")).rejects.toThrow(RetryExhaustedError);
  });

  it("never retries when node has no retryConfig", async () => {
    let calls = 0;
    const node: GraphNode<TestState> = {
      name: "simple",
      run: async () => { calls++; throw new Error("fail"); },
    };

    await expect(withRetry(node, { state: makeState() }, "simple")).rejects.toThrow(RetryExhaustedError);
    expect(calls).toBe(1);
  });
});
