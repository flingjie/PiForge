import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, AbilityLensOutput } from "../state.js";

/**
 * Ability Lens — extracts demonstrated and emerging capabilities.
 *
 * Prompt template mirrors reflection-protocol.md §Ability Lens.
 */
export const abilityLensNode: GraphNode<ReflectionState, AbilityLensOutput> = {
  name: "ability_lens",
  run: async (input: NodeInput<ReflectionState>): Promise<AbilityLensOutput> => {
    const { state, tools } = input;

    const stateSnapshot = await (tools.readState as Function)() as Partial<ReflectionState>;
    const transcriptData = await (tools.getTranscript as Function)() as { transcript: string };
    const transcript = transcriptData.transcript || state.transcript;

    const output: AbilityLensOutput = {
      lens: "ability",
      segments: [
        {
          label: "conversation",
          topic: "user capabilities",
          emotional_tone: "neutral",
          signal_strength: "medium",
        },
      ],
      focus_segments: ["conversation"],
      summary: `Ability extraction from transcript (${transcript.length} chars).`,
      demonstrated_abilities: extractAbilities(stateSnapshot.userDNA ?? state.userDNA),
      emerging_edges: [],
      new_connections: [],
      status: "passed",
    };

    if (state._feedback) {
      output.summary += ` [Retry feedback: ${JSON.stringify(state._feedback)}]`;
    }

    state.lensOutputs["ability"] = output;
    return output;
  },
  retryConfig: {
    maxRetries: 1,
    feedbackFn: (attempt: number, _error: Error) => ({
      attempt,
      reason:
        "Ability lens produced insufficient signals. " +
        "Look for self-correction moments, learning edges, and domain-bridging insights.",
    }),
  },
};

function extractAbilities(
  dna: unknown,
): Array<{ ability: string; evidence: string }> {
  const d = dna as Record<string, unknown> | undefined;
  const prefs = d?.preferences as Record<string, unknown> | undefined;
  if (!prefs) return [];
  const result: Array<{ ability: string; evidence: string }> = [];
  if (prefs.work_style) {
    result.push({ ability: `work style: ${prefs.work_style}`, evidence: "user DNA preferences" });
  }
  if (prefs.complexity) {
    result.push({ ability: `handles ${prefs.complexity} complexity`, evidence: "user DNA preferences" });
  }
  return result;
}
