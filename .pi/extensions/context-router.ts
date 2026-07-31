/**
 * Context Router Extension
 *
 * Rule-based context routing that injects relevant skill/context reminders
 * based on keyword/pattern matching against the user's prompt. Tracks which
 * routes have been injected to avoid repeating the same context within a
 * session. On session_start, also reads state/session-summary.txt as initial
 * context if available.
 */

import type { ExtensionAPI, BeforeAgentStartEvent } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Routing table: pattern -> context snippet (1-2 lines, brief reminders)
// ---------------------------------------------------------------------------

const ROUTES: Array<{ pattern: RegExp; context: string }> = [
  {
    pattern: /\b(commit|提交|push)\b/i,
    context: "Use the smart-commit skill for git operations. See .pi/skills/smart-commit/SKILL.md for the full workflow.",
  },
  {
    pattern: /\b(permission|权限|allow|deny|rule)\b/i,
    context: "Use the pi-permission-config skill. Permission config is at .pi/permissions.json. Current shell functions: grep→rg, find→fd, ls→eza, cat→bat.",
  },
  {
    pattern: /\b(goal|task|todo|计划|目标)\b/i,
    context: "Use the goal skill. Current goal state is in state/goal.json.",
  },
  {
    pattern: /\b(reflect|复盘|insight|pattern)\b/i,
    context: "Use the reflect skill for conversation analysis. Historical reflections are in state/reflections.jsonl.",
  },
  {
    pattern: /\b(debug|trace|cost|性能|延迟)\b/i,
    context: "Debug mode available: --debug flag or /debug toggle. Tracing data in state/traces.jsonl. Cost summary: /cost command.",
  },
  {
    pattern: /\b(feishu|lark|飞书|消息)\b/i,
    context: "Feishu bridge is configured. Use /feishu status to check connection. Bridge routes are in ~/.pi/agent/feishu/bridge.json.",
  },
];

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function contextRouterExtension(pi: ExtensionAPI) {
  const injectedRoutes = new Set<string>();
  let summaryInjected = false;

  /**
   * On session_start: read state/session-summary.txt if it exists and inject
   * it as initial context so the agent picks up context from a previous
   * session.
   */
  pi.on("session_start", async (_event, ctx) => {
    injectedRoutes.clear();
    summaryInjected = false;

    const summaryPath = join(ctx.cwd ?? process.cwd(), "state", "session-summary.txt");
    if (existsSync(summaryPath)) {
      try {
        const summary = readFileSync(summaryPath, "utf-8").trim();
        if (summary.length > 0) {
          summaryInjected = true;
          ctx.sessionManager.addSystemMessage(
            "[session-summary] " + summary.slice(0, 2000),
          );
        }
      } catch {
        // never block session start on a file read error
      }
    }
  });

  /**
   * Before each agent turn: scan the user's prompt against the routing table
   * and inject matching context snippets that haven't been shown yet this
   * session.
   */
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    const prompt = event.prompt ?? "";
    if (prompt.length === 0) return;

    const matched: string[] = [];

    for (const route of ROUTES) {
      const key = route.pattern.source;
      if (injectedRoutes.has(key)) continue;
      if (route.pattern.test(prompt)) {
        matched.push(route.context);
        injectedRoutes.add(key);
      }
    }

    if (matched.length === 0) return;

    return {
      messages: matched.map((context) => ({
        role: "system" as const,
        content: context,
        metadata: { customType: "context-route" },
      })),
    };
  });
}
