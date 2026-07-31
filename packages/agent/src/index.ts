// Graph engine.
export type {
  GraphNode,
  GraphState,
  GraphConfig,
  NodeInput,
  NodeResult,
  Checkpoint,
} from "./graph/types.js";
export { DEFAULT_GRAPH_CONFIG } from "./graph/types.js";
export { runGraph } from "./graph/runner.js";
export { parallel } from "./graph/concurrency.js";
export { saveCheckpoint, restoreCheckpoint, shouldCheckpoint } from "./graph/checkpoint.js";
export { withRetry, RetryExhaustedError } from "./graph/retry.js";

// Reflection protocol.
export type {
  ReflectionState,
  LensOutput,
  ValueLensOutput,
  AbilityLensOutput,
  PatternLensOutput,
  AdversaryVerdict,
  AdversaryOutput,
  ProposedDiff,
  SynthesizeOutput,
  GateResult,
} from "./reflection/state.js";
export { createReflectionState } from "./reflection/state.js";
export { runReflectionGraph } from "./reflection/graph.js";
export { checkSignalDensity, evaluateGate } from "./reflection/validation-gate.js";
export { writeReflection, updateDNA } from "./reflection/tools.js";

// Reflection nodes.
export { valueLensNode } from "./reflection/nodes/value-lens.js";
export { abilityLensNode } from "./reflection/nodes/ability-lens.js";
export { patternLensNode } from "./reflection/nodes/pattern-lens.js";
export { adversaryNode } from "./reflection/nodes/adversary.js";
export { synthesizeNode } from "./reflection/nodes/synthesize.js";
