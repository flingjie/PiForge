import { describe, it, expect } from "vitest";
import { generateReport } from "../../src/todo/report.js";
import type { TodoNodeResult } from "../../src/todo/types.js";

function makeResult(
  overrides: Partial<TodoNodeResult> & { nodeId: number; nodeName: string },
): TodoNodeResult {
  return {
    status: "success",
    output: null,
    durationMs: 100,
    retryCount: 0,
    ...overrides,
  };
}

describe("generateReport", () => {
  it("counts completed nodes", () => {
    const results: TodoNodeResult[] = [
      makeResult({ nodeId: 1, nodeName: "a", status: "success" }),
      makeResult({ nodeId: 2, nodeName: "b", status: "success" }),
    ];
    const report = generateReport(results, Date.now() - 1000);
    expect(report.totalNodes).toBe(2);
    expect(report.completed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
  });

  it("counts failed and skipped nodes", () => {
    const results: TodoNodeResult[] = [
      makeResult({ nodeId: 1, nodeName: "a", status: "success" }),
      makeResult({
        nodeId: 2,
        nodeName: "b",
        status: "failed",
        error: "timeout",
      }),
      makeResult({ nodeId: 3, nodeName: "c", status: "skipped" }),
    ];
    const report = generateReport(results, Date.now() - 5000);
    expect(report.totalNodes).toBe(3);
    expect(report.completed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.skipped).toBe(1);
  });

  it("includes error messages on failed nodes", () => {
    const results: TodoNodeResult[] = [
      makeResult({
        nodeId: 1,
        nodeName: "fail",
        status: "failed",
        error: "something broke",
      }),
    ];
    const report = generateReport(results, Date.now() - 100);
    expect(report.nodes[0]?.error).toBe("something broke");
  });

  it("records positive duration", () => {
    const start = Date.now() - 1500;
    const results: TodoNodeResult[] = [
      makeResult({ nodeId: 1, nodeName: "a", status: "success" }),
    ];
    const report = generateReport(results, start);
    expect(report.durationMs).toBeGreaterThan(0);
  });

  it("handles empty results", () => {
    const report = generateReport([], Date.now());
    expect(report.totalNodes).toBe(0);
    expect(report.completed).toBe(0);
  });
});
