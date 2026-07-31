/**
 * Verification Hook Extension
 *
 * Runs automatic post-tool verification after write, edit, and bash tool calls.
 * On failure, injects structured feedback via sendMessage with deliverAs "steer"
 * so the agent can review the issue mid-stream.
 *
 * Verification rules:
 *   - write/edit (.ts/.tsx): npx tsc --noEmit
 *   - write/edit (.json):   python3 json parsing
 *   - bash:                 non-zero exit code (event.isError)
 *
 * Read-only tools (read, grep, find, ls, jq, web_search, web_fetch) are skipped.
 * All verification runs with a 10-second timeout and is wrapped in try-catch so
 * it never blocks the agent.
 */

import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const READ_ONLY_TOOLS = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "jq",
  "web_search",
  "web_fetch",
]);

const VERIFY_TIMEOUT_MS = 10_000;

/** Maximum number of failure characters to include as evidence. */
const MAX_EVIDENCE_LENGTH = 500;

/** When this many failures accumulate in a session, a summary message is sent. */
const FAILURE_SUMMARY_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command with a timeout. Returns { stdout, stderr, code }.
 * If the timeout fires, the process is killed and code is set to a sentinel.
 */
function execWithTimeout(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      // Give it a brief moment, then force kill
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 500);
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 1 });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: 1 });
    });
  });
}

/**
 * Truncate a string to a maximum length, adding an ellipsis hint if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...(truncated)";
}

/** Extract a readable file path from the tool input. */
function getFilePath(input: Record<string, unknown>): string | null {
  const raw = input.path;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Verification functions
// ---------------------------------------------------------------------------

async function verifyTypeScript(cwd: string): Promise<{ ok: boolean; evidence: string }> {
  const { stdout, stderr, code } = await execWithTimeout(
    "npx",
    ["tsc", "--noEmit"],
    cwd,
    VERIFY_TIMEOUT_MS,
  );
  const combined = (stderr + "\n" + stdout).trim();
  if (code !== 0) {
    return { ok: false, evidence: combined || `tsc exited with code ${code}` };
  }
  return { ok: true, evidence: "" };
}

async function verifyJson(filePath: string): Promise<{ ok: boolean; evidence: string }> {
  const { stderr, code } = await execWithTimeout(
    "python3",
    ["-c", `import json; json.load(open('${filePath.replace(/'/g, "\\'")}'))`],
    process.cwd(),
    VERIFY_TIMEOUT_MS,
  );
  if (code !== 0) {
    return { ok: false, evidence: stderr || `python3 JSON parse exited with code ${code}` };
  }
  return { ok: true, evidence: "" };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function verificationHookExtension(pi: ExtensionAPI) {
  let failureCount = 0;

  pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
    try {
      const toolName = event.toolName;

      // Skip read-only tools
      if (READ_ONLY_TOOLS.has(toolName)) return;

      const cwd = ctx.cwd;
      let what = "";
      let why = "";
      let suggestedFix = "";
      let evidence = "";

      // ---- write / edit ----
      if (toolName === "write" || toolName === "edit") {
        const filePath = getFilePath(event.input);
        if (!filePath) return;

        if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
          const result = await verifyTypeScript(cwd);
          if (result.ok) return;
          what = `TypeScript type-check failed after ${toolName} to \`${filePath}\``;
          why = "The file introduced TypeScript type errors.";
          suggestedFix = "Review the type errors below and fix type mismatches, missing properties, or incorrect imports.";
          evidence = truncate(result.evidence, MAX_EVIDENCE_LENGTH);
        } else if (filePath.endsWith(".json")) {
          const result = await verifyJson(filePath);
          if (result.ok) return;
          what = `JSON validation failed after ${toolName} to \`${filePath}\``;
          why = "The file contains invalid JSON syntax.";
          suggestedFix = "Check for trailing commas, unquoted keys, or mismatched brackets.";
          evidence = truncate(result.evidence, MAX_EVIDENCE_LENGTH);
        } else {
          // File type not covered by verification
          return;
        }
      }

      // ---- bash ----
      if (toolName === "bash") {
        if (!event.isError) return;
        const command = typeof event.input.command === "string" ? event.input.command : "(unknown)";
        const outputText = event.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        what = `Bash command exited with non-zero code: \`${command}\``;
        why = "The command returned an error exit code.";
        suggestedFix = "Review the error output. Check for syntax errors, missing files, or incorrect arguments.";
        evidence = truncate(outputText || "(no output)", MAX_EVIDENCE_LENGTH);
      }

      // If we reached here without setting `what`, there was nothing to report
      if (!what) return;

      // ---- Send verification failure ----
      failureCount++;
      const content =
        "## Verification Failed\n\n" +
        `**What:** ${what}\n` +
        `**Why:** ${why}\n` +
        `**Suggested fix:** ${suggestedFix}\n` +
        `**Evidence:**\n\`\`\`\n${evidence}\n\`\`\``;

      pi.sendMessage(
        {
          customType: "verification-failure",
          content,
          display: true,
        },
        { deliverAs: "steer" },
      );

      // ---- Summary on threshold ----
      if (failureCount === FAILURE_SUMMARY_THRESHOLD) {
        pi.sendMessage(
          {
            customType: "verification-summary",
            content:
              `Multiple verification failures (${FAILURE_SUMMARY_THRESHOLD}). ` +
              "Consider pausing to review your approach.",
            display: true,
          },
          { deliverAs: "steer" },
        );
      }
    } catch {
      // Verification failures must never block the agent.
      // Silently ignore any errors in the verification logic itself.
    }
  });
}
