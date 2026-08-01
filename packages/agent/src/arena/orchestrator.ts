import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ArenaConfig,
  ArenaState,
  ArenaResult,
  AgentProvider,
  SubProblem,
} from "./types.js";
import { detectGaps } from "./gap-detector.js";
import { getAgentsFor } from "./agent-pool.js";
import { validateDesign } from "./validator.js";

function createInitialState(config: ArenaConfig, plan: string): ArenaState {
  return {
    config,
    originalPlan: plan,
    subProblems: [],
    solutions: new Map(),
    critiques: new Map(),
    currentDepth: 0,
    synthesis: null,
    validation: null,
    status: "running",
  };
}

async function battleSubProblem(
  state: ArenaState,
  problem: SubProblem,
  provider: AgentProvider,
): Promise<void> {
  const personas = getAgentsFor(problem);

  // Round 1: Generate solutions from all agents
  const solutions = await Promise.all(
    personas.map((persona) =>
      provider.generateSolution(problem, persona, {
        plan: state.originalPlan,
        rubric: state.config.rubric,
      }),
    ),
  );
  state.solutions.set(problem.id, solutions);

  // Critique
  let critique = await provider.critique(problem, solutions, {
    plan: state.originalPlan,
  });

  // Recursive battle: if critic says more debate needed, go deeper
  let cycleCount = 0;
  while (critique.needsMoreDebate && cycleCount < state.config.maxCritiqueCycles) {
    cycleCount++;
    state.currentDepth++;

    if (state.currentDepth > state.config.maxDepth) break;

    // Generate more solutions focused on the debated aspect
    const deeperSolutions = await Promise.all(
      personas.map((persona) =>
        provider.generateSolution(
          {
            ...problem,
            description: `${problem.description}\n\nDeep dive focus: ${critique.debateFocus ?? "general"}`,
          },
          persona,
          { plan: state.originalPlan, rubric: state.config.rubric },
        ),
      ),
    );

    // Combine with existing solutions
    const allSolutions = [...solutions, ...deeperSolutions];
    state.solutions.set(problem.id, allSolutions);

    // Re-critique the expanded set
    critique = await provider.critique(problem, allSolutions, {
      plan: state.originalPlan,
    });
  }

  state.critiques.set(problem.id, critique);
}

export async function runArena(
  config: ArenaConfig,
  provider: AgentProvider,
  planContent: string,
): Promise<ArenaResult> {
  const startTime = performance.now();
  const state = createInitialState(config, planContent);
  let recursiveBattles = 0;

  // 1. Gap Detection
  state.subProblems = detectGaps(planContent);

  if (state.subProblems.length === 0) {
    state.status = "completed";
    return {
      state,
      problemsBattled: 0,
      recursiveBattles: 0,
      durationMs: performance.now() - startTime,
    };
  }

  // 2. Battle each sub-problem
  for (const problem of state.subProblems) {
    await battleSubProblem(state, problem, provider);
    if (state.currentDepth > 0) recursiveBattles++;
  }

  // 3. Synthesize decisions for each sub-problem
  const decisions = await Promise.all(
    state.subProblems.map((problem) => {
      const solutions = state.solutions.get(problem.id) ?? [];
      const critique = state.critiques.get(problem.id);
      if (!critique) throw new Error(`Missing critique for ${problem.id}`);
      return provider.synthesize(problem, solutions, critique, {
        plan: state.originalPlan,
        rubric: state.config.rubric,
      });
    }),
  );

  // 4. Synthesize overall plan and todo
  const synthesisResult = await provider.synthesizeAll(
    state.originalPlan,
    decisions,
  );
  state.synthesis = {
    decisions,
    revisedPlan: synthesisResult.revisedPlan,
    todoMarkdown: synthesisResult.todoMarkdown,
  };

  // Write synthesis output files if an output directory is configured.
  if (config.outputDir) {
    mkdirSync(config.outputDir, { recursive: true });
    writeFileSync(join(config.outputDir, "plan.md"), synthesisResult.revisedPlan);
    writeFileSync(join(config.outputDir, "todo.md"), synthesisResult.todoMarkdown);
  }

  // 5. Validate
  state.validation = validateDesign(
    synthesisResult.revisedPlan,
    synthesisResult.todoMarkdown,
  );

  state.status = "completed";
  return {
    state,
    problemsBattled: state.subProblems.length,
    recursiveBattles,
    durationMs: performance.now() - startTime,
  };
}
