import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, PatternLensOutput } from "../state.js";

/**
 * Pattern Lens — identifies recurring patterns, abstraction layers,
 * and cross-domain connections.
 *
 * Prompt template mirrors reflection-protocol.md §Pattern Lens.
 */
export const patternLensNode: GraphNode<ReflectionState, PatternLensOutput> = {
  name: "pattern_lens",
  run: async (input: NodeInput<ReflectionState>): Promise<PatternLensOutput> => {
    const { state, tools } = input;

    const stateSnapshot = await (tools.readState as Function)() as Partial<ReflectionState>;
    const transcriptData = await (tools.getTranscript as Function)() as { transcript: string };
    const transcript = transcriptData.transcript || state.transcript;

    const dna = (stateSnapshot.userDNA ?? state.userDNA) as Record<string, unknown>;
    const output: PatternLensOutput = {
      lens: "pattern",
      segments: [
        {
          label: "conversation",
          topic: "user patterns",
          emotional_tone: "neutral",
          signal_strength: "medium",
        },
      ],
      focus_segments: ["conversation"],
      summary: `Pattern extraction from transcript (${transcript.length} chars).`,
      identified_patterns: extractPatterns(dna),
      abstraction_layers: [],
      cross_domain_connections: [],
      energy_signature: { energizing: [], draining: [] },
      recurring_dilemmas: [],
      decision_heuristics: extractHeuristics(dna),
      status: "passed",
    };

    if (state._feedback) {
      output.summary += ` [Retry feedback: ${JSON.stringify(state._feedback)}]`;
    }

    state.lensOutputs["pattern"] = output;
    return output;
  },
  retryConfig: {
    maxRetries: 1,
    feedbackFn: (attempt: number, _error: Error) => ({
      attempt,
      reason:
        "Pattern lens produced insufficient signals. " +
        "Look for recurring themes, decision-making shortcuts, and energy signatures.",
    }),
  },
};

function extractPatterns(
  dna: Record<string, unknown>,
): Array<{ pattern: string; occurrences: number }> {
  const patterns: Array<{ pattern: string; occurrences: number }> = [];
  const beliefs = dna.beliefs as Array<{ statement: string }> | undefined;
  if (beliefs) {
    patterns.push({
      pattern: `belief-driven decision making (${beliefs.length} beliefs)`,
      occurrences: beliefs.length,
    });
  }
  const criteria = dna.criteria as Array<{ decision_context: string; rule: string }> | undefined;
  if (criteria) {
    patterns.push({
      pattern: `heuristic-based decisions (${criteria.length} criteria)`,
      occurrences: criteria.length,
    });
  }
  return patterns;
}

function extractHeuristics(
  dna: Record<string, unknown>,
): Array<{ context: string; rule: string }> {
  const criteria = dna.criteria as Array<{ decision_context: string; rule: string }> | undefined;
  return criteria?.map((c) => ({ context: c.decision_context, rule: c.rule })) ?? [];
}
