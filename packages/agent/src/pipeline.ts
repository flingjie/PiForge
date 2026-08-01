import { runArena } from "./arena/orchestrator.js";
import { runOrchestratorFromMarkdown } from "./todo/orchestrator.js";
import { createDefaultConstitution } from "./constitution/defaults.js";
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
}

export interface PipelineResult {
  revisedPlan: string;
  todoMarkdown: string;
  report: ExecutionReport;
  arenaResult: ArenaResult;
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
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

  return {
    revisedPlan: arenaResult.state.synthesis.revisedPlan,
    todoMarkdown: arenaResult.state.synthesis.todoMarkdown,
    report,
    arenaResult,
  };
}
