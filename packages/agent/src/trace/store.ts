import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunSummary } from "./types.js";
import type { PipelineResult } from "../pipeline.js";

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function safeWrite(callback: () => void, context: string): void {
  try {
    callback();
  } catch (err) {
    console.error(
      `[trace] Failed to write ${context}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

function formatScores(scores: Record<string, number>): string {
  return Object.entries(scores)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function savePipelineIndex(
  pipelineId: string,
  planPath: string | null,
  outputDir: string,
  _arenaRunId?: string,
  _todoRunId?: string,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const planLink = planPath
      ? `[${planPath.split("/").pop()!}](../../${planPath})`
      : "(no plan)";

    const content = [
      `# Pipeline: ${pipelineId}`,
      "",
      `**Plan:** ${planLink}`,
      "",
    ].join("\n");

    writeFileSync(join(outputDir, `pipeline-${pipelineId}.md`), content, "utf-8");
  }, `pipeline index for ${pipelineId}`);
}

export function saveArenaTrace(
  pipelineId: string,
  planPath: string | null,
  result: PipelineResult,
  outputDir: string,
  _arenaRunId?: string,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const state = result.arenaResult.state;

    const planLink = planPath
      ? `[${planPath.split("/").pop()!}](../../${planPath})`
      : "(no plan)";

    const lines: string[] = [
      `# Arena Run`,
      "",
      `**Pipeline:** [pipeline-${pipelineId}](pipeline-${pipelineId}.md)`,
      `**Plan:** ${planLink}`,
      `**Status:** ${state?.status ?? "not run"}`,
      `**Duration:** ${(result.arenaResult.durationMs / 1000).toFixed(1)}s`,
      `**Problems battled:** ${result.arenaResult.problemsBattled} (recursive: ${result.arenaResult.recursiveBattles})`,
      "",
    ];

    if (!state?.synthesis) {
      lines.push(state ? "(No synthesis result)" : "(Arena was not run)");
      writeFileSync(join(outputDir, `arena-${pipelineId}.md`), lines.join("\n"), "utf-8");
      return;
    }

    for (const decision of state.synthesis.decisions) {
      const idx = state.synthesis.decisions.indexOf(decision) + 1;
      lines.push(`## Decision ${idx}: ${decision.problemTitle}`);
      lines.push("");
      lines.push(`**Chosen:** ${decision.chosenApproach}`);
      lines.push(`**Decision:** ${decision.decision}`);
      lines.push("");
      lines.push("### Reasoning");
      lines.push(decision.reasoning);
      lines.push("");

      const solutions = state.solutions.get(decision.problemId) ?? [];
      const critiqueResult = state.critiques.get(decision.problemId);

      if (solutions.length > 0) {
        lines.push("### Alternatives Considered");
        lines.push("");
        lines.push("| Persona | Proposal | Scores | Critique | Severity |");
        lines.push("|---------|----------|--------|----------|----------|");

        for (const sol of solutions) {
          const crit = critiqueResult?.critiques.find(
            (c) => c.solutionPersona === sol.persona,
          );
          const proposal = escapeCell(sol.proposal.slice(0, 120));
          const scores = escapeCell(formatScores(sol.scores));
          const weakness = crit?.weaknesses.join("; ") ?? "-";
          const severity = crit?.severity ?? "-";

          lines.push(
            `| ${sol.persona} | ${proposal} | ${scores} | ${escapeCell(weakness)} | ${severity} |`,
          );
        }

        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    writeFileSync(join(outputDir, `arena-${pipelineId}.md`), lines.join("\n"), "utf-8");
  }, `arena trace for ${pipelineId}`);
}

export function saveTodoTrace(
  pipelineId: string,
  result: PipelineResult,
  outputDir: string,
  _todoRunId?: string,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const { report } = result;

    const lines: string[] = [
      `# Todo Execution`,
      "",
      `**Pipeline:** [pipeline-${pipelineId}](pipeline-${pipelineId}.md)`,
      `**Arena:** [arena-${pipelineId}](arena-${pipelineId}.md)`,
      `**Completed:** ${report?.completed ?? 0}/${report?.totalNodes ?? 0}`,
      "",
      "## Node Summary",
      "",
      "| Status | Count |",
      "|--------|-------|",
      `| completed | ${report?.completed ?? 0} |`,
      `| failed | ${report?.failed ?? 0} |`,
      `| skipped | ${report?.skipped ?? 0} |`,
      "",
      `**Duration:** ${((report?.durationMs ?? 0) / 1000).toFixed(1)}s`,
      "",
    ];

    writeFileSync(join(outputDir, `todo-${pipelineId}.md`), lines.join("\n"), "utf-8");
  }, `todo trace for ${pipelineId}`);
}

export function appendToIndex(
  pipelineId: string,
  outputDir: string,
  summary: RunSummary,
): void {
  safeWrite(() => {
    ensureDir(outputDir);
    const indexPath = join(outputDir, "index.md");

    const planCell = summary.planPath
      ? `[${summary.planPath.split("/").pop()?.replace(".md", "") ?? summary.planPath}](${summary.planPath})`
      : "-";

    const row = `| [${pipelineId}](pipeline-${pipelineId}.md) | ${summary.time} | ${planCell} | ${summary.decisionsCount} | ${summary.todoCompleted}/${summary.todoTotal} |`;

    if (!existsSync(indexPath)) {
      const header = [
        "# Pipeline Traces",
        "",
        "| Pipeline | Time | Plan | Decisions | Todo |",
        "|----------|------|------|-----------|------|",
        row,
        "",
      ].join("\n");
      writeFileSync(indexPath, header, "utf-8");
    } else {
      const existing = readFileSync(indexPath, "utf-8");
      writeFileSync(indexPath, existing.trimEnd() + "\n" + row + "\n", "utf-8");
    }
  }, `index append for ${pipelineId}`);
}
