import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { updateStatus, readStatuses } from "../../src/todo/status.js";

const TEST_FILE = "/tmp/test-todo-status.md";

const sampleTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | task1 | a.ts  | vitest | -        | pending |
| 2  | task2 | b.ts  | vitest | 1        | pending |
| 3  | task3 | c.ts  | vitest | 1        | pending |

## Concurrent Groups
G1: [1]
G2: [2, 3]
`;

describe("updateStatus", () => {
  beforeEach(() => {
    writeFileSync(TEST_FILE, sampleTodo, "utf-8");
  });

  afterEach(() => {
    try { unlinkSync(TEST_FILE); } catch { /* ok */ }
  });

  it("updates a single node status from pending to in_progress", () => {
    updateStatus(TEST_FILE, 1, "in_progress");
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.get(1)).toBe("in_progress");
  });

  it("updates a single node status to completed", () => {
    updateStatus(TEST_FILE, 2, "completed");
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.get(2)).toBe("completed");
  });

  it("updates to failed", () => {
    updateStatus(TEST_FILE, 3, "failed");
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.get(3)).toBe("failed");
  });

  it("updates to skipped", () => {
    updateStatus(TEST_FILE, 1, "skipped");
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.get(1)).toBe("skipped");
  });

  it("does not affect other nodes", () => {
    updateStatus(TEST_FILE, 1, "completed");
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.get(2)).toBe("pending");
    expect(statuses.get(3)).toBe("pending");
  });

  it("throws on invalid node ID", () => {
    expect(() => updateStatus(TEST_FILE, 99, "completed")).toThrow(
      "Node with ID 99 not found",
    );
  });

  it("throws on invalid status value", () => {
    expect(() => updateStatus(TEST_FILE, 1, "done")).toThrow(
      "Invalid status",
    );
    expect(() => updateStatus(TEST_FILE, 1, "pendng")).toThrow(
      "Invalid status",
    );
    expect(() => updateStatus(TEST_FILE, 1, "pending|evil")).toThrow(
      "Invalid status",
    );
  });

  it("does not modify the file when the status is invalid", () => {
    expect(() => updateStatus(TEST_FILE, 1, "bad status")).toThrow(
      "Invalid status",
    );
    const content = readFileSync(TEST_FILE, "utf-8");
    expect(content).toContain("| 1  | task1 | a.ts  | vitest | -        | pending |");
  });

  it("maintains exact content structure after update", () => {
    updateStatus(TEST_FILE, 1, "completed");
    const content = readFileSync(TEST_FILE, "utf-8");
    // Should still be parseable as a valid TODO
    expect(content).toContain("## Node Table");
    expect(content).toContain("## Concurrent Groups");
    expect(content).toContain("| 1  | task1 | a.ts  | vitest | -        | completed |");
  });
});

describe("readStatuses", () => {
  beforeEach(() => {
    writeFileSync(TEST_FILE, sampleTodo, "utf-8");
  });

  afterEach(() => {
    try { unlinkSync(TEST_FILE); } catch { /* ok */ }
  });

  it("returns all node statuses", () => {
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.size).toBe(3);
    expect(statuses.get(1)).toBe("pending");
    expect(statuses.get(2)).toBe("pending");
    expect(statuses.get(3)).toBe("pending");
  });
});
