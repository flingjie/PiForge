import type { RegisteredTool } from "../tools/types.js";
import type { ReflectionState, LensOutput, AdversaryOutput, ProposedDiff } from "./state.js";

/**
 * Reflection-specific tools for reading and writing the persistent state
 * files (user_dna.json, reflections.jsonl, records.jsonl).
 *
 * Each tool is a RegisteredTool with a narrow scope:
 * - readState: lens nodes + adversary (read-only access to all state)
 * - writeReflection: synthesize node only
 * - updateDNA: synthesize node only
 * - getTranscript: all nodes
 */

/**
 * Read the current reflection state. Available to lens nodes and adversary.
 * In production this reads from the filesystem; here it operates on the
 * in-memory ReflectionState.
 */
export const readStateTool: RegisteredTool = {
  name: "readState",
  description:
    "Read the current reflection state including user DNA, previous reflections, " +
    "daily records, and current lens outputs. Returns a JSON snapshot. " +
    "Use this to understand the user's values, abilities, and patterns before analysis.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: (_args: Record<string, never>, state?: ReflectionState): Partial<ReflectionState> => {
    if (!state) throw new Error("readState: no state provided");
    return {
      userDNA: state.userDNA,
      reflections: state.reflections,
      records: state.records,
      transcript: state.transcript,
      lensOutputs: state.lensOutputs,
    };
  },
};

/**
 * Append a reflection event to the reflections log.
 * Available ONLY to the synthesize node.
 */
export const writeReflectionTool: RegisteredTool = {
  name: "writeReflection",
  description:
    "Append a reflection event to the reflections log. The event records " +
    "lens outputs, adversary verdict, and proposed diffs for this reflection run.",
  parameters: {
    type: "object",
    properties: {
      lensOutputs: { type: "object", description: "Outputs from the three lens agents." },
      adversaryOutput: { type: "object", description: "Verdict from the adversary agent." },
      proposedDiffs: { type: "array", description: "Proposed changes to user DNA." },
      acceptedDiffs: { type: "array", description: "User-accepted diffs." },
    },
    required: ["lensOutputs"],
  },
  execute: (args: Record<string, unknown>, state?: ReflectionState): { written: boolean } => {
    if (!state) throw new Error("writeReflection: no state provided");
    const event = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      protocol_version: 1,
      timestamp: new Date().toISOString(),
      lens_outputs: args.lensOutputs,
      adversary_verdict: args.adversaryOutput,
      proposed_diffs: args.proposedDiffs,
      accepted_diffs: args.acceptedDiffs,
      status: "complete",
    };
    state.reflections.push(event as unknown as Record<string, unknown>);
    return { written: true };
  },
};

/**
 * Merge diffs into the user DNA model.
 * Available ONLY to the synthesize node.
 */
export const updateDNATool: RegisteredTool = {
  name: "updateDNA",
  description:
    "Update the user DNA model by applying accepted diffs. " +
    "Diffs can add, modify, or remove values, beliefs, criteria, or preferences.",
  parameters: {
    type: "object",
    properties: {
      diffs: {
        type: "array",
        description: "List of accepted diffs to apply.",
        items: {
          type: "object",
          properties: {
            section: { type: "string", enum: ["values", "beliefs", "criteria", "preferences"] },
            action: { type: "string", enum: ["add", "modify", "remove"] },
            target: { type: "string" },
            value: {},
            rationale: { type: "string" },
          },
          required: ["section", "action", "target"],
        },
      },
    },
    required: ["diffs"],
  },
  execute: (args: Record<string, unknown>, state?: ReflectionState): { applied: number } => {
    if (!state) throw new Error("updateDNA: no state provided");
    const diffs = (args.diffs as ProposedDiff[]) ?? [];
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
    return { applied };
  },
};

/**
 * Read the conversation transcript.
 * Available to all nodes.
 */
export const getTranscriptTool: RegisteredTool = {
  name: "getTranscript",
  description:
    "Get the current conversation transcript being reflected upon. " +
    "Returns the full text of the conversation.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: (_args: Record<string, never>, state?: ReflectionState): { transcript: string } => {
    if (!state) throw new Error("getTranscript: no state provided");
    return { transcript: state.transcript };
  },
};

/** All reflection tools keyed by name. */
export const reflectionTools: Record<string, RegisteredTool> = {
  readState: readStateTool,
  writeReflection: writeReflectionTool,
  updateDNA: updateDNATool,
  getTranscript: getTranscriptTool,
};
