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

  it("throws when dependsOn references a non-existent node", () => {
    const bad = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | vitest | 99 | pending |

## Concurrent Groups
G1: [1]
`;
    expect(() => parseTodoGraph(bad)).toThrow(
      "Node 1 depends on node 99, but node 99 does not exist",
    );
  });

  it("throws when a group references a non-existent node", () => {
    const bad = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | vitest | - | pending |

## Concurrent Groups
G1: [1]
G2: [99]
`;
    expect(() => parseTodoGraph(bad)).toThrow(
      "Group G2 references node 99",
    );
  });

  it("throws when a node appears in multiple groups", () => {
    const bad = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | vitest | - | pending |
| 2  | b | b.ts | vitest | 1 | pending |

## Concurrent Groups
G1: [1]
G2: [2]
G3: [1]
`;
    expect(() => parseTodoGraph(bad)).toThrow(
      "Node 1 appears in both G1 and G3",
    );
  });

  it("throws when a node is missing from all groups", () => {
    const bad = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | vitest | - | pending |
| 2  | b | b.ts | vitest | 1 | pending |

## Concurrent Groups
G1: [1]
`;
    expect(() => parseTodoGraph(bad)).toThrow(
      "Node 2 does not appear in any concurrent group",
    );
  });

  it("throws when a dependency is not in an earlier group", () => {
    const bad = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | vitest | - | pending |
| 2  | b | b.ts | vitest | 1 | pending |

## Concurrent Groups
G1: [2]
G2: [1]
`;
    expect(() => parseTodoGraph(bad)).toThrow(
      "Node 2 (G1) depends on node 1 (G2), but a dependency must appear in an earlier group",
    );
  });

  it("allows empty groups", () => {
    const withEmpty = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | vitest | - | pending |

## Concurrent Groups
G1: []
G2: [1]
`;
    const graph = parseTodoGraph(withEmpty);
    expect(graph.groups).toEqual([[], [1]]);
  });
});
