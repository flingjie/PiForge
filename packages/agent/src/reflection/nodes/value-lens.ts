import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, ValueLensOutput } from "../state.js";

/**
 * Value Lens — extracts what the user deeply cares about from the conversation.
 *
 * Prompt template mirrors reflection-protocol.md §Value Lens.
 * Uses readState + getTranscript to access input data.
 */
export const valueLensNode: GraphNode<ReflectionState, ValueLensOutput> = {
  name: "value_lens",
  run: async (input: NodeInput<ReflectionState>): Promise<ValueLensOutput> => {
    const { state, tools } = input;

    // Gather input via permitted tools.
    const stateSnapshot = await (tools.readState as Function)() as Partial<ReflectionState>;
    const transcriptData = await (tools.getTranscript as Function)() as { transcript: string };

    // In production, this assembles a prompt and calls the LLM.
    // For now, produce a structurally valid output from the available data.
    const transcript = transcriptData.transcript || state.transcript;

    const output: ValueLensOutput = {
      lens: "value",
      segments: extractSegments(transcript),
      focus_segments: [],
      summary: `Value extraction from transcript (${transcript.length} chars).`,
      candidate_values: extractCandidateValues(stateSnapshot.userDNA ?? state.userDNA),
      attraction_signals: [],
      emotional_spikes: [],
      status: "passed",
    };

    // Mark focus segments as those with high signal strength.
    output.focus_segments = output.segments
      .filter((s) => s.signal_strength === "high")
      .map((s) => s.label);

    // If retry feedback exists, incorporate it into the summary.
    if (state._feedback) {
      output.summary += ` [Retry feedback: ${JSON.stringify(state._feedback)}]`;
    }

    // Store output in state.
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
  // Simplified segmentation — in production the LLM does this.
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
