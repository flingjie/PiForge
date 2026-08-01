import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { runOrchestrator } from "../../src/todo/orchestrator.js";
import type { NodeExecutor, TodoNode } from "../../src/todo/types.js";

const TEST_TODO = "/tmp/test-todo-orch.md";

const sampleTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | task1 | a.ts  | tsc   | -        | pending |
| 2  | task2 | b.ts  | tsc   | 1        | pending |
| 3  | task3 | c.ts  | tsc   | 1        | pending |
| 4  | task4 | d.ts  | tsc   | 2, 3     | pending |

## Concurrent Groups
G1: [1]
G2: [2, 3]
G3: [4]
`;

function makeExecutor(
  results: Map<number, { output: unknown } | Error>,
): NodeExecutor {
  return async (node: TodoNode) => {
    const result = results.get(node.id);
    if (result instanceof Error) throw result;
    return result ?? { output: `default-${node.id}` };
  };
}

describe("runOrchestrator", () => {
  beforeEach(() => {
    writeFileSync(TEST_TODO, sampleTodo, "utf-8");
  });

  afterEach(() => {
    try { unlinkSync(TEST_TODO); } catch { /* ok */ }
  });

  it("executes all nodes in a simple DAG successfully", async () => {
    const executor = makeExecutor(new Map());
    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      executor,
    );

    expect(report.totalNodes).toBe(4);
    expect(report.completed).toBe(4);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.durationMs).toBeGreaterThan(0);
  });

  it("executes groups sequentially", async () => {
    const executionOrder: number[] = [];
    const executor: NodeExecutor = async (node) => {
      executionOrder.push(node.id);
      await new Promise((r) => setTimeout(r, 10));
      return { output: node.name };
    };

    await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      executor,
    );

    // Node 1 must be first (G1). Nodes 2 and 3 in G2 run before node 4 (G3).
    expect(executionOrder[0]).toBe(1);
    // Node 4 must be last
    expect(executionOrder[executionOrder.length - 1]).toBe(4);
    // Nodes 2 and 3 appear before 4
    const idx2 = executionOrder.indexOf(2);
    const idx3 = executionOrder.indexOf(3);
    const idx4 = executionOrder.indexOf(4);
    expect(idx2).toBeLessThan(idx4);
    expect(idx3).toBeLessThan(idx4);
  });

  it("retries failed nodes up to maxRetries", async () => {
    let attempts = 0;
    const executor: NodeExecutor = async (node) => {
      if (node.id === 1) {
        attempts++;
        if (attempts < 3) throw new Error("transient error");
      }
      return { output: node.name };
    };

    const report = await runOrchestrator(
      { maxRetries: 2, todoPath: TEST_TODO },
      executor,
    );

    expect(attempts).toBe(3); // initial + 2 retries
    expect(report.completed).toBe(4);
    expect(report.failed).toBe(0);
  }, 10000);

  it("marks node as failed after exhausting retries", async () => {
    const executor: NodeExecutor = async (node) => {
      if (node.id === 1) throw new Error("permanent error");
      return { output: node.name };
    };

    const report = await runOrchestrator(
      { maxRetries: 1, todoPath: TEST_TODO },
      executor,
    );

    const node1 = report.nodes.find((n) => n.nodeId === 1);
    expect(node1?.status).toBe("failed");
    expect(node1?.error).toContain("permanent error");
  });

  it("skips downstream nodes when upstream fails", async () => {
    const executor: NodeExecutor = async (node) => {
      if (node.id === 1) throw new Error("root failure");
      return { output: node.name };
    };

    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      executor,
    );

    // Node 1: failed. Nodes 2, 3: depend on 1 → skipped. Node 4: depends on 2,3 → skipped.
    expect(report.failed).toBe(1);
    expect(report.skipped).toBe(3);
  });

  it("updates status in the todo file after execution", async () => {
    const executor = makeExecutor(new Map());
    await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      executor,
    );

    const { readFileSync } = await import("node:fs");
    const content = readFileSync(TEST_TODO, "utf-8");
    expect(content).toContain("completed");
    expect(content).not.toContain("pending");
  });

  it("does not skip siblings when one node in a group fails", async () => {
    const executor: NodeExecutor = async (node) => {
      // Node 2 fails, node 3 succeeds — both in G2, independent
      if (node.id === 2) throw new Error("node 2 failure");
      return { output: node.name };
    };

    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      executor,
    );

    const node2 = report.nodes.find((n) => n.nodeId === 2);
    const node3 = report.nodes.find((n) => n.nodeId === 3);
    expect(node2?.status).toBe("failed");
    expect(node3?.status).toBe("success");
    // Node 4 depends on both 2 AND 3 → one failed → skipped
    const node4 = report.nodes.find((n) => n.nodeId === 4);
    expect(node4?.status).toBe("skipped");
  });

  it("handles empty groups without error", async () => {
    const emptyGroupTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | task1 | a.ts  | tsc   | -        | pending |
| 2  | task2 | b.ts  | tsc   | 1        | pending |

## Concurrent Groups
G1: [1]
G2: []
G3: [2]
`;
    writeFileSync(TEST_TODO, emptyGroupTodo, "utf-8");

    const executor = makeExecutor(new Map());
    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      executor,
    );

    expect(report.totalNodes).toBe(2);
    expect(report.completed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
  });

  it("dry-run parses and validates without executing", async () => {
    let executed = 0;
    const executor: NodeExecutor = async (node) => {
      executed++;
      return { output: node.name };
    };

    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO, dryRun: true },
      executor,
    );

    expect(executed).toBe(0);
    expect(report.totalNodes).toBe(4);
    expect(report.completed).toBe(4);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.durationMs).toBe(0);
    expect(report.note).toContain("dry-run");
    for (const node of report.nodes) {
      expect(node.status).toBe("success");
      expect(node.durationMs).toBe(0);
      expect(node.output).toBeNull();
    }

    // The file is untouched — every node is still pending.
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(TEST_TODO, "utf-8");
    expect(content).toContain("pending");
    expect(content).not.toContain("completed");
  });
});
