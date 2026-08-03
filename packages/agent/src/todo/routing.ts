import type {
  RouteRule,
  RouteCondition,
  RouteAction,
  RoutingDecision,
  TodoNode,
  TodoNodeResult,
  TodoGraph,
  BudgetStatus,
  RouteHandler,
} from "./types.js";

// ---- Simplified handler adapter ----

/** A simplified route handler that only receives the node result. */
export type SimpleRouteHandler = (
  result: TodoNodeResult,
) => Promise<RoutingDecision | null>;

/** Wrap a SimpleRouteHandler into the full RouteHandler interface. */
export function wrapSimpleHandler(handler: SimpleRouteHandler): RouteHandler {
  return {
    onNodeComplete: async (_node, result) => handler(result),
  };
}

// ---- Markdown route parsing ----

const RULE_SEPARATOR = ";";
const COND_ACTION_SEPARATOR = "→";

function parseStatusToCondition(status: string): RouteCondition | null {
  switch (status) {
    case "success":
    case "completed":
      return "on_success";
    case "failed":
      return "on_fail";
    case "skipped":
      return "on_skipped";
    default:
      return null;
  }
}

/**
 * Parse a single route rule from markdown syntax.
 * Supported formats:
 *   on_fail→retry(2)
 *   on_fail→escalate("部署失败需要人工审批")
 *   on_fail→stop("预算耗尽")
 *   on_success→activate(4,5)
 *   on_budget_exceeded→stop("时间超限")
 */
function parseSingleRule(raw: string): RouteRule {
  const idx = raw.indexOf(COND_ACTION_SEPARATOR);
  if (idx === -1) {
    throw new Error(`Invalid route rule (missing "${COND_ACTION_SEPARATOR}"): "${raw}"`);
  }

  const condRaw = raw.slice(0, idx).trim() as RouteCondition;
  const actionRaw = raw.slice(idx + COND_ACTION_SEPARATOR.length).trim();

  if (
    condRaw !== "on_success" &&
    condRaw !== "on_fail" &&
    condRaw !== "on_skipped" &&
    condRaw !== "on_budget_exceeded"
  ) {
    throw new Error(
      `Unknown route condition: "${condRaw}". Supported: on_success, on_fail, on_skipped, on_budget_exceeded`,
    );
  }

  const action = parseAction(actionRaw, condRaw);
  return { condition: condRaw, action };
}

function parseAction(raw: string, _cond: RouteCondition): RouteAction {
  // retry(N)
  {
    const m = raw.match(/^retry\((\d+)\)$/);
    if (m) return { kind: "retry", extraAttempts: parseInt(m[1]!, 10) };
  }

  // escalate("reason")
  {
    const m = raw.match(/^escalate\("([^"]*)"\)$/);
    if (m) return { kind: "escalate", reason: m[1]! };
  }

  // stop("reason")
  {
    const m = raw.match(/^stop\("([^"]*)"\)$/);
    if (m) return { kind: "stop", reason: m[1]! };
  }

  // activate(4,5)
  {
    const m = raw.match(/^activate\(([\d,\s]+)\)$/);
    if (m) {
      const ids = m[1]!
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      return { kind: "activate", nodeIds: ids };
    }
  }

  // deactivate(4,5)
  {
    const m = raw.match(/^deactivate\(([\d,\s]+)\)$/);
    if (m) {
      const ids = m[1]!
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      return { kind: "deactivate", nodeIds: ids };
    }
  }

  throw new Error(
    `Unknown route action: "${raw}". Supported: retry(N), escalate("reason"), stop("reason"), activate(ids), deactivate(ids)`,
  );
}

/**
 * Parse markdown routes string into RouteRule[].
 * Format: "on_fail→retry(2); on_success→activate(4,5)"
 */
export function parseMarkdownRoutes(raw: string): RouteRule[] {
  if (!raw || raw.trim() === "-" || raw.trim() === "") return [];

  return raw
    .split(RULE_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(parseSingleRule);
}

// ---- Routing resolution ----

/**
 * Resolve the routing decision for a completed node.
 * Priority: RouteHandler → markdown rules → default "continue".
 */
export async function resolveRouting(
  node: TodoNode,
  result: TodoNodeResult,
  graph: TodoGraph,
  budget: BudgetStatus,
  routeHandler?: RouteHandler,
): Promise<RoutingDecision> {
  // 1. Try programmatic handler first
  if (routeHandler) {
    const decision = await routeHandler.onNodeComplete(
      node,
      result,
      graph,
      budget,
    );
    if (decision !== null) return decision;
  }

  // 2. Fall through to markdown rules
  const condition = parseStatusToCondition(result.status);
  if (condition && node.routes && node.routes.length > 0) {
    const match = node.routes.find((r) => r.condition === condition);
    if (match) return ruleToDecision(match);
  }

  // 3. Check on_budget_exceeded rules (applies regardless of node status)
  if (budget.exceeded !== "none" && node.routes && node.routes.length > 0) {
    const match = node.routes.find((r) => r.condition === "on_budget_exceeded");
    if (match) return ruleToDecision(match);
  }

  // 4. Default: continue
  return { action: "continue" };
}

function ruleToDecision(rule: RouteRule): RoutingDecision {
  const a = rule.action;
  switch (a.kind) {
    case "retry":
      return { action: "retry", extraAttempts: a.extraAttempts };
    case "escalate":
      return { action: "escalate", reason: a.reason };
    case "stop":
      return { action: "stop", reason: a.reason };
    case "activate":
      return { action: "activate", nodeIds: a.nodeIds, timing: "deferred" };
    case "deactivate":
      return { action: "deactivate", nodeIds: a.nodeIds };
  }
}
