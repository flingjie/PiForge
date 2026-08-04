import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ArenaConfig,
  ArenaState,
  ArenaResult,
  LLMProvider,
  SubProblem,
  Solution,
  CritiqueResult,
  FusedDecision,
} from "./types.js";
import type { Constitution, RubricDimension } from "../constitution/types.js";
import { getCoreAgentsFromConstitution, AGENT_SYSTEM_PROMPTS, CRITIC_PROMPT, SYNTHESIZER_PROMPT, SYNTHESIZE_ALL_PROMPT } from "./agent-pool.js";
import { createDefaultConstitution } from "../constitution/defaults.js";
import { extractJSON, complete } from "./json-utils.js";

function formatRubric(dimensions: RubricDimension[]): string {
  return dimensions.map((d) => `  - ${d.key}: ${d.defaultWeight} (${d.label})\n    ${d.description}`).join("\n");
}

// ---- Solution generation ----

function buildSolutionPrompt(
  problem: SubProblem,
  persona: string,
  plan: string,
  rubric: RubricDimension[],
): string {
  const system = AGENT_SYSTEM_PROMPTS[persona] ??
    `You are a Design Architect with a "${persona}" philosophy.`;

  const dimKeys = rubric.map((d) => d.key);

  return `${system}

**Problem to solve:** ${problem.title}
${problem.description}

**Original Plan:**
${plan.slice(0, 2000)}

**Rubric (score yourself 0-100 on each):**
${formatRubric(rubric)}

Return ONLY valid JSON:
{
  "persona": "${persona}",
  "problemId": "${problem.id}",
  "proposal": "<your approach, 2-3 paragraphs>",
  "scores": { ${dimKeys.map((k) => `"${k}": <0-100>`).join(", ")} },
  "rationale": "<why this approach>"
}`;
}

function parseSolution(raw: string, persona: string, problemId: string): Solution {
  const o = JSON.parse(extractJSON(raw)) as Record<string, unknown>;
  return {
    persona: (o["persona"] as string) ?? persona,
    problemId: (o["problemId"] as string) ?? problemId,
    proposal: (o["proposal"] as string) ?? "",
    scores: (o["scores"] as Record<string, number>) ?? {},
    rationale: (o["rationale"] as string) ?? "",
  };
}

// ---- Critique ----

function buildCritiquePrompt(problem: SubProblem, solutions: Solution[]): string {
  return `${CRITIC_PROMPT}

**Problem:** ${problem.title}
${problem.description}

**Solutions:**
${JSON.stringify(solutions, null, 2)}

Return ONLY valid JSON as specified above.`;
}

function parseCritique(raw: string, problemId: string): CritiqueResult {
  const o = JSON.parse(extractJSON(raw)) as Record<string, unknown>;
  return {
    problemId: (o["problemId"] as string) ?? problemId,
    critiques: ((o["critiques"] as Array<Record<string, unknown>>) ?? []).map((c) => ({
      solutionPersona: (c["solutionPersona"] as string) ?? "",
      weaknesses: (c["weaknesses"] as string[]) ?? [],
      severity: (c["severity"] as "blocker" | "major" | "minor") ?? "minor",
    })),
    needsMoreDebate: (o["needsMoreDebate"] as boolean) ?? false,
    debateFocus: o["debateFocus"] as string | undefined,
  };
}

// ---- Synthesis ----

function buildSynthesizePrompt(
  problem: SubProblem,
  solutions: Solution[],
  critique: CritiqueResult,
  rubric: RubricDimension[],
): string {
  return `${SYNTHESIZER_PROMPT}

**Problem:** ${problem.title}
**Solutions:** ${JSON.stringify(solutions, null, 2)}
**Critique:** ${JSON.stringify(critique, null, 2)}
**Rubric:** ${formatRubric(rubric)}

Return ONLY valid JSON as specified above.`;
}

function parseSynthesize(raw: string, problemId: string, problemTitle: string): FusedDecision {
  const o = JSON.parse(extractJSON(raw)) as Record<string, unknown>;
  return {
    problemId: (o["problemId"] as string) ?? problemId,
    problemTitle: (o["problemTitle"] as string) ?? problemTitle,
    chosenApproach: (o["chosenApproach"] as string) ?? "",
    decision: (o["decision"] as string) ?? "",
    reasoning: (o["reasoning"] as string) ?? "",
  };
}

// ---- Synthesize All ----

function buildSynthesizeAllPrompt(originalPlan: string, decisions: FusedDecision[]): string {
  return `${SYNTHESIZE_ALL_PROMPT}

**Original Plan:**
${originalPlan.slice(0, 3000)}

**Arena Decisions:**
${JSON.stringify(decisions, null, 2)}

Return ONLY valid JSON with "revisedPlan" and "todoMarkdown".`;
}

function parseSynthesizeAll(raw: string): { revisedPlan: string; todoMarkdown: string } {
  const o = JSON.parse(extractJSON(raw)) as Record<string, unknown>;
  return {
    revisedPlan: (o["revisedPlan"] as string) ?? "",
    todoMarkdown: (o["todoMarkdown"] as string) ?? "",
  };
}

// ---- Orchestrator ----

/** Extract decision points from `## Decision Points` section.
 *
 * Format:
 *   ## Decision Points
 *   - title: description
 *   - title: description
 */
export function extractDecisions(planContent: string): SubProblem[] {
  const decisions: SubProblem[] = [];

  // Find the ## Decision Points section
  const sectionMatch = planContent.match(/^##\s+Decision Points\s*\n([\s\S]*?)(?=\n##\s|\n\s*$)/m);
  if (!sectionMatch) return decisions;

  const section = sectionMatch[1]!;
  const itemRegex = /^-\s+([^:]+)\s*:\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  let counter = 0;

  while ((match = itemRegex.exec(section)) !== null) {
    counter++;
    const title = match[1]!.trim();
    const description = match[2]!.trim();

    decisions.push({
      id: `gap-${counter}`,
      title,
      description: description.slice(0, 200),
      sourceSection: `## Decision Points`,
    });
  }

  return decisions;
}

function createInitialState(config: ArenaConfig, plan: string): ArenaState {
  return {
    config,
    originalPlan: plan,
    subProblems: [],
    solutions: new Map(),
    critiques: new Map(),
    currentDepth: 0,
    synthesis: null,
    status: "running",
  };
}

async function battleSubProblem(
  state: ArenaState,
  problem: SubProblem,
  provider: LLMProvider,
  constitution: Constitution,
  perspectives?: Map<string, string[]>,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const personas = perspectives?.get(problem.title) ?? getCoreAgentsFromConstitution(constitution);
  const rubric = constitution.rubric;

  const solutions = await Promise.all(
    personas.map(async (persona) => {
      const prompt = buildSolutionPrompt(problem, persona, state.originalPlan, rubric);
      const raw = await complete(provider, prompt, signal);
      return parseSolution(raw, persona, problem.id);
    }),
  );
  state.solutions.set(problem.id, solutions);

  signal?.throwIfAborted();
  let critique = parseCritique(
    await complete(provider, buildCritiquePrompt(problem, solutions), signal),
    problem.id,
  );

  let cycleCount = 0;
  while (critique.needsMoreDebate && cycleCount < state.config.maxCritiqueCycles) {
    signal?.throwIfAborted();
    cycleCount++;
    state.currentDepth++;
    if (state.currentDepth > state.config.maxDepth) break;

    const deepProblem = {
      ...problem,
      description: `${problem.description}\n\nDeep dive: ${critique.debateFocus ?? "general"}`,
    };

    const deeper = await Promise.all(
      personas.map(async (persona) => {
        const prompt = buildSolutionPrompt(deepProblem, persona, state.originalPlan, rubric);
        const raw = await complete(provider, prompt, signal);
        return parseSolution(raw, persona, problem.id);
      }),
    );

    solutions.push(...deeper);
    state.solutions.set(problem.id, solutions);

    critique = parseCritique(
      await complete(provider, buildCritiquePrompt(problem, solutions), signal),
      problem.id,
    );
  }

  state.critiques.set(problem.id, critique);
}

export async function runArena(
  config: ArenaConfig,
  provider: LLMProvider,
  planContent: string,
  constitution?: Constitution,
  perspectives?: Map<string, string[]>,
  signal?: AbortSignal,
): Promise<ArenaResult> {
  signal?.throwIfAborted();
  const startTime = performance.now();
  const state = createInitialState(config, planContent);
  const c = constitution ?? createDefaultConstitution();
  let recursiveBattles = 0;

  state.subProblems = extractDecisions(planContent);

  if (state.subProblems.length === 0) {
    state.synthesis = { decisions: [], revisedPlan: planContent, todoMarkdown: "" };
    state.status = "completed";
    return { state, problemsBattled: 0, recursiveBattles: 0, durationMs: performance.now() - startTime };
  }

  for (const problem of state.subProblems) {
    signal?.throwIfAborted();
    await battleSubProblem(state, problem, provider, c, perspectives, signal);
    if (state.currentDepth > 0) recursiveBattles++;
  }

  signal?.throwIfAborted();
  const decisions = await Promise.all(
    state.subProblems.map(async (problem) => {
      const solutions = state.solutions.get(problem.id) ?? [];
      const critique = state.critiques.get(problem.id);
      if (!critique) throw new Error(`Missing critique for ${problem.id}`);
      const raw = await complete(provider, buildSynthesizePrompt(problem, solutions, critique, c.rubric), signal);
      return parseSynthesize(raw, problem.id, problem.title);
    }),
  );

  signal?.throwIfAborted();
  const synthRaw = await complete(provider, buildSynthesizeAllPrompt(state.originalPlan, decisions), signal);
  const synth = parseSynthesizeAll(synthRaw);

  state.synthesis = { decisions, revisedPlan: synth.revisedPlan, todoMarkdown: synth.todoMarkdown };

  if (config.outputDir) {
    mkdirSync(config.outputDir, { recursive: true });
    writeFileSync(join(config.outputDir, "plan.md"), synth.revisedPlan);
    writeFileSync(join(config.outputDir, "todo.md"), synth.todoMarkdown);
  }

  state.status = "completed";

  return {
    state,
    problemsBattled: state.subProblems.length,
    recursiveBattles,
    durationMs: performance.now() - startTime,
  };
}
