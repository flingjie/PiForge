import { randomUUID } from "node:crypto";
import { runArena } from "./arena/orchestrator.js";
import { runOrchestratorFromMarkdown } from "./todo/orchestrator.js";
import { createDefaultConstitution } from "./constitution/defaults.js";
import { savePipelineIndex, saveArenaTrace, saveTodoTrace, appendToIndex } from "./trace/store.js";
import type { TraceOptions } from "./trace/types.js";
import type { ArenaConfig, LLMProvider, ArenaResult } from "./arena/types.js";
import type { NodeExecutor, ExecutionReport } from "./todo/types.js";
import type { Constitution } from "./constitution/types.js";

export interface PipelineOptions {
  plan: string;
  llm: LLMProvider;
  executor: NodeExecutor;
  constitution?: Constitution;
  arena?: Partial<ArenaConfig>;
  outputDir?: string;
  /** Identifier for this pipeline run. Auto-generated if not provided. */
  pipelineId?: string;
  /** Trace configuration. When enabled, writes markdown trace files after completion. */
  trace?: TraceOptions;
}

export interface PipelineResult {
  /** Identifier for this pipeline run. */
  pipelineId: string;
  revisedPlan: string;
  todoMarkdown: string;
  report: ExecutionReport;
  arenaResult: ArenaResult;
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const now = new Date().toISOString().replace(/[:.]/g, "").slice(0, 17);
  const hex = randomUUID().slice(0, 6);
  const pipelineId = options.pipelineId ?? `${now}-${hex}`;

  const constitution = options.constitution ?? createDefaultConstitution();
  const arenaConfig: ArenaConfig = {
    maxDepth: options.arena?.maxDepth ?? 2,
    maxCritiqueCycles: options.arena?.maxCritiqueCycles ?? 1,
    outputDir: options.outputDir,
  };

  const arenaResult = await runArena(arenaConfig, options.llm, options.plan, constitution);

  if (!arenaResult.state.synthesis) {
    throw new Error("Arena completed without synthesis result");
  }

  const report = await runOrchestratorFromMarkdown(
    arenaResult.state.synthesis.todoMarkdown,
    options.executor,
    { maxRetries: 0 },
  );

  const result: PipelineResult = {
    pipelineId,
    revisedPlan: arenaResult.state.synthesis.revisedPlan,
    todoMarkdown: arenaResult.state.synthesis.todoMarkdown,
    report,
    arenaResult,
  };

  if (options.trace?.enabled) {
    const traceDir = options.trace.outputDir || "output/traces";
    savePipelineIndex(pipelineId, options.trace.planPath ?? null, traceDir);
    saveArenaTrace(pipelineId, options.trace.planPath ?? null, result, traceDir);
    saveTodoTrace(pipelineId, result, traceDir);
    appendToIndex(pipelineId, traceDir, {
      time: new Date().toISOString(),
      planPath: options.trace.planPath ?? null,
      decisionsCount: arenaResult.problemsBattled,
      todoCompleted: report.completed,
      todoTotal: report.totalNodes,
    });
  }

  return result;
}
