import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import {
  parseTodoGraph,
  updateStatus,
  readStatuses,
  generateReport,
  runOrchestrator,
} from "../../src/index.js";
import type { TodoNodeResult } from "../../src/index.js";

const TEST_TODO = "/tmp/test-todo-e2e.md";

// NOTE: the node table header must match the parser's NODE_TABLE_HEADER
// exactly (single-space cell separators). The Dependency Diagram section is
// ignored by the parser but kept to mirror the plan's todo.md format.
const fullTodo = `# TODO: auth

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | 类型定义 | auth/types.ts | tsc --noEmit | - | pending |
| 2  | 核心逻辑 | auth/handler.ts | vitest run | 1 | pending |
| 3  | 接口暴露 | auth/index.ts | tsc --noEmit | 1 | pending |
| 4  | 集成测试 | test/auth.test.ts | vitest run | 2, 3 | pending |

## Dependency Diagram
\`\`\`
[1]
 |
[2]  [3]
 |
[4]
\`\`\`

## Concurrent Groups
G1: [1]
G2: [2, 3]
G3: [4]
`;

describe("TODO Graph E2E", () => {
  beforeEach(() => {
    writeFileSync(TEST_TODO, fullTodo, "utf-8");
  });

  afterEach(() => {
    try { unlinkSync(TEST_TODO); } catch { /* ok */ }
  });

  it("full pipeline: parse → orchestrate → verify file state", async () => {
    // 1. Parse
    const graph = parseTodoGraph(fullTodo);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.groups).toEqual([[1], [2, 3], [4]]);

    // 2. Run orchestrator with a simple executor
    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      async (node) => ({ output: `built ${node.name}` }),
    );

    // 3. Report is correct
    expect(report.completed).toBe(4);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.totalNodes).toBe(4);

    // 4. File status is updated
    const statuses = readStatuses(TEST_TODO);
    for (const [, status] of statuses) {
      expect(status).toBe("completed");
    }

    // 5. File content is still valid — re-parseable
    const content = readFileSync(TEST_TODO, "utf-8");
    const reParsed = parseTodoGraph(content);
    expect(reParsed.nodes).toHaveLength(4);
    expect(reParsed.nodes.every((n) => n.status === "completed")).toBe(true);
  });

  it("partial failure: root fails, downstream skipped", async () => {
    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      async (node) => {
        if (node.id === 1) throw new Error("root failure");
        return { output: node.name };
      },
    );

    expect(report.failed).toBe(1);
    expect(report.skipped).toBe(3);

    // Verify status in file
    const statuses = readStatuses(TEST_TODO);
    expect(statuses.get(1)).toBe("failed");
    expect(statuses.get(2)).toBe("skipped");
    expect(statuses.get(3)).toBe("skipped");
    expect(statuses.get(4)).toBe("skipped");
  });

  it("partial failure: one sibling fails, other proceeds", async () => {
    const report = await runOrchestrator(
      { maxRetries: 0, todoPath: TEST_TODO },
      async (node) => {
        if (node.id === 2) throw new Error("handler fail");
        return { output: node.name };
      },
    );

    expect(report.failed).toBe(1); // node 2
    expect(report.completed).toBe(2); // node 1 and 3
    expect(report.skipped).toBe(1); // node 4 (depends on failed 2)

    const statuses = readStatuses(TEST_TODO);
    expect(statuses.get(1)).toBe("completed");
    expect(statuses.get(2)).toBe("failed");
    expect(statuses.get(3)).toBe("completed");
    expect(statuses.get(4)).toBe("skipped");
  });

  it("retry: recovers from transient errors", async () => {
    let attempts = 0;
    const report = await runOrchestrator(
      { maxRetries: 3, todoPath: TEST_TODO },
      async (node) => {
        if (node.id === 1 && attempts++ < 2) {
          throw new Error("transient");
        }
        return { output: node.name };
      },
    );

    expect(attempts).toBe(3); // init + 2 retries
    expect(report.completed).toBe(4);
  }, 10000);
});
