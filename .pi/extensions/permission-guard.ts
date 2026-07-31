import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { minimatch } from "minimatch";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Types
interface PermissionRule {
  action: "allow" | "deny";
  tool?: string;
  command?: string;
  path?: string;
  pattern?: string;
}

interface JudgeConfig {
  provider?: string;
  model?: string;
  contextTokens?: number;
  prompt?: string;
}

interface PermissionConfig {
  mode?: "auto" | "default";
  judge?: JudgeConfig;
  fallback?: "deny_writes" | "deny" | "allow";
  rules?: PermissionRule[];
}

const TOOL_MATCH_FIELDS: Record<string, string | null> = {
  bash: "command",
  read: "path",
  write: "path",
  edit: "path",
  ls: "path",
  grep: "pattern",
  find: "pattern",
};

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["bash", "write", "edit"]);
const ALWAYS_SAFE_TOOLS = new Set(["questionnaire"]);

const DEFAULT_JUDGE_PROMPT = "You are a security judge...";

function getGlobalConfigPath(): string {
  return join(homedir(), ".pi", "agent", "permissions.json");
}

function getProjectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "permissions.json");
}

function loadJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadConfig(cwd: string): PermissionConfig {
  const global = loadJsonFile<PermissionConfig>(getGlobalConfigPath());
  const project = loadJsonFile<PermissionConfig>(getProjectConfigPath(cwd));
  return {
    mode: project?.mode ?? global?.mode,
    judge: { ...global?.judge, ...project?.judge },
    fallback: project?.fallback ?? global?.fallback,
    rules: project?.rules ?? global?.rules,
  };
}

export default function permissionGuardExtension(pi: ExtensionAPI) {
  let config: PermissionConfig = {};
  let autoMode = false;
  const judgeCache = new Map<string, { action: string; reason: string }>();
  let cwd = "";

  function reloadConfig(ctxCwd?: string) {
    cwd = ctxCwd ?? process.cwd();
    config = loadConfig(cwd);
    if (config.mode === "auto" || pi.getFlag("auto") === true) {
      autoMode = true;
    }
  }

  function persistModeState() {
    pi.appendEntry<{ autoMode: boolean }>("permission-mode", { autoMode });
  }

  pi.registerFlag("auto", {
    description: "Enable auto permission mode (LLM judge for unmatched operations)",
    type: "boolean",
    default: false,
  });

  pi.registerCommand("permission-mode", {
    description: "Toggle permission mode (auto / default). Usage: /permission-mode auto|default",
    handler: async (args, ctx) => {
      const target = args?.trim().toLowerCase();
      if (target === "auto") {
        autoMode = true;
        persistModeState();
        ctx.ui.notify("Permission mode: auto (LLM judge)", "info");
      } else if (target === "default" || target === "off") {
        autoMode = false;
        persistModeState();
        ctx.ui.notify("Permission mode: default (no interception)", "info");
      } else {
        const current = autoMode ? "auto" : "default";
        ctx.ui.notify("Permission mode: " + current + ". Usage: /permission-mode auto|default", "info");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    reloadConfig(ctx.cwd);
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as { type: string; customType?: string; data?: { autoMode?: boolean } };
      if (entry.type === "custom" && entry.customType === "permission-mode") {
        if (entry.data?.autoMode !== undefined) {
          autoMode = entry.data.autoMode;
        }
        break;
      }
    }
    if (pi.getFlag("auto") === true) {
      autoMode = true;
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    const branchEntries = ctx.sessionManager.getBranch();
    for (let i = branchEntries.length - 1; i >= 0; i--) {
      const entry = branchEntries[i] as { type: string; customType?: string; data?: { autoMode?: boolean } };
      if (entry.type === "custom" && entry.customType === "permission-mode") {
        if (entry.data?.autoMode !== undefined) {
          autoMode = entry.data.autoMode;
        }
        break;
      }
    }
    judgeCache.clear();
  });

  /**
   * Match a shell command against a glob pattern.
   *
   * Unlike minimatch (which treats * as a path-segment wildcard that cannot
   * cross /), this uses a simple regex conversion where * matches any characters
   * including spaces and slashes. Trailing whitespace before * is stripped so
   * that patterns like "rm -r *" also match "rm -rf /tmp/x" (combined flags).
   */
  function matchCommand(command: string, pattern: string): boolean {
    if (!pattern.includes("*")) {
      return command === pattern || command.startsWith(pattern + " ") || command.includes(" " + pattern);
    }
    const escaped = pattern
      .replace(/\s+\*/g, "*")   // strip whitespace before * (makes "rm -r *" match "rm -rf /x")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexStr = escaped.replace(/\*/g, ".*");
    try {
      return new RegExp("^" + regexStr + "$").test(command);
    } catch {
      return false;
    }
  }

  function ruleApplies(rule: PermissionRule, toolName: string, input: Record<string, unknown>): boolean {
    if (rule.tool !== undefined && rule.tool !== toolName) {
      if (!minimatch(toolName, rule.tool)) return false;
    }
    if (!rule.command && !rule.path && !rule.pattern) return true;

    const field = TOOL_MATCH_FIELDS[toolName];
    const paramValue = field ? (typeof input[field] === "string" ? input[field] as string : null) : null;

    if (rule.command !== undefined) {
      if (toolName !== "bash") return false;
      if (paramValue === null || !matchCommand(paramValue, rule.command)) return false;
    }
    if (rule.path !== undefined) {
      if (!["read", "write", "edit", "ls"].includes(toolName)) return false;
      if (paramValue === null) return false;
      if (!minimatch(paramValue, rule.path) && !minimatch(paramValue, "**/" + rule.path)) return false;
    }
    if (rule.pattern !== undefined) {
      if (!["grep", "find"].includes(toolName)) return false;
      if (paramValue === null || !minimatch(paramValue, rule.pattern)) return false;
    }
    return true;
  }

  function fallbackDecision(toolName: string): { block: boolean; reason: string } {
    const fallback = config.fallback ?? "deny_writes";
    if (fallback === "allow") return { block: false, reason: "" };
    if (fallback === "deny") return { block: true, reason: "Permission judge unavailable" };
    if (ALWAYS_SAFE_TOOLS.has(toolName)) return { block: false, reason: "" };
    if (READ_TOOLS.has(toolName)) return { block: false, reason: "" };
    if (WRITE_TOOLS.has(toolName))
      return { block: true, reason: "Permission judge unavailable, write operation denied" };
    return { block: true, reason: "Permission judge unavailable, unknown tool denied" };
  }

  function cacheKey(toolName: string, input: Record<string, unknown>): string {
    const field = TOOL_MATCH_FIELDS[toolName];
    if (field && typeof input[field] === "string") return toolName + ":" + input[field];
    return toolName + ":" + JSON.stringify(input);
  }

  function getRecentContext(
    entries: Array<{ type: string; message?: AgentMessage }>,
    maxTokens: number,
  ): string {
    const messages = entries
      .filter((e): e is { type: string; message: AgentMessage } => e.type === "message" && e.message !== undefined)
      .reverse();

    const parts: string[] = [];
    let estimatedTokens = 0;

    for (const entry of messages) {
      const msg = entry.message;
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("\n");
      } else {
        continue;
      }
      const tokenEstimate = Math.ceil(text.length / 4);
      if (estimatedTokens + tokenEstimate > maxTokens) break;

      const prefix = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : msg.role;
      parts.unshift("[" + prefix + "]: " + text.slice(0, 2000));
      estimatedTokens += tokenEstimate;
    }

    return parts.join("\n\n");
  }

  async function callJudge(
    modelProvider: string,
    modelId: string,
    apiKey: string,
    baseUrl: string,
    modelApi: string,
    systemPrompt: string,
    toolName: string,
    input: Record<string, unknown>,
    context: string,
  ): Promise<{ action: string; reason: string }> {
    const userMessage = "## Recent Conversation Context\n" + (context || "(no prior context)") +
      "\n\n## Proposed Tool Call\n**Tool:** " + toolName +
      "\n**Arguments:** " + JSON.stringify(input, null, 2) +
      "\n\nDecide: ALLOW or DENY?";

    const isAnthropic = modelApi === "anthropic-messages" || baseUrl.includes("anthropic.com");
    const isResponsesApi = modelApi === "openai-responses" || modelApi === "openai-codex-responses";

    if (isAnthropic) {
      // Anthropic Messages API: POST {base}/v1/messages
      const base = baseUrl.replace(/\/+$/, "");
      const url = base.endsWith("/v1/messages") ? base : base + "/v1/messages";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 128,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        throw new Error("Anthropic API error: " + response.status);
      }

      const json = (await response.json()) as { content: Array<{ type: string; text: string }> };
      const text = json.content?.find((c) => c.type === "text")?.text ?? "";
      return parseJudgeResponse(text);
    }

    if (isResponsesApi) {
      // OpenAI Responses API: POST {base}/responses
      const base = baseUrl.replace(/\/+$/, "");
      const url = base.endsWith("/responses") ? base : base + "/responses";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: modelId,
          input: userMessage,
          instructions: systemPrompt,
          max_output_tokens: 128,
        }),
      });

      if (!response.ok) {
        throw new Error("Responses API error: " + response.status);
      }

      const json = (await response.json()) as { output: Array<{ type: string; content: Array<{ type: string; text: string }> }> };
      const text = json.output
        ?.filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join("\n") ?? "";
      return parseJudgeResponse(text);
    }

    // OpenAI Chat Completions API (fallback): POST {base}/chat/completions
    const base = baseUrl.replace(/\/+$/, "");
    const url = base.endsWith("/chat/completions") ? base : base + "/chat/completions";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 128,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error("Chat Completions API error: " + response.status);
    }

    const json = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    return parseJudgeResponse(text);
  }

  function parseJudgeResponse(text: string): { action: string; reason: string } {
    const jsonMatch = text.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { action: string; reason?: string };
        if (parsed.action === "allow" || parsed.action === "deny") {
          return {
            action: parsed.action,
            reason: parsed.reason ?? (parsed.action === "allow" ? "Allowed by judge" : "Denied by judge"),
          };
        }
      } catch {
        // fall through
      }
    }
    const lowerText = text.toLowerCase();
    if (lowerText.includes("deny") || lowerText.includes("block")) {
      return { action: "deny", reason: "Judge response indicates denial" };
    }
    if (lowerText.includes("allow") || lowerText.includes("permit")) {
      return { action: "allow", reason: "Judge response indicates allowance" };
    }
    return { action: "deny", reason: "Unparseable judge response" };
  }

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    if (!autoMode && (!config.rules || config.rules.length === 0)) {
      return undefined;
    }

    const toolName = event.toolName;
    const input = event.input as Record<string, unknown>;

    // 1. Check rules (first-match-wins)
    if (config.rules && config.rules.length > 0) {
      for (const rule of config.rules) {
        if (ruleApplies(rule, toolName, input)) {
          if (rule.action === "allow") return undefined;
          return { block: true, reason: "Blocked by rule: " + rule.action + " " + toolName };
        }
      }
    }

    if (!autoMode) return undefined;

    // 2. Check cache
    const key = cacheKey(toolName, input);
    const cached = judgeCache.get(key);
    if (cached) {
      if (cached.action === "allow") return undefined;
      return { block: true, reason: "Denied by judge (cached): " + cached.reason };
    }

    // 3. Call judge LLM
    try {
      // Default to anthropic/haiku via the proxy's Anthropic Messages API,
      // which is the most reliable path. Overridable in permissions.json.
      const judgeModel = config.judge?.model ?? "claude-haiku-4-5";
      const judgeProvider = config.judge?.provider ?? "anthropic";
      const contextTokens = config.judge?.contextTokens ?? 2000;
      const judgePrompt = config.judge?.prompt ?? DEFAULT_JUDGE_PROMPT;

      const model = ctx.modelRegistry.find(judgeProvider, judgeModel);
      if (!model) {
        throw new Error("Judge model not found: " + judgeProvider + "/" + judgeModel);
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) {
        throw new Error("No API key for judge model: " + (auth.ok ? "key not found" : auth.error));
      }

      const entries = ctx.sessionManager.getEntries();
      const context = getRecentContext(entries, contextTokens);

      const result = await callJudge(
        judgeProvider, judgeModel, auth.apiKey,
        model.baseUrl, model.api, judgePrompt,
        toolName, input, context,
      );

      judgeCache.set(key, result);

      if (result.action === "allow") return undefined;
      return { block: true, reason: "Denied by judge: " + result.reason };
    } catch (err) {
      const fallback = fallbackDecision(toolName);
      if (fallback.block) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return { block: true, reason: fallback.reason + " (judge error: " + errMsg.slice(0, 80) + ")" };
      }
      return undefined;
    }
  });
}
