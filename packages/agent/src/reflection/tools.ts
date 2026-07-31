import type { ReflectionState, ProposedDiff } from "./state.js";

/**
 * Append a reflection event to the reflections log.
 * Only callable from the synthesize node.
 */
export function writeReflection(
  state: ReflectionState,
  args: {
    lensOutputs: unknown;
    adversaryOutput: unknown;
    proposedDiffs: unknown;
  },
): boolean {
  const event = {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    protocol_version: 1,
    timestamp: new Date().toISOString(),
    lens_outputs: args.lensOutputs,
    adversary_verdict: args.adversaryOutput,
    proposed_diffs: args.proposedDiffs,
    status: "complete",
  };
  state.reflections.push(event as unknown as Record<string, unknown>);
  return true;
}

/**
 * Merge diffs into the user DNA model.
 * Only callable after user gate accepts.
 */
export function updateDNA(
  state: ReflectionState,
  diffs: ProposedDiff[],
): number {
  let applied = 0;

  for (const diff of diffs) {
    const section = state.userDNA[diff.section] as Record<string, unknown> | undefined;
    if (!section && diff.action !== "add") continue;

    switch (diff.action) {
      case "add":
      case "modify":
        if (!state.userDNA[diff.section]) {
          state.userDNA[diff.section] = {};
        }
        (state.userDNA[diff.section] as Record<string, unknown>)[diff.target] = diff.value;
        applied++;
        break;
      case "remove":
        if (section && diff.target in section) {
          delete section[diff.target];
          applied++;
        }
        break;
    }
  }
  return applied;
}
