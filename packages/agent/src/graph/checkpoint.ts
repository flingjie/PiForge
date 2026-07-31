import type { Checkpoint, GraphState } from "./types.js";

/**
 * Save a deep-copied snapshot of the current state as a checkpoint.
 * Checkpoints are appended in order; the caller decides when.
 */
export function saveCheckpoint<TState extends GraphState>(
  state: TState,
  nodeName: string,
): void {
  const snapshot: Record<string, unknown> = JSON.parse(JSON.stringify(state));
  const checkpoint: Checkpoint = {
    nodeName,
    timestamp: new Date().toISOString(),
    state: snapshot,
  };
  state.checkpoints.push(checkpoint);
}

/**
 * Restore the graph state from the most recent checkpoint.
 * Mutates `state` in place with the checkpoint's saved values.
 * Returns the name of the node that was restored *from* (i.e. the
 * last successfully completed node before the checkpoint).
 */
export function restoreCheckpoint<TState extends GraphState>(state: TState): string {
  const latest = state.checkpoints.at(-1);
  if (!latest) {
    throw new Error("No checkpoint available to restore from.");
  }
  // Restore every key from the checkpoint into the live state object.
  for (const key of Object.keys(latest.state)) {
    (state as Record<string, unknown>)[key] = latest.state[key];
  }
  return latest.nodeName;
}

/**
 * Returns true if a checkpoint should be written after the given node.
 * A node warrants a checkpoint when it's a barrier (parallel group sync point)
 * or explicitly tagged as a checkpoint node.
 */
export function shouldCheckpoint(
  nodeName: string,
  barrierNodes: Set<string>,
): boolean {
  return barrierNodes.has(nodeName);
}
