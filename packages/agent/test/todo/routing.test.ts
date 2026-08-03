import { describe, it, expect } from "vitest";
import { parseMarkdownRoutes, resolveRouting } from "../../src/todo/routing.js";
import type { TodoNode, TodoNodeResult, TodoGraph, BudgetStatus } from "../../src/todo/types.js";

const emptyBudget: BudgetStatus = {
  elapsedMs: 0,
  tokensUsed: 0,
  nodeRetries: new Map(),
  exceeded: "none",
};

const emptyGraph: TodoGraph = { nodes: [], groups: [] };

function makeNode(overrides: Partial<TodoNode> & { id: number }): TodoNode {
  return {
    name: `node-${overrides.id}`,
    files: [],
    verify: "echo ok",
    dependsOn: [],
    status: "pending",
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<TodoNodeResult> & { nodeId: number },
): TodoNodeResult {
  return {
    nodeName: `node-${overrides.nodeId}`,
    status: "success",
    output: null,
    durationMs: 0,
    retryCount: 0,
    ...overrides,
  };
}

describe("parseMarkdownRoutes", () => {
  it("returns empty array for empty or dash input", () => {
    expect(parseMarkdownRoutes("")).toEqual([]);
    expect(parseMarkdownRoutes("-")).toEqual([]);
  });

  it("parses on_fail→retry(N)", () => {
    const rules = parseMarkdownRoutes("on_fail→retry(2)");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.condition).toBe("on_fail");
    expect(rules[0]!.action).toEqual({ kind: "retry", extraAttempts: 2 });
  });

  it("parses on_fail→escalate(\"reason\")", () => {
    const rules = parseMarkdownRoutes('on_fail→escalate("需要人工审批")');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.condition).toBe("on_fail");
    expect(rules[0]!.action).toEqual({ kind: "escalate", reason: "需要人工审批" });
  });

  it("parses on_fail→stop(\"reason\")", () => {
    const rules = parseMarkdownRoutes('on_fail→stop("预算耗尽")');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toEqual({ kind: "stop", reason: "预算耗尽" });
  });

  it("parses on_success→activate(4,5)", () => {
    const rules = parseMarkdownRoutes("on_success→activate(4, 5)");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toEqual({ kind: "activate", nodeIds: [4, 5] });
  });

  it("parses on_budget_exceeded→stop(\"...\")", () => {
    const rules = parseMarkdownRoutes('on_budget_exceeded→stop("时间超了")');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.condition).toBe("on_budget_exceeded");
  });

  it("parses multiple rules separated by semicolons", () => {
    const rules = parseMarkdownRoutes('on_fail→retry(2); on_success→activate(5)');
    expect(rules).toHaveLength(2);
    expect(rules[0]!.condition).toBe("on_fail");
    expect(rules[1]!.condition).toBe("on_success");
  });

  it("parses deactivate rules", () => {
    const rules = parseMarkdownRoutes("on_fail→deactivate(3, 4)");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toEqual({ kind: "deactivate", nodeIds: [3, 4] });
  });

  it("throws on unknown condition", () => {
    expect(() => parseMarkdownRoutes("on_timeout→retry(1)")).toThrow(
      "Unknown route condition",
    );
  });

  it("throws on unknown action", () => {
    expect(() => parseMarkdownRoutes("on_fail→panic()")).toThrow(
      "Unknown route action",
    );
  });

  it("throws on missing arrow", () => {
    expect(() => parseMarkdownRoutes("on_fail retry(2)")).toThrow(
      "Invalid route rule",
    );
  });
});

describe("resolveRouting", () => {
  it("returns continue by default when no rules match", async () => {
    const node = makeNode({ id: 1 });
    const result = makeResult({ nodeId: 1, status: "success" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision.action).toBe("continue");
  });

  it("returns continue for skipped nodes without matching rules", async () => {
    const node = makeNode({ id: 1 });
    const result = makeResult({ nodeId: 1, status: "skipped" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision.action).toBe("continue");
  });

  it("applies markdown retry rule on failure", async () => {
    const node = makeNode({
      id: 1,
      routes: [{ condition: "on_fail", action: { kind: "retry", extraAttempts: 2 } }],
    });
    const result = makeResult({ nodeId: 1, status: "failed" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision).toEqual({ action: "retry", extraAttempts: 2 });
  });

  it("applies markdown escalate rule on failure", async () => {
    const node = makeNode({
      id: 1,
      routes: [
        {
          condition: "on_fail",
          action: { kind: "escalate", reason: "check manually" },
        },
      ],
    });
    const result = makeResult({ nodeId: 1, status: "failed" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision).toEqual({ action: "escalate", reason: "check manually" });
  });

  it("applies markdown stop rule on failure", async () => {
    const node = makeNode({
      id: 1,
      routes: [
        {
          condition: "on_fail",
          action: { kind: "stop", reason: "critical failure" },
        },
      ],
    });
    const result = makeResult({ nodeId: 1, status: "failed" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision).toEqual({ action: "stop", reason: "critical failure" });
  });

  it("applies activate rule on success with deferred timing", async () => {
    const node = makeNode({
      id: 1,
      routes: [
        {
          condition: "on_success",
          action: { kind: "activate", nodeIds: [5, 6] },
        },
      ],
    });
    const result = makeResult({ nodeId: 1, status: "success" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision).toEqual({ action: "activate", nodeIds: [5, 6], timing: "deferred" });
  });

  it("applies on_budget_exceeded rule when budget is exceeded", async () => {
    const exceededBudget: BudgetStatus = {
      elapsedMs: 0,
      tokensUsed: 0,
      nodeRetries: new Map(),
      exceeded: "time",
    };
    const node = makeNode({
      id: 1,
      routes: [
        {
          condition: "on_budget_exceeded",
          action: { kind: "stop", reason: "out of time" },
        },
      ],
    });
    const result = makeResult({ nodeId: 1, status: "success" });

    const decision = await resolveRouting(
      node,
      result,
      emptyGraph,
      exceededBudget,
    );
    expect(decision).toEqual({ action: "stop", reason: "out of time" });
  });

  it("prioritizes RouteHandler over markdown rules", async () => {
    const node = makeNode({
      id: 1,
      routes: [{ condition: "on_fail", action: { kind: "retry", extraAttempts: 2 } }],
    });
    const result = makeResult({ nodeId: 1, status: "failed" });

    const handler = {
      onNodeComplete: async () => ({
        action: "continue" as const,
      }),
    };

    const decision = await resolveRouting(
      node,
      result,
      emptyGraph,
      emptyBudget,
      handler,
    );
    // Handler says continue, ignoring markdown retry rule
    expect(decision.action).toBe("continue");
  });

  it("falls through to markdown rules when handler returns null", async () => {
    const node = makeNode({
      id: 1,
      routes: [{ condition: "on_fail", action: { kind: "stop", reason: "fail" } }],
    });
    const result = makeResult({ nodeId: 1, status: "failed" });

    const handler = {
      onNodeComplete: async () => null,
    };

    const decision = await resolveRouting(
      node,
      result,
      emptyGraph,
      emptyBudget,
      handler,
    );
    expect(decision.action).toBe("stop");
  });

  it("matches on_success when status is 'completed'", async () => {
    const node = makeNode({
      id: 1,
      routes: [
        {
          condition: "on_success",
          action: { kind: "activate", nodeIds: [2] },
        },
      ],
    });
    // Note: TodoNodeResult.status "success" maps to condition "on_success"
    // via parseStatusToCondition internally
    const result = makeResult({ nodeId: 1, status: "success" });

    const decision = await resolveRouting(node, result, emptyGraph, emptyBudget);
    expect(decision.action).toBe("activate");
  });
});
