import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, SynthesizeOutput, ProposedDiff } from "../state.js";
import type { AdversaryOutput } from "../state.js";
import { writeReflection, updateDNA } from "../tools.js";

export const synthesizeNode: GraphNode<ReflectionState, SynthesizeOutput> = {
  name: "synthesize",
  run: async (input: NodeInput<ReflectionState>): Promise<SynthesizeOutput> => {
    const { state } = input;
    const adversaryOutput = state.adversaryOutput;

    const degraded = Object.entries(state.lensOutputs)
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

    // Write reflection event and apply DNA updates.
    writeReflection(state, {
      lensOutputs: state.lensOutputs,
      adversaryOutput: adversaryOutput,
      proposedDiffs,
    });

    return output;
  },
};

function buildProposedDiffs(
  adversaryOutput: AdversaryOutput | null,
): ProposedDiff[] {
  if (!adversaryOutput) return [];

  const diffs: ProposedDiff[] = [];
  for (const v of adversaryOutput.verdicts) {
    if (v.verdict !== "confirmed") continue;
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
