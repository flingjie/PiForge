import type { GraphNode, GraphConfig } from "../graph/types.js";
import { runGraph } from "../graph/runner.js";
import { valueLensNode } from "./nodes/value-lens.js";
import { abilityLensNode } from "./nodes/ability-lens.js";
import { patternLensNode } from "./nodes/pattern-lens.js";
import { adversaryNode } from "./nodes/adversary.js";
import { synthesizeNode } from "./nodes/synthesize.js";
import { evaluateGate } from "./validation-gate.js";
import type { ReflectionState } from "./state.js";
import { updateDNA } from "./tools.js";

// ---- Node name constants ----
const VALUE = valueLensNode.name;
const ABILITY = abilityLensNode.name;
const PATTERN = patternLensNode.name;
const ADVERSARY = adversaryNode.name;
const SYNTHESIZE = synthesizeNode.name;
const USER_GATE = "user_gate";

const BARRIER_LENS = `barrier:${VALUE}+${ABILITY}+${PATTERN}`;

// ---- Barrier nodes (checkpoint after these) ----
const BARRIER_NODES = new Set([BARRIER_LENS, ADVERSARY, SYNTHESIZE, USER_GATE]);

/**
 * The user gate is a pause/inspect point. In production this would await
 * user input; here it auto-decides based on caveats.
 */
const userGateNode: GraphNode<ReflectionState, { accepted: boolean }> = {
  name: USER_GATE,
  run: async (input) => {
    const { state } = input;
    const hasCaveat = state.gateResult === "1/3";
    const hasDegradedLenses = Object.values(state.lensOutputs).some(
      (out) => out.status === "degraded",
    );

    if (state.proposedDiffs.length === 0) return { accepted: false };
    return { accepted: !hasCaveat || !hasDegradedLenses };
  },
};

/**
 * Build the reflection graph nodes.
 */
function buildNodes(): Record<string, GraphNode<ReflectionState>> {
  return {
    [VALUE]: valueLensNode,
    [ABILITY]: abilityLensNode,
    [PATTERN]: patternLensNode,
    [ADVERSARY]: adversaryNode,
    [SYNTHESIZE]: synthesizeNode,
    [USER_GATE]: userGateNode,
  };
}

/**
 * The route function — the graph's entire topology in one switch.
 *
 * ```
 *   [value_lens + ability_lens + pattern_lens]  (parallel entry)
 *                      ↓
 *              barriere:xxx → gateRoute
 *            ┌────┬────┼────┬────┐
 *          3/3↓  2/3↓  1/3↓   0/3↓
 *        [adv] [adv] [syn]  null
 *            └────┬────┘
 *                 ↓
 *            [synthesize]
 *                 ↓
 *            [user_gate]
 *            ↙        ↘
 *        null     [adv] (loop ≤3 cycles)
 * ```
 */
function route(nodeName: string, state: ReflectionState): string[] | null {
  switch (nodeName) {
    // After the 3-lens parallel barrier, evaluate the gate.
    case BARRIER_LENS:
      return gateRoute(state);

    // After adversary, go to synthesize.
    case ADVERSARY:
      return [SYNTHESIZE];

    // After synthesize, go to user gate.
    case SYNTHESIZE:
      return [USER_GATE];

    // After user gate: accept → end, reject → loop to adversary.
    case USER_GATE:
      return userGateRoute(state);

    default:
      return null;
  }
}

function gateRoute(state: ReflectionState): string[] | null {
  switch (evaluateGate(state)) {
    case "3/3":
    case "2/3":
      return [ADVERSARY];
    case "1/3":
      return [SYNTHESIZE];
    case "0/3":
      state.status = "aborted";
      return null;
    default:
      return null;
  }
}

function userGateRoute(state: ReflectionState): string[] | null {
  const lastResult = state.nodeResults[USER_GATE];
  if (!lastResult) return null;

  const output = lastResult.output as { accepted: boolean } | undefined;
  const accepted = output?.accepted ?? false;

  if (accepted) {
    state.acceptedDiffs = [...state.proposedDiffs];
    updateDNA(state, state.acceptedDiffs);
    state.status = "completed";
    return null;
  }

  // Rejected → loop back to adversary.
  state.cycleCount = (state.cycleCount ?? 0) + 1;
  return [ADVERSARY];
}

/**
 * Run the reflection graph against a given state.
 */
export async function runReflectionGraph(
  state: ReflectionState,
  config?: Partial<GraphConfig>,
): Promise<ReflectionState> {
  const nodes = buildNodes();

  const fullConfig: GraphConfig = {
    checkpointing: true,
    maxCycles: config?.maxCycles ?? 3,
  };

  return runGraph(nodes, state, fullConfig, route, BARRIER_NODES, [
    VALUE,
    ABILITY,
    PATTERN,
  ]);
}
