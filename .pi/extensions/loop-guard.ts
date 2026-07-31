/**
 * Loop Guard Extension
 *
 * Provides turn limiting and stall detection for the agent's main loop.
 *
 * - --max-turns <N> CLI flag (default: 50)
 * - Tracks turn count and blocks after limit reached, prompting user
 * - Detects stalls: 10+ consecutive turns without file modifications
 * - /turn-limit <N> command to view or change the limit at runtime
 * - /stall-status command to see current stall count and last modified file
 */

import type { ExtensionAPI, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoopGuardState {
  turnCount: number;
  maxTurns: number;
  stallCount: number;
  lastModifiedFile: string | null;
  lastModifiedAt: number | null;
}

const CUSTOM_TYPE = "loop-guard-state";

const WRITE_TOOLS = new Set(["write", "edit"]);

const DEFAULT_MAX_TURNS = 50;
const STALL_THRESHOLD = 10;
const CONTINUE_ADD_TURNS = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFilePath(input: Record<string, unknown>): string | null {
  if (typeof input.file_path === "string" && input.file_path.length > 0) {
    return input.file_path;
  }
  return null;
}

function persist(pi: ExtensionAPI, state: LoopGuardState): void {
  pi.appendEntry<LoopGuardState>(CUSTOM_TYPE, { ...state });
}

function parseLimitArg(args: string | undefined): number | null {
  if (!args) return null;
  const trimmed = args.trim();
  const num = parseInt(trimmed, 10);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

function parseIncreaseArg(args: string | undefined): number | null {
  if (!args) return null;
  const trimmed = args.trim().toLowerCase();
  // Support "increase to N" or "increase N"
  const match = trimmed.match(/(?:increase\s+(?:to\s+)?)?(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function loopGuardExtension(pi: ExtensionAPI) {
  const state: LoopGuardState = {
    turnCount: 0,
    maxTurns: DEFAULT_MAX_TURNS,
    stallCount: 0,
    lastModifiedFile: null,
    lastModifiedAt: null,
  };

  let turnLimitReached = false;

  function resetCounters(): void {
    state.turnCount = 0;
    state.stallCount = 0;
    state.lastModifiedFile = null;
    state.lastModifiedAt = null;
    turnLimitReached = false;
  }

  // ---- CLI flag ----

  pi.registerFlag("max-turns", {
    description: "Maximum tool call turns before pausing (default: " + DEFAULT_MAX_TURNS + ")",
    type: "string",
    default: String(DEFAULT_MAX_TURNS),
  });

  function applyFlagMaxTurns(): void {
    const flagVal = pi.getFlag("max-turns");
    if (typeof flagVal === "string") {
      const num = parseInt(flagVal, 10);
      if (!isNaN(num) && num > 0) {
        state.maxTurns = num;
      }
    }
  }

  // ---- /turn-limit command ----

  pi.registerCommand("turn-limit", {
    description: "View or change the turn limit. Usage: /turn-limit [N] | continue | stop | increase <N>",
    handler: async (args, ctx) => {
      const trimmed = args?.trim().toLowerCase() ?? "";

      if (trimmed === "" || trimmed === "status") {
        ctx.ui.notify(
          "Turn limit: " + state.turnCount + "/" + state.maxTurns +
          (turnLimitReached ? " (limit reached, awaiting user action)" : ""),
          "info",
        );
        return;
      }

      if (trimmed === "continue") {
        if (!turnLimitReached) {
          ctx.ui.notify("No turn limit is currently active.", "info");
          return;
        }
        state.turnCount = 0;
        state.maxTurns = state.maxTurns + CONTINUE_ADD_TURNS;
        turnLimitReached = false;
        persist(pi, state);
        ctx.ui.notify(
          "Turn limit extended by " + CONTINUE_ADD_TURNS + ". New limit: " + state.maxTurns + " turns.",
          "info",
        );
        return;
      }

      if (trimmed === "stop") {
        if (!turnLimitReached) {
          ctx.ui.notify("No turn limit is currently active.", "info");
          return;
        }
        ctx.ui.notify("Stopping agent by user request after turn limit.", "warning");
        ctx.shutdown();
        return;
      }

      const increaseNum = parseIncreaseArg(args);
      if (increaseNum !== null) {
        if (!turnLimitReached) {
          // Allow changing limit even when limit not reached
          state.maxTurns = increaseNum;
          persist(pi, state);
          ctx.ui.notify("Turn limit set to " + increaseNum + ".", "info");
          return;
        }
        state.turnCount = 0;
        state.maxTurns = increaseNum;
        turnLimitReached = false;
        persist(pi, state);
        ctx.ui.notify("Turn limit increased to " + increaseNum + ". Counter reset.", "info");
        return;
      }

      const num = parseLimitArg(args);
      if (num !== null) {
        state.maxTurns = num;
        if (state.turnCount >= state.maxTurns) {
          turnLimitReached = true;
        }
        persist(pi, state);
        ctx.ui.notify("Turn limit set to " + num + ".", "info");
        return;
      }

      ctx.ui.notify(
        "Invalid argument. Usage: /turn-limit [N] | continue | stop | increase <N>",
        "error",
      );
    },
  });

  // ---- /stall-status command ----

  pi.registerCommand("stall-status", {
    description: "Show current stall count and last modified file",
    handler: async (_args, ctx) => {
      const lines: string[] = [];
      lines.push("Stall count: " + state.stallCount + " / " + STALL_THRESHOLD + " (threshold)");
      lines.push("Turn count: " + state.turnCount + " / " + state.maxTurns);
      if (state.lastModifiedFile) {
        const ago = state.lastModifiedAt
          ? Math.round((Date.now() - state.lastModifiedAt) / 1000) + "s ago"
          : "unknown time";
        lines.push("Last modified file: " + state.lastModifiedFile + " (" + ago + ")");
      } else {
        lines.push("Last modified file: none");
      }
      if (turnLimitReached) {
        lines.push("Turn limit reached. Use /turn-limit continue | stop | increase <N>");
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ---- session_start ----

  pi.on("session_start", async (_event, ctx) => {
    applyFlagMaxTurns();
    resetCounters();

    // Restore persisted state (maxTurns may have been changed via command)
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as { type: string; customType?: string; data?: LoopGuardState };
      if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
        if (entry.data) {
          if (typeof entry.data.maxTurns === "number" && entry.data.maxTurns > 0) {
            state.maxTurns = entry.data.maxTurns;
          }
        }
        break;
      }
    }

    // CLI flag overrides persisted state
    applyFlagMaxTurns();
  });

  // ---- session_tree ----

  pi.on("session_tree", async () => {
    resetCounters();
  });

  // ---- tool_call (fires before tool execution) ----

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    // If turn limit was reached and user hasn't responded, don't count turns
    if (turnLimitReached) {
      return undefined;
    }

    // Increment turn counter
    state.turnCount++;

    // Check turn limit
    if (state.turnCount >= state.maxTurns) {
      turnLimitReached = true;
      persist(pi, state);

      const message =
        "Turn limit reached (" + state.turnCount + "/" + state.maxTurns + "). " +
        "Pause and confirm next steps.";

      pi.sendMessage(
        {
          customType: "turn-limit",
          content: message,
          display: true,
        },
        { deliverAs: "steer" },
      );

      ctx.ui.notify(
        message + "\n" +
        "Respond with /turn-limit continue | stop | increase <N>",
        "warning",
      );

      return undefined;
    }

    // Increment stall counter
    state.stallCount++;

    // Check stall
    if (state.stallCount >= STALL_THRESHOLD) {
      const stallMessage =
        "Stall detected: " + state.stallCount +
        " consecutive turns with no file changes. Are you stuck?";

      pi.sendMessage(
        {
          customType: "stall-warning",
          content: stallMessage,
          display: true,
        },
        { deliverAs: "steer" },
      );

      // Reset stall count after warning so we don't spam
      state.stallCount = 0;
    }

    persist(pi, state);
    return undefined;
  });

  // ---- tool_result (fires after tool execution) ----

  pi.on("tool_result", async (event: ToolResultEvent) => {
    const toolName = event.toolName;

    // Only count write/edit tools as progress
    if (!WRITE_TOOLS.has(toolName)) {
      return undefined;
    }

    // Only count successful operations
    if (event.isError) {
      return undefined;
    }

    // Reset stall counter on successful file modification
    state.stallCount = 0;

    const filePath = getFilePath(event.input);
    if (filePath) {
      state.lastModifiedFile = filePath;
      state.lastModifiedAt = Date.now();
    }

    persist(pi, state);
    return undefined;
  });
}
