/**
 * Strategy Templates Extension
 *
 * Provides predefined action strategy templates for common coding tasks.
 * When the agent encounters a task matching a template trigger, it injects
 * a "safe path" execution sequence as a strategy hint.
 *
 * - before_agent_start: scans the user's prompt against template triggers.
 *   On match, injects a strategy hint via sendMessage.
 * - /strategy <name>: manually invoke a strategy template.
 * - /strategies: list all available templates.
 */

import type { BeforeAgentStartEvent, ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Strategy template definition
// ---------------------------------------------------------------------------

interface StrategyTemplate {
  name: string;
  description: string;
  /** Human-readable tool sequence, e.g. "grep -> read -> edit -> verify(typecheck)" */
  sequence: string;
  /** Regex tested against the user's prompt to decide if this template applies */
  trigger: RegExp;
  /** What the verification step does, e.g. "typecheck", "lint", "coverage" */
  verify: string;
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const TEMPLATES: StrategyTemplate[] = [
  {
    name: "fix-type-error",
    description: "Locate a TypeScript type error, fix it, and verify with tsc.",
    trigger: /(fix|type error|TS\d{4}|does not match|is not assignable)/i,
    sequence: "grep -> read -> edit -> verify(typecheck)",
    verify: "typecheck",
  },
  {
    name: "add-tests",
    description: "Find untested code, write tests, run them, and check coverage.",
    trigger: /(add test|write test|unit test|coverage|test.*missing)/i,
    sequence: "explore -> write-test -> run-test -> verify(coverage)",
    verify: "coverage",
  },
  {
    name: "refactor-import",
    description: "Refactor or rename imports across the codebase and verify with tsc.",
    trigger: /(refactor|rename|move|reorganize|import.*change)/i,
    sequence: "grep -> edit-all -> verify(typecheck)",
    verify: "typecheck",
  },
  {
    name: "fix-lint",
    description: "Read files with lint errors, apply fixes, and run biome check.",
    trigger: /(lint|format|biome|prettier|eslint|style)/i,
    sequence: "read -> apply-fix -> verify(lint)",
    verify: "lint",
  },
  {
    name: "add-feature",
    description: "Plan the change, isolate in a worktree, implement, and verify with tests + typecheck.",
    trigger: /(add feature|implement|build|create.*new)/i,
    sequence: "plan -> isolate -> implement -> verify(tests+typecheck)",
    verify: "tests+typecheck",
  },
  {
    name: "search-analyze",
    description: "Search the web, extract findings, and summarize.",
    trigger: /(search|research|find.*info|look.*up|what is|how to)/i,
    sequence: "web-search -> extract -> summarize",
    verify: "summary",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHint(t: StrategyTemplate): string {
  return [
    `## Strategy Template: ${t.name}`,
    "",
    `**Recommended approach:** ${t.sequence}`,
    "",
    `**Why:** ${t.description}`,
    "",
    "Follow this path but adapt as needed.",
  ].join("\n");
}

function listTemplates(): string {
  return TEMPLATES
    .map((t) => `- **${t.name}**: ${t.sequence} | ${t.description}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function strategyTemplatesExtension(pi: ExtensionAPI) {
  const usedTemplates = new Set<string>();

  // Clear template usage on session restart so templates can be used again
  pi.on("session_start", async () => {
    usedTemplates.clear();
  });

  // ---- before_agent_start: auto-match ----
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent) => {
    const prompt = event.prompt ?? "";
    if (prompt.length === 0) return;

    for (const t of TEMPLATES) {
      if (usedTemplates.has(t.name)) continue;
      if (!t.trigger.test(prompt)) continue;

      usedTemplates.add(t.name);

      pi.sendMessage(
        {
          customType: "strategy-hint",
          content: buildHint(t),
          display: false,
        },
        { deliverAs: "nextTurn" },
      );

      return; // only inject one
    }
  });

  // ---- /strategy <name> ----
  pi.registerCommand("strategy", {
    description: "Manually invoke a strategy template. Usage: /strategy <name>",
    handler: async (args, ctx) => {
      const name = args?.trim().toLowerCase() ?? "";
      if (!name) {
        ctx.ui.notify(
          `Usage: /strategy <name>\nAvailable: ${TEMPLATES.map((t) => t.name).join(", ")}`,
          "warning",
        );
        return;
      }

      const t = TEMPLATES.find((tmpl) => tmpl.name === name);
      if (!t) {
        ctx.ui.notify(
          `Unknown template "${name}". Available: ${TEMPLATES.map((tmpl) => tmpl.name).join(", ")}`,
          "error",
        );
        return;
      }

      usedTemplates.add(t.name);

      pi.sendMessage(
        {
          customType: "strategy-hint",
          content: buildHint(t),
          display: false,
        },
        { deliverAs: "nextTurn" },
      );

      ctx.ui.notify(`Strategy "${t.name}" injected: ${t.sequence}`, "info");
    },
  });

  // ---- /strategies ----
  pi.registerCommand("strategies", {
    description: "List all available strategy templates.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`**Strategy Templates**\n\n${listTemplates()}`, "info");
    },
  });
}
