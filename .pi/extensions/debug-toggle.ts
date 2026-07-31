/**
 * Debug Toggle Extension
 *
 * --debug CLI flag and /debug slash command to toggle verbose intermediate output.
 * Default: off. State persists to session and restores on resume/tree navigation.
 * On toggle, emits "debug-changed" via pi.events so other extensions can react.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function debugToggleExtension(pi: ExtensionAPI) {
  let debugEnabled = false;

  function persistState() {
    pi.appendEntry<{ debugEnabled: boolean }>("debug-mode", { debugEnabled });
    pi.events.emit("debug-changed", { debugEnabled });
  }

  pi.registerFlag("debug", {
    description: "Enable debug mode (show intermediate output)",
    type: "boolean",
    default: false,
  });

  pi.registerCommand("debug", {
    description: "Toggle debug mode. Usage: /debug on|off",
    handler: async (args, ctx) => {
      const target = args?.trim().toLowerCase();
      if (target === "on" || target === "1" || target === "true") {
        debugEnabled = true;
        persistState();
        ctx.ui.notify("Debug mode: ON", "info");
      } else if (target === "off" || target === "0" || target === "false") {
        debugEnabled = false;
        persistState();
        ctx.ui.notify("Debug mode: OFF", "info");
      } else {
        debugEnabled = !debugEnabled;
        persistState();
        ctx.ui.notify("Debug mode: " + (debugEnabled ? "ON" : "OFF"), "info");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    // Restore from session entries (survives resume)
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as { type: string; customType?: string; data?: { debugEnabled?: boolean } };
      if (entry.type === "custom" && entry.customType === "debug-mode") {
        if (entry.data?.debugEnabled !== undefined) {
          debugEnabled = entry.data.debugEnabled;
        }
        break;
      }
    }
    // CLI flag overrides session state
    if (pi.getFlag("debug") === true) {
      debugEnabled = true;
      persistState();
    }
    // Emit current state so late-registering listeners get initial value
    pi.events.emit("debug-changed", { debugEnabled });
  });

  pi.on("session_tree", async (_event, ctx) => {
    const branchEntries = ctx.sessionManager.getBranch();
    for (let i = branchEntries.length - 1; i >= 0; i--) {
      const entry = branchEntries[i] as { type: string; customType?: string; data?: { debugEnabled?: boolean } };
      if (entry.type === "custom" && entry.customType === "debug-mode") {
        if (entry.data?.debugEnabled !== undefined) {
          debugEnabled = entry.data.debugEnabled;
        }
        break;
      }
    }
  });
}
