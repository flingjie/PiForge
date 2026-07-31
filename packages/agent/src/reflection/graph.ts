import type { GraphNode, GraphConfig, Edge } from "../graph/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { runGraph } from "../graph/runner.js";
import { valueLensNode } from "./nodes/value-lens.js";
import { abilityLensNode } from "./nodes/ability-lens.js";
import { patternLensNode } from "./nodes/pattern-lens.js";
import { adversaryNode } from "./nodes/adversary.js";
import { synthesizeNode } from "./nodes/synthesize.js";
import { reflectionTools } from "./tools.js";
import { evaluateGate } from "./validation-gate.js";
import type { ReflectionState, GateResult } from "./state.js";

// ---- Node name constants ----
const VALUE = valueLensNode.name;
const ABILITY = abilityLensNode.name;
const PATTERN = patternLensNode.name;
const ADVERSARY = adversaryNode.name;
const SYNTHESIZE = synthesizeNode.name;
const USER_GATE = "user_gate";
const END = "end";

// ---- Barrier nodes (checkpoint after these) ----
const BARRIER_NODES = new Set([
  `barrier:${VALUE}+${ABILITY}+${PATTERN}`,
  ADVERSARY,
  SYNTHESIZE,
  USER_GATE,
]);

/**
 * The user gate is a special node: it doesn't do work itself but serves
 * as a pause/inspect point. In production this would emit an event to the
 * UI and wait for user input. Here it's a pass-through that reads state.
 */
const userGateNode: GraphNode<ReflectionState, { accepted: boolean }> = {
  name: USER_GATE,
  run: async (input) => {
    const { state } = input;
    // In a real system, this would await user interaction.
    // For now: auto-accept if there are proposed diffs with caveats,
    // otherwise mark for user review.
    const hasCaveat = state.gateResult === "1/3";
    const hasDegradedLenses = Object.values(state.lensOutputs).some(
      (out) => out.status === "degraded",
    );

    // Auto-reject if 0 diffs were proposed (no-op run).
    if (state.proposedDiffs.length === 0) {
      return { accepted: false };
    }

    // Auto-accept in non-interactive mode, flagging caveats.
    return { accepted: !hasCaveat || !hasDegradedLenses };
  },
};

/**
 * Build the full reflection graph and return everything needed to run it.
 */
export function buildReflectionGraph() {
  const nodes: Record<string, GraphNode<ReflectionState>> = {
    [VALUE]: valueLensNode,
    [ABILITY]: abilityLensNode,
    [PATTERN]: patternLensNode,
    [ADVERSARY]: adversaryNode,
    [SYNTHESIZE]: synthesizeNode,
    [USER_GATE]: userGateNode,
  };

  // Tool permissions — minimal per node:
  const registry = new ToolRegistry();
  registry.register(reflectionTools.readState!, [VALUE, ABILITY, PATTERN, ADVERSARY, SYNTHESIZE]);
  registry.register(reflectionTools.getTranscript!, [VALUE, ABILITY, PATTERN, ADVERSARY, SYNTHESIZE]);
  registry.register(reflectionTools.writeReflection!, [SYNTHESIZE]);
  registry.register(reflectionTools.updateDNA!, [SYNTHESIZE]);

  // Patch tool execute functions to receive the reflection state at call time.
  // The graph runner passes tools by name; we wrap them to inject state.
  function makeToolsForNode(state: ReflectionState, nodeName: string) {
    const tools = registry.getToolsForNode(nodeName);
    const wrapped: Record<string, (...args: any[]) => unknown> = {};
    for (const [name, fn] of Object.entries(tools)) {
      wrapped[name] = (args: any) => {
        const tool = reflectionTools[name];
        if (tool && tool.execute.length > 1) {
          // Tool expects (args, state).
          return tool.execute(args, state);
        }
        return (fn as Function)(args);
      };
    }
    return wrapped;
  }

  const getTools = (state: ReflectionState) => (nodeName: string) =>
    makeToolsForNode(state, nodeName);

  return { nodes, registry, getTools };
}

/**
 * Run the reflection graph against a given state.
 *
 * The graph topology:
 * ```
 *   value_lens ─┬─ ability_lens ─┬─ pattern_lens   (parallel)
 *        ↓                ↓               ↓
 *         ═══════ BARRIER ═══════                 (checkpoint)
 *                      ↓
 *              validation gate route()
 *            ┌────┬────┼────┬────┐
 *          3/3↓  2/3↓  1/3↓   0/3↓
 *        [adv] [adv] [syn]  [abort→END]
 *            └────┬────┘
 *                 ↓
 *            ═══ BARRIER ═══                       (checkpoint)
 *                 ↓
 *            [synthesize]
 *                 ↓
 *            ═══ BARRIER ═══                       (checkpoint)
 *                 ↓
 *            [user_gate]
 *            ↙        ↘
 *        accept      reject (≤3 cycles: back to adv)
 *          ↓            ↓
 *        [END]     [adv] (cycle++)
 * ```
 */
export async function runReflectionGraph(
  state: ReflectionState,
  config?: Partial<GraphConfig>,
): Promise<ReflectionState> {
  const { nodes, getTools: getToolsFactory } = buildReflectionGraph();

  // Build edges. Most routing is dynamic via condition functions.
  const edges: Edge<ReflectionState>[] = [
    // Lens parallel fan-out: from "start" (no incoming) to all 3 lenses.
    // Runner auto-detects nodes with no incoming edges as entry points,
    // so VALUE, ABILITY, PATTERN are all entries.
    //
    // After each lens → barrier → gate evaluation → route.
    { from: VALUE },
    { from: ABILITY },
    { from: PATTERN },
    // After all 3 lenses complete, route based on gate result.
    { from: `barrier:${VALUE}+${ABILITY}+${PATTERN}`, condition: gateRoute },
    // Adversary → Synthesize (for 3/3, 2/3 paths).
    { from: ADVERSARY, to: SYNTHESIZE },
    // Synthesize → User Gate.
    { from: SYNTHESIZE, to: USER_GATE },
    // User Gate → End or loop back to Adversary.
    { from: USER_GATE, condition: userGateRoute },
  ];

  const fullConfig: GraphConfig = {
    checkpointing: true,
    maxCycles: config?.maxCycles ?? 3,
  };

  const getTools = getToolsFactory(state);

  return runGraph(nodes, edges, state, fullConfig, getTools, BARRIER_NODES, [
    VALUE,
    ABILITY,
    PATTERN,
  ]);
}

/**
 * Route after the lens parallel barrier based on validation gate.
 */
function gateRoute(state: ReflectionState): string | string[] | null {
  // Evaluate the validation gate.
  const result = evaluateGate(state);

  switch (result) {
    case "3/3":
      // All passed → full adversary.
      return [ADVERSARY];
    case "2/3":
      // Two passed → adversary with relaxed cross-corroboration.
      return [ADVERSARY];
    case "1/3":
      // One passed → skip adversary, go straight to synthesize with caveat.
      return [SYNTHESIZE];
    case "0/3":
      // All failed → abort.
      state.status = "aborted";
      return null;
    default:
      return null;
  }
}

/**
 * Route after user gate: accept → end, reject → loop back to adversary.
 * Rejects are bounded by maxCycles in the runner.
 */
function userGateRoute(state: ReflectionState): string | string[] | null {
  const lastResult = state.nodeResults[USER_GATE];
  if (!lastResult) return null;

  const output = lastResult.output as { accepted: boolean } | undefined;
  const accepted = output?.accepted ?? false;

  if (accepted) {
    // Record accepted diffs and write back to state.
    state.acceptedDiffs = [...state.proposedDiffs];
    state.status = "completed";
    return null; // End of graph.
  }

  // Rejected — loop back to adversary for re-judgment.
  // Increment cycle count for the runner's cycle detection.
  state.cycleCount = (state.cycleCount ?? 0) + 1;
  return [ADVERSARY];
}
