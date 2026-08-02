import { randomUUID } from "node:crypto";
import { runArena } from "./arena/orchestrator.js";
import { runOrchestratorFromMarkdown } from "./todo/orchestrator.js";
import { createDefaultConstitution } from "./constitution/defaults.js";
import { savePipelineIndex, saveArenaTrace, saveTodoTrace, appendToIndex } from "./trace/store.js";
import type { TraceOptions } from "./trace/types.js";
import type { ArenaConfig, LLMProvider, ArenaResult } from "./arena/types.js";
import type { NodeExecutor, ExecutionReport } from "./todo/types.js";
import type { Constitution } from "./constitution/types.js";

export type PipelineMode = "full" | "arena-only" | "execute-only";

export interface PipelineOptions {
  plan: string;
  llm: LLMProvider;
  executor: NodeExecutor;
  constitution?: Constitution;
  arena?: Partial<ArenaConfig>;
  outputDir?: string;
  pipelineId?: string;
  mode?: PipelineMode;
  todoMarkdown?: string;
  trace?: TraceOptions;
}

export interface PipelineResult {
  pipelineId: string;
  revisedPlan: string;
  todoMarkdown: string;
  report: ExecutionReport | null;
  arenaResult: ArenaResult;
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const now = new Date().toISOString().replace(/[:.]/g, "").slice(0, 17);
  const hex = randomUUID().slice(0, 6);
  const pipelineId = options.pipelineId ?? `${now}-${hex}`;
  const mode = options.mode ?? "full";

  let revisedPlan = options.plan;
  let todoMarkdown = "";

  const constitution = options.constitution ?? createDefaultConstitution();
  const arenaConfig: ArenaConfig = {
    maxDepth: options.arena?.maxDepth ?? 2,
    maxCritiqueCycles: options.arena?.maxCritiqueCycles ?? 1,
    outputDir: options.outputDir,
  };

  let arenaResult: ArenaResult;

  if (mode === "execute-only") {
    if (!options.todoMarkdown) throw new Error("todoMarkdown is required in execute-only mode");
    todoMarkdown = options.todoMarkdown;
    arenaResult = { state: null!, problemsBattled: 0, recursiveBattles: 0, durationMs: 0 };
  } else {
    arenaResult = await runArena(arenaConfig, options.llm, options.plan, constitution);
    if (!arenaResult.state.synthesis) {
      throw new Error("Arena completed without synthesis result");
    }
    revisedPlan = arenaResult.state.synthesis.revisedPlan;
    todoMarkdown = arenaResult.state.synthesis.todoMarkdown;
  }

  let report: ExecutionReport | null = null;
  if (mode === "full" || mode === "execute-only") {
    report = await runOrchestratorFromMarkdown(todoMarkdown, options.executor, { maxRetries: 0 });
  }

  const result: PipelineResult = { pipelineId, revisedPlan, todoMarkdown, report, arenaResult };

  if (options.trace?.enabled) {
    const traceDir = options.trace.outputDir || "output/traces";
    savePipelineIndex(pipelineId, options.trace.planPath ?? null, traceDir);
    saveArenaTrace(pipelineId, options.trace.planPath ?? null, result, traceDir);
    if (report) saveTodoTrace(pipelineId, result, traceDir);
    appendToIndex(pipelineId, traceDir, {
      time: new Date().toISOString(),
      planPath: options.trace.planPath ?? null,
      decisionsCount: arenaResult.problemsBattled,
      todoCompleted: report?.completed ?? 0,
      todoTotal: report?.totalNodes ?? 0,
    });
  }

  return result;
}
