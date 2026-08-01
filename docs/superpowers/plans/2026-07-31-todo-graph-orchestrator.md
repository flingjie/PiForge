# TODO Graph & Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a structured task dependency graph parser and execution orchestrator that reads `todo.md`, dispatches nodes by concurrent group via subagents, manages Status updates with single-writer semantics, and handles failures with retry/skip.

**Architecture:** A new `todo/` module inside `packages/agent/src/` that defines types, parses the Markdown-based TODO format, and provides an Orchestrator that sequences concurrent groups. The Orchestrator wraps the existing graph runtime primitives (`parallel`, `withRetry`) but does NOT use `runGraph` — the execution model is simpler: static groups, sequential dispatch, no dynamic routing.

**Tech Stack:** TypeScript (strict), Node.js, Vitest. No external dependencies beyond what's already in `packages/agent/package.json`.

## Global Constraints

- TypeScript strict mode, no `any`, erasable syntax only
- Top-level imports only, no dynamic imports
- All new code in `packages/agent/src/todo/`, tests in `packages/agent/test/todo/`
- Test using Vitest via `npx vitest run` from package root
- Run `npx tsc -p tsconfig.json --noEmit` for type checking

---

## Execution Graph

### Node Table

| ID | Name | Files | Verify | DependsOn |
|----|------|-------|--------|-----------|
| 1  | Types | `todo/types.ts` | `npx tsc -p tsconfig.json --noEmit` | - |
| 2  | Parser | `todo/parser.ts`, `test/todo/parser.test.ts` | `npx vitest run test/todo/parser.test.ts` | 1 |
| 3  | Status Manager | `todo/status.ts`, `test/todo/status.test.ts` | `npx vitest run test/todo/status.test.ts` | 1 |
| 4  | Report Generator | `todo/report.ts`, `test/todo/report.test.ts` | `npx vitest run test/todo/report.test.ts` | 1 |
| 5  | Orchestrator | `todo/orchestrator.ts`, `test/todo/orchestrator.test.ts` | `npx vitest run test/todo/orchestrator.test.ts` | 2, 3, 4 |
| 6  | Integration & Export | `src/index.ts`, `test/todo/e2e.test.ts` | `npx vitest run test/todo/e2e.test.ts` | 5 |

### Dependency Diagram

```
          [1] Types
           |
   ┌───────┼───────┐
   │       │       │
  [2]     [3]     [4]
Parser  Status   Report
   │       │       │
   └───────┼───────┘
           │
       [5] Orchestrator
           │
       [6] Integration
```

### Concurrent Groups

```
G1: [1]
G2: [2, 3, 4]    ← 无互依赖，并行
G3: [5]
G4: [6]
```

---

### Task 1: Types

**Files:**
- Create: `packages/agent/src/todo/types.ts`

**Interfaces:**
- Produces: `TodoNode`, `TodoGraph`, `TodoConfig`, `ExecutionReport`, `NodeResult` (extended), `NodeExecutor`

- [ ] **Step 1: Write types.ts**

```typescript
// No imports — these types are standalone and do not extend the graph runtime's
// NodeResult because the status unions differ (NodeResult uses "success"|"degraded"|"failed"
// while TodoNodeResult uses "success"|"failed"|"skipped").

/** A single node in the TODO graph, as parsed from todo.md. */
export interface TodoNode {
  id: number;
  name: string;
  files: string[];
  verify: string;
  dependsOn: number[];
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
}

/** The parsed TODO graph — nodes plus execution groups. */
export interface TodoGraph {
  nodes: TodoNode[];
  /** Groups execute sequentially; nodes within a group run in parallel. */
  groups: number[][];
}

/** Configuration for an orchestrator run. */
export interface TodoConfig {
  /** Max retries per node before marking it failed (default 3). */
  maxRetries: number;
  /** Absolute path to the todo.md file. */
  todoPath: string;
}

/** Result of a single node execution. */
export interface TodoNodeResult {
  nodeId: number;
  nodeName: string;
  status: "success" | "failed" | "skipped";
  output: unknown;
  error?: string;
  durationMs: number;
  retryCount: number;
}

/** A function that executes a single node — supplied by the host environment. */
export type NodeExecutor = (node: TodoNode) => Promise<{ output: unknown }>;

/** Final report after an orchestrator run. */
export interface ExecutionReport {
  totalNodes: number;
  completed: number;
  failed: number;
  skipped: number;
  nodes: TodoNodeResult[];
  durationMs: number;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/todo/types.ts
git commit -m "feat(agent): add TODO graph types"
```

---

### Task 2: Parser

**Files:**
- Create: `packages/agent/src/todo/parser.ts`
- Create: `packages/agent/test/todo/parser.test.ts`

**Interfaces:**
- Consumes: `TodoNode`, `TodoGraph` from `todo/types.ts`
- Produces: `parseTodoGraph(content: string): TodoGraph`

- [ ] **Step 1: Write the failing parser test**

Create `packages/agent/test/todo/parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseTodoGraph } from "../../src/todo/parser.js";

const sampleTodo = `# TODO: auth

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

describe("parseTodoGraph", () => {
  it("parses node table correctly", () => {
    const graph = parseTodoGraph(sampleTodo);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes[0]).toMatchObject({
      id: 1,
      name: "类型定义",
      files: ["auth/types.ts"],
      verify: "tsc --noEmit",
      dependsOn: [],
      status: "pending",
    });
  });

  it("parses DependsOn with multiple IDs", () => {
    const graph = parseTodoGraph(sampleTodo);
    const node4 = graph.nodes.find((n) => n.id === 4);
    expect(node4?.dependsOn).toEqual([2, 3]);
  });

  it("parses DependsOn with '-' as empty", () => {
    const graph = parseTodoGraph(sampleTodo);
    const node1 = graph.nodes.find((n) => n.id === 1);
    expect(node1?.dependsOn).toEqual([]);
  });

  it("parses concurrent groups", () => {
    const graph = parseTodoGraph(sampleTodo);
    expect(graph.groups).toEqual([[1], [2, 3], [4]]);
  });

  it("throws on empty content", () => {
    expect(() => parseTodoGraph("")).toThrow("No node table found");
  });

  it("throws on missing groups section", () => {
    const noGroups = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | test | test.ts | vitest | - | pending |
`;
    expect(() => parseTodoGraph(noGroups)).toThrow(
      "No concurrent groups found",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/todo/parser.test.ts
```

Expected: FAIL — module not found or exports not yet defined.

- [ ] **Step 3: Write minimal parser implementation**

Create `packages/agent/src/todo/parser.ts`:

```typescript
import type { TodoGraph, TodoNode } from "./types.js";

const NODE_TABLE_HEADER = "| ID | Name | Files | Verify | DependsOn | Status |";

function parseDependsOn(raw: string): number[] {
  const trimmed = raw.trim();
  if (trimmed === "-" || trimmed === "") return [];
  return trimmed.split(",").map((s) => {
    const id = parseInt(s.trim(), 10);
    if (isNaN(id)) throw new Error(`Invalid DependsOn value: "${raw}"`);
    return id;
  });
}

function parseNodeRow(line: string): TodoNode {
  // Split by '|', strip first/last empty and whitespace
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

  if (cells.length < 6) {
    throw new Error(`Invalid node row (expected 6 cells): "${line}"`);
  }

  return {
    id: parseInt(cells[0]!, 10),
    name: cells[1]!,
    files: cells[2]!.split(",").map((f) => f.trim()).filter(Boolean),
    verify: cells[3]!,
    dependsOn: parseDependsOn(cells[4]!),
    status: cells[5]! as TodoNode["status"],
  };
}

function parseNodeTable(content: string): TodoNode[] {
  const headerIndex = content.indexOf(NODE_TABLE_HEADER);
  if (headerIndex === -1) throw new Error("No node table found in content");

  // Find the separator line (next line after header)
  const afterHeader = content.slice(headerIndex + NODE_TABLE_HEADER.length);
  const lines = afterHeader.split("\n");

  // Skip separator line (|---|...)
  const dataLines = lines.slice(1);

  const nodes: TodoNode[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) break; // end of table
    nodes.push(parseNodeRow(trimmed));
  }

  return nodes;
}

function parseGroups(content: string): number[][] {
  const groups: number[][] = [];
  const groupRegex = /^G\d+:\s*\[([^\]]+)\]/gm;
  let match: RegExpExecArray | null;

  while ((match = groupRegex.exec(content)) !== null) {
    const ids = match[1]!.split(",").map((s) => {
      const id = parseInt(s.trim(), 10);
      if (isNaN(id)) throw new Error(`Invalid group entry: "${s.trim()}"`);
      return id;
    });
    groups.push(ids);
  }

  if (groups.length === 0) throw new Error("No concurrent groups found in content");
  return groups;
}

export function parseTodoGraph(content: string): TodoGraph {
  const nodes = parseNodeTable(content);
  const groups = parseGroups(content);
  return { nodes, groups };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/todo/parser.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/todo/parser.ts packages/agent/test/todo/parser.test.ts
git commit -m "feat(agent): add TODO graph parser"
```

---

### Task 3: Status Manager

**Files:**
- Create: `packages/agent/src/todo/status.ts`
- Create: `packages/agent/test/todo/status.test.ts`

**Interfaces:**
- Consumes: `TodoNode` from `todo/types.ts`
- Produces: `updateStatus(todoPath: string, nodeId: number, status: string): void`, `readStatuses(todoPath: string): Map<number, string>`

- [ ] **Step 1: Write the failing status test**

Create `packages/agent/test/todo/status.test.ts`:

```typescript
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
  it("returns all node statuses", () => {
    const statuses = readStatuses(TEST_FILE);
    expect(statuses.size).toBe(3);
    expect(statuses.get(1)).toBe("pending");
    expect(statuses.get(2)).toBe("pending");
    expect(statuses.get(3)).toBe("pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/todo/status.test.ts
```

Expected: FAIL — status module not found.

- [ ] **Step 3: Write status manager implementation**

Create `packages/agent/src/todo/status.ts`:

```typescript
import { readFileSync, writeFileSync } from "node:fs";

export function updateStatus(
  todoPath: string,
  nodeId: number,
  newStatus: string,
): void {
  let content = readFileSync(todoPath, "utf-8");
  const lines = content.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match a table row starting with "| {nodeId} "
    if (!line.match(new RegExp(`^\\|\\s*${nodeId}\\s+\\|`))) continue;

    // Replace the last cell (Status column) while preserving leading whitespace
    const cells = line.split("|");
    if (cells.length < 2) continue;

    // The status is the second-to-last element (last is empty after trailing |)
    cells[cells.length - 2] = ` ${newStatus} `;
    lines[i] = cells.join("|");
    found = true;
    break;
  }

  if (!found) throw new Error(`Node with ID ${nodeId} not found in ${todoPath}`);

  writeFileSync(todoPath, lines.join("\n"), "utf-8");
}

export function readStatuses(todoPath: string): Map<number, string> {
  const content = readFileSync(todoPath, "utf-8");
  const statuses = new Map<number, string>();
  const rowRegex = /^\|\s*(\d+)\s+\|.+?\|\s*(\S+)\s*\|$/;

  for (const line of content.split("\n")) {
    const match = line.match(rowRegex);
    if (!match) continue;
    const id = parseInt(match[1]!, 10);
    const status = match[2]!;
    statuses.set(id, status);
  }

  return statuses;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/todo/status.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/todo/status.ts packages/agent/test/todo/status.test.ts
git commit -m "feat(agent): add TODO status manager"
```

---

### Task 4: Report Generator

**Files:**
- Create: `packages/agent/src/todo/report.ts`
- Create: `packages/agent/test/todo/report.test.ts`

**Interfaces:**
- Consumes: `TodoNodeResult`, `ExecutionReport` from `todo/types.ts`
- Produces: `generateReport(results: TodoNodeResult[], startTime: number): ExecutionReport`

- [ ] **Step 1: Write the failing report test**

Create `packages/agent/test/todo/report.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/todo/report.test.ts
```

Expected: FAIL — report module not found.

- [ ] **Step 3: Write report generator implementation**

Create `packages/agent/src/todo/report.ts`:

```typescript
import type { ExecutionReport, TodoNodeResult } from "./types.js";

export function generateReport(
  results: TodoNodeResult[],
  startTime: number,
): ExecutionReport {
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    switch (r.status) {
      case "success":
        completed++;
        break;
      case "failed":
        failed++;
        break;
      case "skipped":
        skipped++;
        break;
    }
  }

  return {
    totalNodes: results.length,
    completed,
    failed,
    skipped,
    nodes: results,
    durationMs: Date.now() - startTime,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/todo/report.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/todo/report.ts packages/agent/test/todo/report.test.ts
git commit -m "feat(agent): add execution report generator"
```

---

### Task 5: Orchestrator

**Files:**
- Create: `packages/agent/src/todo/orchestrator.ts`
- Create: `packages/agent/test/todo/orchestrator.test.ts`

**Interfaces:**
- Consumes: `TodoGraph`, `TodoConfig`, `NodeExecutor`, `TodoNode`, `TodoNodeResult`, `ExecutionReport` from `todo/types.ts`; `parseTodoGraph` from `todo/parser.ts`; `updateStatus` from `todo/status.ts`; `generateReport` from `todo/report.ts`; `withRetry`, `RetryExhaustedError` from `graph/retry.ts`; `GraphState`, `GraphNode`, `NodeInput` from `graph/types.ts`
- Produces: `runOrchestrator(config: TodoConfig, executor: NodeExecutor): Promise<ExecutionReport>`

- [ ] **Step 1: Write the failing orchestrator test**

Create `packages/agent/test/todo/orchestrator.test.ts`:

```typescript
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
    const start = Date.now();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && npx vitest run test/todo/orchestrator.test.ts
```

Expected: FAIL — orchestrator module not found.

- [ ] **Step 3: Write orchestrator implementation**

Create `packages/agent/src/todo/orchestrator.ts`:

```typescript
import { readFileSync } from "node:fs";
import type {
  TodoConfig,
  TodoGraph,
  TodoNode,
  TodoNodeResult,
  NodeExecutor,
  ExecutionReport,
} from "./types.js";
import { parseTodoGraph } from "./parser.js";
import { updateStatus } from "./status.js";
import { generateReport } from "./report.js";
import { withRetry, RetryExhaustedError } from "../graph/retry.js";
import type { GraphState, GraphNode, NodeInput } from "../graph/types.js";

// Internal wrapper state that satisfies GraphState for withRetry compatibility.
interface OrchestratorNodeState extends GraphState {
  _todoNode: TodoNode;
}

function buildNodeMap(graph: TodoGraph): Map<number, TodoNode> {
  const map = new Map<number, TodoNode>();
  for (const node of graph.nodes) {
    map.set(node.id, node);
  }
  return map;
}

function findTransitiveDependents(
  graph: TodoGraph,
  failedIds: Set<number>,
): Set<number> {
  const toSkip = new Set<number>();

  function markDownstream(nodeId: number): void {
    for (const node of graph.nodes) {
      if (toSkip.has(node.id)) continue;
      if (node.dependsOn.includes(nodeId)) {
        toSkip.add(node.id);
        markDownstream(node.id);
      }
    }
  }

  for (const id of failedIds) {
    markDownstream(id);
  }

  return toSkip;
}

function wrapNodeIntoGraphNode(
  node: TodoNode,
  executor: NodeExecutor,
  maxRetries: number,
): GraphNode<OrchestratorNodeState, unknown> {
  return {
    name: node.name,
    run: async (_input: NodeInput<OrchestratorNodeState>) => {
      return executor(node);
    },
    retryConfig:
      maxRetries > 0
        ? {
            maxRetries,
            feedbackFn: (attempt: number, error: Error) => ({
              attempt,
              error: error.message,
              nodeId: node.id,
            }),
          }
        : undefined,
  };
}

export async function runOrchestrator(
  config: TodoConfig,
  executor: NodeExecutor,
): Promise<ExecutionReport> {
  const content = readFileSync(config.todoPath, "utf-8");
  const graph = parseTodoGraph(content);
  const results: TodoNodeResult[] = [];
  const failedIds = new Set<number>();
  const startTime = Date.now();

  for (const group of graph.groups) {
    // Check which nodes in this group should be skipped due to upstream failures.
    const toSkip = findTransitiveDependents(graph, failedIds);
    const activeNodes = group.filter((id) => !toSkip.has(id));
    const skippedInGroup = group.filter((id) => toSkip.has(id));

    // Mark skipped nodes.
    for (const id of skippedInGroup) {
      updateStatus(config.todoPath, id, "skipped");
      results.push({
        nodeId: id,
        nodeName: graph.nodes.find((n) => n.id === id)?.name ?? `node-${id}`,
        status: "skipped",
        output: null,
        durationMs: 0,
        retryCount: 0,
      });
    }

    if (activeNodes.length === 0) continue;

    // Execute active nodes in parallel within the group.
    const groupTasks = activeNodes.map(
      async (nodeId): Promise<TodoNodeResult> => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found in graph`);

        updateStatus(config.todoPath, nodeId, "in_progress");

        const graphNode = wrapNodeIntoGraphNode(
          node,
          executor,
          config.maxRetries,
        );

        const nodeState: OrchestratorNodeState = {
          _todoNode: node,
          checkpoints: [],
          nodeResults: {},
          status: "running",
        };

        const nodeStart = Date.now();

        try {
          const { output, retryCount } = await withRetry(
            graphNode,
            { state: nodeState },
            node.name,
          );
          updateStatus(config.todoPath, nodeId, "completed");
          return {
            nodeId,
            nodeName: node.name,
            status: "success",
            output,
            durationMs: Date.now() - nodeStart,
            retryCount,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          updateStatus(config.todoPath, nodeId, "failed");
          failedIds.add(nodeId);
          return {
            nodeId,
            nodeName: node.name,
            status: "failed",
            output: null,
            error,
            durationMs: Date.now() - nodeStart,
            retryCount:
              err instanceof RetryExhaustedError ? err.attempts : 0,
          };
        }
      },
    );

    const groupResults = await Promise.all(groupTasks);
    results.push(...groupResults);
  }

  return generateReport(results, startTime);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/agent && npx vitest run test/todo/orchestrator.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/todo/orchestrator.ts packages/agent/test/todo/orchestrator.test.ts
git commit -m "feat(agent): add TODO graph orchestrator"
```

---

### Task 6: Integration & Export

**Files:**
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/todo/e2e.test.ts`

**Interfaces:**
- Consumes: All `todo/` modules
- Produces: Updated `index.ts` barrel exports

- [ ] **Step 1: Update index.ts with TODO exports**

Edit `packages/agent/src/index.ts` to append after the existing graph engine exports:

```
// TODO Graph & Orchestrator.
export type {
  TodoNode,
  TodoGraph,
  TodoConfig,
  NodeExecutor,
  TodoNodeResult,
  ExecutionReport,
} from "./todo/types.js";
export { parseTodoGraph } from "./todo/parser.js";
export { updateStatus, readStatuses } from "./todo/status.js";
export { generateReport } from "./todo/report.js";
export { runOrchestrator } from "./todo/orchestrator.js";
```

Use Edit to add these lines after line 14 (after the `export { withRetry, RetryExhaustedError } from "./graph/retry.js";` line).

- [ ] **Step 2: Run typecheck**

```bash
cd packages/agent && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Write end-to-end test**

Create `packages/agent/test/todo/e2e.test.ts`:

```typescript
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

const fullTodo = `# TODO: auth

## Node Table
| ID | Name       | Files              | Verify          | DependsOn | Status  |
|----|------------|--------------------|-----------------|-----------|---------|
| 1  | 类型定义   | auth/types.ts      | tsc --noEmit     | -         | pending |
| 2  | 核心逻辑   | auth/handler.ts    | vitest run       | 1         | pending |
| 3  | 接口暴露   | auth/index.ts      | tsc --noEmit     | 1         | pending |
| 4  | 集成测试   | test/auth.test.ts  | vitest run       | 2, 3      | pending |

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
```

- [ ] **Step 4: Run E2E test**

```bash
cd packages/agent && npx vitest run test/todo/e2e.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full test suite to check no regressions**

```bash
cd packages/agent && npx vitest run
```

Expected: all existing tests + all new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/index.ts packages/agent/test/todo/e2e.test.ts
git commit -m "feat(agent): integrate TODO graph and orchestrator into agent package"
```
