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
