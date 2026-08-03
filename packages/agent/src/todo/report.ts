import type { BudgetStatus, ExecutionReport, TodoNodeResult } from "./types.js";

export interface GenerateReportOptions {
  budget?: BudgetStatus;
  escalated?: number;
  note?: string;
}

export function generateReport(
  results: TodoNodeResult[],
  startTime: number,
  options?: GenerateReportOptions,
): ExecutionReport {
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let escalated = options?.escalated ?? 0;
  let degraded = 0;

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
      case "escalated":
        escalated++;
        break;
      case "degraded":
        degraded++;
        break;
    }
  }

  return {
    totalNodes: results.length,
    completed,
    failed,
    skipped,
    escalated,
    degraded,
    nodes: results,
    durationMs: Date.now() - startTime,
    note: options?.note,
    budget: options?.budget,
  };
}
