import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, ValueLensOutput } from "../state.js";

/**
 * Value Lens — extracts what the user deeply cares about from the conversation.
 *
 * Reads directly from input.state. In production, this would assemble a
 * prompt from the state data and call an LLM.
 */
export const valueLensNode: GraphNode<ReflectionState, ValueLensOutput> = {
  name: "value_lens",
  run: async (input: NodeInput<ReflectionState>): Promise<ValueLensOutput> => {
    const { state } = input;

    const output: ValueLensOutput = {
      lens: "value",
      segments: extractSegments(state.transcript),
      focus_segments: [],
      summary: `Value extraction from transcript (${state.transcript.length} chars).`,
      candidate_values: extractCandidateValues(state.userDNA),
      attraction_signals: [],
      emotional_spikes: [],
      status: "passed",
    };

    output.focus_segments = output.segments
      .filter((s) => s.signal_strength === "high")
      .map((s) => s.label);

    if (state._feedback) {
      output.summary += ` [Retry feedback: ${JSON.stringify(state._feedback)}]`;
    }

    state.lensOutputs["value"] = output;
    return output;
  },
  retryConfig: {
    maxRetries: 1,
    feedbackFn: (attempt: number, _error: Error) => ({
      attempt,
      reason:
        "Value lens produced insufficient signals. " +
        "Re-examine emotional spikes and attraction signals in the transcript. " +
        "Look for implicit value expressions, trade-off moments, and energy shifts.",
    }),
  },
};

function extractSegments(
  transcript: string,
): Array<{ label: string; topic: string; emotional_tone: string; signal_strength: "high" | "medium" | "low" }> {
  if (!transcript.trim()) return [];
  return [
    {
      label: "conversation",
      topic: "user reflection",
      emotional_tone: "neutral",
      signal_strength: "medium",
    },
  ];
}

function extractCandidateValues(
  dna: unknown,
): Array<{ key: string; score: number; evidence: string }> {
  const d = dna as Record<string, unknown> | undefined;
  if (!d?.values) return [];
  const values = d.values as Record<string, Record<string, number>>;
  const candidates: Array<{ key: string; score: number; evidence: string }> = [];
  for (const [dimension, scores] of Object.entries(values)) {
    for (const [key, score] of Object.entries(scores)) {
      candidates.push({ key, score, evidence: `DNA ${dimension}.${key} = ${score}` });
    }
  }
  return candidates;
}
