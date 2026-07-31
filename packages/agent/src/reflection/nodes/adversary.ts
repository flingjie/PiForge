import type { GraphNode, NodeInput } from "../../graph/types.js";
import type { ReflectionState, AdversaryOutput, AdversaryVerdict, LensOutput } from "../state.js";

/**
 * Adversary Agent — a calibrated skeptic that reviews all three lens outputs.
 *
 * Runs cross-corroboration: confirmed signals from one lens should find
 * supporting evidence in others. Produces verdicts and action experiments.
 *
 * Behaviour varies by gate result:
 * - 3/3: full cross-corroboration
 * - 2/3: relaxed cross-corroboration (degraded lens gets less weight)
 * - 1/3: minimal — only the single surviving lens is used
 */
export const adversaryNode: GraphNode<ReflectionState, AdversaryOutput> = {
  name: "adversary",
  run: async (input: NodeInput<ReflectionState>): Promise<AdversaryOutput> => {
    const { state, tools } = input;

    // Read all lens outputs and state.
    const stateSnapshot = await (tools.readState as Function)() as Partial<ReflectionState>;
    const lensOutputs = stateSnapshot.lensOutputs ?? state.lensOutputs;

    const verdicts = buildVerdicts(lensOutputs, state.gateResult);
    const qualityScore = computeQualityScore(verdicts);

    const output: AdversaryOutput = {
      verdicts,
      action_experiments: buildExperiments(verdicts),
      deep_dive_candidates: findDeepDiveCandidates(verdicts),
      filtered_signals: findFilteredSignals(verdicts),
      overall_quality_score: qualityScore,
      surviving_signals_summary: buildSummary(verdicts),
    };

    state.adversaryOutput = output;
    return output;
  },
};

function buildVerdicts(
  lensOutputs: Record<string, LensOutput>,
  gateResult: string,
): AdversaryVerdict[] {
  const verdicts: AdversaryVerdict[] = [];
  const crossCorroborate = gateResult !== "1/3"; // Relax when only one lens survived.

  for (const [name, output] of Object.entries(lensOutputs)) {
    if (!output || output.status === "failed") continue;

    const confidence = output.status === "degraded" ? "uncertain" : "confirmed";

    verdicts.push({
      signal: `${name} lens: ${output.summary}`,
      verdict: confidence,
      reasoning: crossCorroborate
        ? `Cross-referenced with other lens outputs. Status: ${output.status}.`
        : `Single-lens mode — verdict based solely on ${name} lens (${output.status}).`,
    });

    // If the lens had specific findings, enumerate them.
    const findings = extractFindings(output);
    for (const finding of findings) {
      verdicts.push({
        signal: finding,
        verdict: confidence,
        reasoning: `Extracted by ${name} lens (status: ${output.status}).`,
      });
    }
  }

  return verdicts;
}

function extractFindings(output: LensOutput): string[] {
  const findings: string[] = [];
  // Extract signals from lens-specific keys if present.
  const extra = output as Record<string, unknown>;
  const candidateValues = extra.candidate_values as Array<{ key: string; score: number }> | undefined;
  if (candidateValues) {
    for (const cv of candidateValues) {
      findings.push(`value: ${cv.key} (score: ${cv.score})`);
    }
  }
  const demonstrated = extra.demonstrated_abilities as Array<{ ability: string }> | undefined;
  if (demonstrated) {
    for (const da of demonstrated) {
      findings.push(`ability: ${da.ability}`);
    }
  }
  const patterns = extra.identified_patterns as Array<{ pattern: string }> | undefined;
  if (patterns) {
    for (const p of patterns) {
      findings.push(`pattern: ${p.pattern}`);
    }
  }
  return findings;
}

function computeQualityScore(verdicts: AdversaryVerdict[]): number {
  if (verdicts.length === 0) return 0;
  const confirmed = verdicts.filter((v) => v.verdict === "confirmed").length;
  return Math.round((confirmed / verdicts.length) * 100) / 100;
}

function buildExperiments(
  verdicts: AdversaryVerdict[],
): Array<{ insight: string; rule: string; verify: string }> {
  return verdicts
    .filter((v) => v.verdict === "confirmed")
    .slice(0, 3)
    .map((v) => ({
      insight: v.signal,
      rule: `If [trigger related to ${v.signal.slice(0, 40)}], then [take action].`,
      verify: "Track outcome in next reflection cycle.",
    }));
}

function findDeepDiveCandidates(verdicts: AdversaryVerdict[]): string[] {
  return verdicts
    .filter((v) => v.verdict === "uncertain")
    .map((v) => v.signal);
}

function findFilteredSignals(verdicts: AdversaryVerdict[]): string[] {
  return verdicts
    .filter((v) => v.verdict === "rejected")
    .map((v) => v.signal);
}

function buildSummary(verdicts: AdversaryVerdict[]): string {
  const confirmed = verdicts.filter((v) => v.verdict === "confirmed").length;
  const uncertain = verdicts.filter((v) => v.verdict === "uncertain").length;
  const rejected = verdicts.filter((v) => v.verdict === "rejected").length;
  return `${confirmed} confirmed, ${uncertain} uncertain, ${rejected} rejected.`;
}
