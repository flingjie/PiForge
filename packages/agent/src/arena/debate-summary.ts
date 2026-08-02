import type { ArenaState, Solution, Critique } from "./types.js";

function section(problemTitle: string, personas: string[]): string {
  return `\n### ${problemTitle}\n**Reviewers:** ${personas.join(", ")}\n`;
}

function solutionBlock(sol: Solution, critique?: Critique): string {
  const scores = Object.entries(sol.scores)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

  let block = `\n#### ${sol.persona}\n${scores}\n\n${sol.proposal.slice(0, 300)}\n`;

  if (critique) {
    const severity = critique.severity === "blocker" ? "BLOCKER" :
      critique.severity === "major" ? "MAJOR" : "minor";
    block += `\n*Critic (${severity}):* ${critique.weaknesses.join("; ")}\n`;
  }

  return block;
}

export function formatDebateSummary(state: ArenaState): string {
  const lines: string[] = [];
  let hasContent = false;

  for (const problem of state.subProblems) {
    const solutions = state.solutions.get(problem.id) ?? [];
    const critiqueResult = state.critiques.get(problem.id);
    const decision = state.synthesis?.decisions.find(
      (d) => d.problemId === problem.id,
    );

    if (solutions.length === 0) continue;
    hasContent = true;

    const personas = [...new Set(solutions.map((s) => s.persona))];
    lines.push(section(problem.title, personas));

    for (const sol of solutions) {
      const critique = critiqueResult?.critiques.find(
        (c) => c.solutionPersona === sol.persona,
      );
      lines.push(solutionBlock(sol, critique));
    }

    if (decision) {
      lines.push(
        `\n---\n**Chosen:** ${decision.chosenApproach} — ${decision.decision}\n**Why:** ${decision.reasoning.slice(0, 200)}\n`,
      );
    }
  }

  return hasContent ? `## Debate Summary\n${lines.join("\n")}` : "";
}
