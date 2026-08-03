import { describe, it, expect } from "vitest";
import { createBudget, updateBudget, recordRetry, checkBudget } from "../../src/todo/budget.js";
import type { BudgetConfig } from "../../src/todo/types.js";

const config: BudgetConfig = {
  maxTimeMs: 10000,
  maxRetriesPerNode: 3,
  maxTokens: 5000,
};

describe("createBudget", () => {
  it("initializes with zero consumption and none exceeded", () => {
    const budget = createBudget(config);
    expect(budget.elapsedMs).toBe(0);
    expect(budget.tokensUsed).toBe(0);
    expect(budget.nodeRetries.size).toBe(0);
    expect(budget.exceeded).toBe("none");
  });
});

describe("updateBudget", () => {
  it("accumulates elapsed time and tokens", () => {
    const budget = createBudget(config);
    const updated = updateBudget(budget, 100, 50);
    expect(updated.elapsedMs).toBe(100);
    expect(updated.tokensUsed).toBe(50);
  });

  it("returns a new object without mutating the original", () => {
    const budget = createBudget(config);
    const updated = updateBudget(budget, 100, 50);
    expect(budget.elapsedMs).toBe(0);
    expect(updated.elapsedMs).toBe(100);
  });
});

describe("recordRetry", () => {
  it("increments retry count for a node", () => {
    const budget = createBudget(config);
    const after1 = recordRetry(budget, config, 1);
    expect(after1.nodeRetries.get(1)).toBe(1);
    expect(after1.exceeded).toBe("none");

    const after2 = recordRetry(after1, config, 1);
    expect(after2.nodeRetries.get(1)).toBe(2);
    expect(after2.exceeded).toBe("none");
  });

  it("sets exceeded to retries when a node exceeds maxRetriesPerNode", () => {
    const budget = createBudget(config);

    let current = budget;
    for (let i = 0; i < 4; i++) {
      // 4 retries > maxRetriesPerNode (3)
      current = recordRetry(current, config, 1);
    }

    expect(current.nodeRetries.get(1)).toBe(4);
    expect(current.exceeded).toBe("retries");
  });

  it("does not reset retry counts for other nodes", () => {
    const budget = createBudget(config);
    const after1 = recordRetry(budget, config, 1);
    const after2 = recordRetry(after1, config, 2);
    expect(after2.nodeRetries.get(1)).toBe(1);
    expect(after2.nodeRetries.get(2)).toBe(1);
  });
});

describe("checkBudget", () => {
  it("returns none when all budgets are within limits", () => {
    const budget = createBudget(config);
    expect(checkBudget(budget, config)).toBe("none");
  });

  it("returns time when elapsed exceeds maxTimeMs", () => {
    const budget = createBudget(config);
    const exceeded = updateBudget(budget, 15000, 0);
    expect(checkBudget(exceeded, config)).toBe("time");
  });

  it("returns tokens when tokensUsed exceeds maxTokens", () => {
    const budget = createBudget(config);
    const exceeded = updateBudget(budget, 0, 6000);
    expect(checkBudget(exceeded, config)).toBe("tokens");
  });

  it("does not check tokens when maxTokens is unset", () => {
    const configNoTokens: BudgetConfig = { maxTimeMs: 10000, maxRetriesPerNode: 3 };
    const budget = createBudget(configNoTokens);
    const heavy = updateBudget(budget, 0, 999999);
    expect(checkBudget(heavy, configNoTokens)).toBe("none");
  });

  it("returns the pre-existing exceeded value if already set", () => {
    const budget = createBudget(config);
    const retried = recordRetry(recordRetry(recordRetry(recordRetry(budget, config, 1), config, 1), config, 1), config, 1);
    expect(retried.exceeded).toBe("retries");
    expect(checkBudget(retried, config)).toBe("retries");
  });
});
