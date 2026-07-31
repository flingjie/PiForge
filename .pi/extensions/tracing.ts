/**
 * Tracing Extension — structured tool tracing and cost tracking for Pi.
 *
 * Hooks into tool_call, tool_result, tool_execution_start, and tool_execution_end
 * events to produce a JSON-line trace log at .pi/state/traces.jsonl.
 *
 * Registers two slash commands:
 * - /cost — cost summary with per-tool and per-session tables
 * - /trace — last 20 trace entries in compact format
 */

import type { ExtensionAPI, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraceEntry {
  toolCallId: string;
  toolName: string;
  argsSnippet: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: "success" | "error" | "running";
  tokenDelta: number | null;
  sessionFile: string;
}

interface SessionAggregate {
  sessionFile: string;
  tools: Map<string, { calls: number; totalDurationMs: number; errors: number }>;
  totalCalls: number;
  totalErrors: number;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Cost estimation helpers
// ---------------------------------------------------------------------------

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPerM: number,
  outputPerM: number,
): { input: number; output: number; total: number } {
  const inputCost = (inputTokens / 1_000_000) * inputPerM;
  const outputCost = (outputTokens / 1_000_000) * outputPerM;
  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
}

// ---------------------------------------------------------------------------
// Trace file I/O (all wrapped in try-catch to never affect the agent)
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    // silently ignore
  }
}

function getStateDir(cwd: string): string {
  return join(cwd, ".pi", "state");
}

function getTracePath(cwd: string): string {
  return join(getStateDir(cwd), "traces.jsonl");
}

function writeTraceLine(cwd: string, entry: TraceEntry): void {
  try {
    const dir = getStateDir(cwd);
    ensureDir(dir);
    appendFileSync(getTracePath(cwd), JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // silently ignore — tracing failures never affect the agent
  }
}

function readTraces(cwd: string): TraceEntry[] {
  try {
    const path = getTracePath(cwd);
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as TraceEntry);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return ms.toFixed(0) + "ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + "s";
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return mins + "m" + secs + "s";
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function buildTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const divider =
    "|" + colWidths.map((w) => "-".repeat(w + 2)).join("|") + "|";
  const headerRow =
    "| " +
    headers.map((h, i) => padRight(h, colWidths[i])).join(" | ") +
    " |";

  const bodyRows = rows.map(
    (row) =>
      "| " +
      row.map((cell, i) => padRight(cell, colWidths[i])).join(" | ") +
      " |",
  );

  return [headerRow, divider, ...bodyRows].join("\n");
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateByTool(
  traces: TraceEntry[],
): Map<string, { calls: number; totalDurationMs: number; errors: number }> {
  const map = new Map<
    string,
    { calls: number; totalDurationMs: number; errors: number }
  >();
  for (const t of traces) {
    const existing = map.get(t.toolName) ?? {
      calls: 0,
      totalDurationMs: 0,
      errors: 0,
    };
    existing.calls++;
    if (t.durationMs !== null) existing.totalDurationMs += t.durationMs;
    if (t.status === "error") existing.errors++;
    map.set(t.toolName, existing);
  }
  return map;
}

function aggregateBySession(traces: TraceEntry[]): SessionAggregate[] {
  const map = new Map<string, SessionAggregate>();
  for (const t of traces) {
    let agg = map.get(t.sessionFile);
    if (!agg) {
      agg = {
        sessionFile: t.sessionFile,
        tools: new Map(),
        totalCalls: 0,
        totalErrors: 0,
        totalDurationMs: 0,
      };
      map.set(t.sessionFile, agg);
    }
    agg.totalCalls++;
    if (t.durationMs !== null) agg.totalDurationMs += t.durationMs;
    if (t.status === "error") agg.totalErrors++;

    const toolAgg = agg.tools.get(t.toolName) ?? {
      calls: 0,
      totalDurationMs: 0,
      errors: 0,
    };
    toolAgg.calls++;
    if (t.durationMs !== null) toolAgg.totalDurationMs += t.durationMs;
    if (t.status === "error") toolAgg.errors++;
    agg.tools.set(t.toolName, toolAgg);
  }
  return [...map.values()].sort(
    (a, b) => b.totalCalls - a.totalCalls,
  );
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function tracingExtension(pi: ExtensionAPI) {
  // Track pending tool calls by toolCallId for duration calculation
  const pending = new Map<
    string,
    { toolName: string; argsSnippet: string; startTime: string; startEpoch: number }
  >();

  // Track token usage per tool call (token_delta)
  const tokenDeltas = new Map<string, number>();

  let cwd = "";

  // ---- Event hooks ----

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    try {
      cwd = ctx.cwd;
      const toolName = event.toolName;
      const argsStr = JSON.stringify(event.input);
      const argsSnippet = argsStr.length > 200 ? argsStr.slice(0, 200) + "..." : argsStr;
      const now = new Date().toISOString();

      pending.set(event.toolCallId, {
        toolName,
        argsSnippet,
        startTime: now,
        startEpoch: Date.now(),
      });

      // Capture token usage at call time (if available)
      const usage = ctx.getContextUsage();
      if (usage?.tokens !== null && usage.tokens !== undefined) {
        tokenDeltas.set(event.toolCallId, usage.tokens);
      }
    } catch {
      // silently ignore
    }
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    try {
      cwd = ctx.cwd;
      const p = pending.get(event.toolCallId);
      if (p) {
        p.startEpoch = Date.now();
        p.startTime = new Date().toISOString();
      }
    } catch {
      // silently ignore
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    try {
      cwd = ctx.cwd;
      const p = pending.get(event.toolCallId);
      const endEpoch = Date.now();
      const endTime = new Date().toISOString();

      // Only write trace for calls that were observed via tool_call
      if (!p) return;

      // Calculate duration
      const durationMs = endEpoch - p.startEpoch;

      // Calculate token delta
      let tokenDelta: number | null = null;
      const callTokens = tokenDeltas.get(event.toolCallId);
      const currentUsage = ctx.getContextUsage();
      if (
        callTokens !== undefined &&
        currentUsage?.tokens !== null &&
        currentUsage?.tokens !== undefined
      ) {
        tokenDelta = currentUsage.tokens - callTokens;
      }

      const entry: TraceEntry = {
        toolCallId: event.toolCallId,
        toolName: p.toolName,
        argsSnippet: p.argsSnippet,
        startTime: p.startTime,
        endTime,
        durationMs,
        status: event.isError ? "error" : "success",
        tokenDelta,
        sessionFile: ctx.sessionManager.getSessionFile() ?? "unknown",
      };

      writeTraceLine(cwd, entry);

      // Cleanup
      pending.delete(event.toolCallId);
      tokenDeltas.delete(event.toolCallId);
    } catch {
      // silently ignore
    }
  });

  pi.on("tool_result", async (_event: ToolResultEvent, ctx) => {
    try {
      cwd = ctx.cwd;
      // Fallback: write trace if tool_execution_end did not already handle it
      const p = pending.get(_event.toolCallId);
      if (!p) return;

      const endEpoch = Date.now();
      const endTime = new Date().toISOString();
      const durationMs = endEpoch - p.startEpoch;

      let tokenDelta: number | null = null;
      const callTokens = tokenDeltas.get(_event.toolCallId);
      const currentUsage = ctx.getContextUsage();
      if (
        callTokens !== undefined &&
        currentUsage?.tokens !== null &&
        currentUsage?.tokens !== undefined
      ) {
        tokenDelta = currentUsage.tokens - callTokens;
      }

      const entry: TraceEntry = {
        toolCallId: _event.toolCallId,
        toolName: p.toolName,
        argsSnippet: p.argsSnippet,
        startTime: p.startTime,
        endTime,
        durationMs,
        status: _event.isError ? "error" : "success",
        tokenDelta,
        sessionFile: ctx.sessionManager.getSessionFile() ?? "unknown",
      };

      writeTraceLine(cwd, entry);

      pending.delete(_event.toolCallId);
      tokenDeltas.delete(_event.toolCallId);
    } catch {
      // silently ignore
    }
  });

  // Mark any pending tools that never completed when session ends
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      cwd = ctx.cwd;
      for (const [id, p] of pending) {
        const entry: TraceEntry = {
          toolCallId: id,
          toolName: p.toolName,
          argsSnippet: p.argsSnippet,
          startTime: p.startTime,
          endTime: null,
          durationMs: null,
          status: "running",
          tokenDelta: null,
          sessionFile: ctx.sessionManager.getSessionFile() ?? "unknown",
        };
        writeTraceLine(cwd, entry);
      }
      pending.clear();
      tokenDeltas.clear();
    } catch {
      // silently ignore
    }
  });

  // ---- /cost command ----

  pi.registerCommand("cost", {
    description:
      "Show cost summary: per-tool stats and per-session aggregates from traces",
    handler: async (_args, ctx) => {
      const traces = readTraces(ctx.cwd);
      if (traces.length === 0) {
        ctx.ui.notify("No trace data yet. Run some tool calls first.", "info");
        return;
      }

      const currentSession = ctx.sessionManager.getSessionFile() ?? "unknown";

      // Current session only
      const currentTraces = traces.filter(
        (t) => t.sessionFile === currentSession,
      );

      // Use actual model cost (from registry), fall back to zero
      const modelCost = (ctx.model as { cost?: { input: number; output: number } } | undefined)?.cost;
      const inputPerM = modelCost?.input ?? 0;
      const outputPerM = modelCost?.output ?? 0;
      const modelName = (ctx.model as { name?: string } | undefined)?.name ?? (ctx.model as { id?: string } | undefined)?.id ?? "unknown";

      const toolAgg = aggregateByTool(
        currentTraces.length > 0 ? currentTraces : traces,
      );
      const sorted = [...toolAgg.entries()].sort(
        (a, b) => b[1].calls - a[1].calls,
      );

      const headers = ["Tool", "Calls", "Avg Duration", "Errors"];
      const rows: string[][] = sorted.map(([name, agg]) => [
        name,
        String(agg.calls),
        agg.calls > 0
          ? formatDuration(agg.totalDurationMs / agg.calls)
          : "-",
        String(agg.errors),
      ]);

      let output = "## Cost Summary (this session)\n\n";
      output += buildTable(headers, rows);

      // Token/cost estimate for current session
      const usage = ctx.getContextUsage();
      if (usage && usage.tokens !== null) {
        const estimatedOutput = Math.round(usage.tokens * 0.15);
        const cost = estimateCost(usage.tokens, estimatedOutput, inputPerM, outputPerM);
        output += "\n\n**Model:** " + modelName;
        output += "\n**Context:** " + usage.tokens.toLocaleString() +
          " tokens / " + usage.contextWindow.toLocaleString() +
          " (" + (usage.percent ?? 0).toFixed(0) + "%)";
        output +=
          "\n**Est. cost:** $" +
          cost.total.toFixed(4) +
          " (in: $" +
          inputPerM.toFixed(2) +
          "/M, out: $" +
          outputPerM.toFixed(2) +
          "/M)";
        output +=
          "\n**Tokens:** " +
          usage.tokens.toLocaleString() +
          " input + " +
          estimatedOutput.toLocaleString() +
          " est. output";
      }

      // Recent sessions
      output += "\n\n## Cost by session (recent)\n\n";
      const sessionAggs = aggregateBySession(traces).slice(0, 10);
      if (sessionAggs.length === 0) {
        output += "(no session data)";
      } else {
        const sHeaders = ["Session", "Calls", "Errors", "Top Tool"];
        const sRows: string[][] = sessionAggs.map((agg) => {
          const shortName =
            agg.sessionFile.split("/").pop()?.replace(".jsonl", "") ?? agg.sessionFile;
          const topTool = [...agg.tools.entries()].sort(
            (a, b) => b[1].calls - a[1].calls,
          )[0];
          return [
            shortName.length > 30
              ? shortName.slice(0, 27) + "..."
              : shortName,
            String(agg.totalCalls),
            String(agg.totalErrors),
            topTool ? topTool[0] + " (" + topTool[1].calls + ")" : "-",
          ];
        });
        output += buildTable(sHeaders, sRows);
      }

      // Display via UI
      ctx.ui.setWidget("cost-summary", output.split("\n"));
    },
  });

  // ---- /trace command ----

  pi.registerCommand("trace", {
    description: "Show the last 20 tool trace entries in compact format",
    handler: async (_args, ctx) => {
      const traces = readTraces(ctx.cwd);
      if (traces.length === 0) {
        ctx.ui.notify("No trace entries yet.", "info");
        return;
      }

      const recent = traces.slice(-20).reverse();

      const lines: string[] = [];
      lines.push("## Trace (last " + recent.length + " entries)");
      lines.push("");

      const headers = ["Tool", "Args", "Duration", "Status", "Tokens"];
      const rows: string[][] = recent.map((t) => [
        t.toolName,
        t.argsSnippet.length > 40
          ? t.argsSnippet.slice(0, 37) + "..."
          : t.argsSnippet,
        t.durationMs !== null ? formatDuration(t.durationMs) : "-",
        t.status,
        t.tokenDelta !== null
          ? (t.tokenDelta > 0 ? "+" : "") + t.tokenDelta.toLocaleString()
          : "-",
      ]);

      lines.push(buildTable(headers, rows));
      lines.push("");

      // Show each entry with timestamp for the last 5
      const detailEntries = recent.slice(0, 5);
      if (detailEntries.length > 0) {
        lines.push("### Details (most recent 5)");
        lines.push("");
        for (const t of detailEntries) {
          const start = t.startTime
            ? new Date(t.startTime).toLocaleTimeString()
            : "?";
          const end = t.endTime
            ? new Date(t.endTime).toLocaleTimeString()
            : "?";
          lines.push(
            "- **`" +
              t.toolName +
              "`** " +
              start +
              " -> " +
              end +
              " | " +
              (t.durationMs !== null ? formatDuration(t.durationMs) : "?") +
              " | " +
              t.status +
              " | id=" +
              t.toolCallId,
          );
        }
      }

      ctx.ui.setWidget("trace-output", lines);
    },
  });
}
