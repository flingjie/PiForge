import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, SynthesizeOutput, ProposedDiff } from "../state.js";

/**
 * Synthesize — combines adversary verdicts into proposed user DNA diffs
 * and action experiments. Presents them for user approval (user gate).
 *
 * Runs in three modes depending on gate result:
 * - Normal: 3/3 or 2/3 → full synthesize
 * - Caveat: 1/3 → synthesize with heavy caveat, report degraded lenses
 * - Skipped: 0/3 (synthesize node is skipped by the router)
 */
export const synthesizeNode: GraphNode<ReflectionState, SynthesizeOutput> = {
  name: "synthesize",
  run: async (input: NodeInput<ReflectionState>): Promise<SynthesizeOutput> => {
    const { state, tools } = input;

    // Read current state to access adversary output.
    const stateSnapshot = await (tools.readState as Function)() as Partial<ReflectionState>;
    const adversaryOutput = stateSnapshot.adversaryOutput ?? state.adversaryOutput;

    const degraded = Object.entries(stateSnapshot.lensOutputs ?? state.lensOutputs)
      .filter(([, out]) => out.status === "degraded" || out.status === "failed")
      .map(([name]) => name);

    const proposedDiffs = buildProposedDiffs(adversaryOutput);
    const experiments = adversaryOutput?.action_experiments ?? [];

    const output: SynthesizeOutput = {
      proposed_diffs: proposedDiffs,
      action_experiments: experiments,
      summary: buildSummary(proposedDiffs, degraded, state.gateResult),
      degraded_lenses: degraded,
    };

    state.proposedDiffs = proposedDiffs;
    return output;
  },
};

function buildProposedDiffs(
  adversaryOutput: import("../state.js").AdversaryOutput | null,
): ProposedDiff[] {
  if (!adversaryOutput) return [];

  const diffs: ProposedDiff[] = [];
  for (const v of adversaryOutput.verdicts) {
    if (v.verdict !== "confirmed") continue;
    // For each confirmed signal, propose a preference add.
    diffs.push({
      section: "preferences",
      action: "add",
      target: `reflection_${diffs.length}`,
      value: { signal: v.signal, source: "adversary confirmed" },
      rationale: v.reasoning,
    });
  }
  return diffs;
}

function buildSummary(
  diffs: ProposedDiff[],
  degraded: string[],
  gateResult: string,
): string {
  let summary = `${diffs.length} diffs proposed.`;
  if (degraded.length > 0) {
    summary += ` Degraded lenses: ${degraded.join(", ")}.`;
  }
  if (gateResult === "1/3") {
    summary += " HEAVY CAVEAT: only 1/3 lenses passed — treat findings as exploratory.";
  }
  return summary;
}
