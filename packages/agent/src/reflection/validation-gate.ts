import type {
  LensOutput,
  ValueLensOutput,
  AbilityLensOutput,
  PatternLensOutput,
  GateResult,
  ReflectionState,
} from "./state.js";

/**
 * Check signal density for a lens output.
 * Returns `true` if the lens produced at least the minimum number of meaningful signals.
 *
 * Threshold: ≥1 signal per lens type.
 */
export function checkSignalDensity(output: LensOutput): boolean {
  switch (output.lens) {
    case "value": {
      const v = output as ValueLensOutput;
      return (v.candidate_values?.length ?? 0) + (v.attraction_signals?.length ?? 0) >= 1;
    }
    case "ability": {
      const a = output as AbilityLensOutput;
      return (a.demonstrated_abilities?.length ?? 0) + (a.emerging_edges?.length ?? 0) >= 1;
    }
    case "pattern": {
      const p = output as PatternLensOutput;
      return (p.identified_patterns?.length ?? 0) + (p.recurring_dilemmas?.length ?? 0) >= 1;
    }
    default:
      return false;
  }
}

/**
 * Evaluate the validation gate for all lens outputs.
 *
 * Returns the gate result as a fraction string:
 * - "3/3": all lenses passed
 * - "2/3": two lenses passed, one degraded
 * - "1/3": one lens passed, two degraded
 * - "0/3": all lenses degraded or failed
 *
 * Side effect: updates each lens output's `status` field and
 * writes gate result into `state.gateResult`.
 */
export function evaluateGate(state: ReflectionState): GateResult {
  const lensNames: Array<"value" | "ability" | "pattern"> = ["value", "ability", "pattern"];
  let passed = 0;

  for (const name of lensNames) {
    const output = state.lensOutputs[name];
    if (!output) {
      // Lens never ran — mark as failed.
      state.lensOutputs[name] = {
        lens: name,
        segments: [],
        focus_segments: [],
        summary: `Lens "${name}" did not produce output.`,
        status: "failed",
      } as LensOutput;
      continue;
    }

    if (checkSignalDensity(output)) {
      output.status = "passed";
      passed++;
    } else {
      output.status = "degraded";
    }
  }

  const result: GateResult = `${passed}/3` as GateResult;
  state.gateResult = result;
  return result;
}
