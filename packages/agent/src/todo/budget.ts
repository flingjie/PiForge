import type { BudgetConfig, BudgetStatus } from "./types.js";

/** Create a fresh budget tracker. */
export function createBudget(config: BudgetConfig): BudgetStatus {
  return {
    elapsedMs: 0,
    tokensUsed: 0,
    nodeRetries: {},
    exceeded: "none",
  };
}

/** Update elapsed time and token usage. Returns a new BudgetStatus (immutable pattern). */
export function updateBudget(
  status: BudgetStatus,
  deltaMs: number,
  deltaTokens: number,
): BudgetStatus {
  return {
    ...status,
    elapsedMs: status.elapsedMs + deltaMs,
    tokensUsed: status.tokensUsed + deltaTokens,
  };
}

/** Record a retry for a node. Returns a new BudgetStatus. */
export function recordRetry(
  status: BudgetStatus,
  config: BudgetConfig,
  nodeId: number,
): BudgetStatus {
  const count = (status.nodeRetries[nodeId] ?? 0) + 1;

  const exceeded =
    count > config.maxRetriesPerNode ? "retries" as const : status.exceeded;

  return {
    ...status,
    nodeRetries: { ...status.nodeRetries, [nodeId]: count },
    exceeded,
  };
}

/** Check all budget limits. Returns the first exceeded category, or "none". */
export function checkBudget(
  status: BudgetStatus,
  config: BudgetConfig,
): BudgetStatus["exceeded"] {
  if (status.exceeded !== "none") return status.exceeded;
  if (status.elapsedMs > config.maxTimeMs) return "time";
  if (
    config.maxTokens !== undefined &&
    status.tokensUsed > config.maxTokens
  )
    return "tokens";
  // nodeRetries is already checked in recordRetry
  return "none";
}

/** Estimate token count from text. Rough heuristic: ~4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
