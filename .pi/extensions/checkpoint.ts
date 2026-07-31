/**
 * Checkpoint Extension
 *
 * Provides automatic git checkpoints and session summaries.
 *
 * - On session_start: auto git stash push to save current state, and injects
 *   the previous session's summary as context.
 * - /checkpoint: manually trigger a git stash checkpoint.
 * - /rollback: list recent checkpoints and restore to a selected one via git stash pop.
 * - /rollback list: show all checkpoint stash entries.
 * - On session_shutdown: generate a 2-3 line session summary from changed files
 *   and save to state/session-summary.txt for the next session.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 1 }));
    child.on("error", reject);
  });
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function statePath(cwd: string): string {
  return join(cwd, "state");
}

function summaryPath(cwd: string): string {
  return join(statePath(cwd), "session-summary.txt");
}

function timestamp(): string {
  return new Date().toISOString();
}

function shortTs(): string {
  // Compact timestamp for stash messages: YYYYMMDD-HHmmss
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------

async function createCheckpoint(cwd: string, sessionId: string): Promise<string | null> {
  const ts = shortTs();
  const msg = `checkpoint-${sessionId.slice(0, 8)}-${ts}`;
  const { code, stderr } = await execGit(["stash", "push", "-m", msg], cwd);
  if (code !== 0) {
    if (stderr.includes("No local changes to save")) {
      return null; // nothing to stash, not an error
    }
    throw new Error(`git stash failed: ${stderr}`);
  }
  return msg;
}

interface CheckpointEntry {
  index: number;
  branch: string;
  message: string;
}

async function listCheckpoints(cwd: string): Promise<CheckpointEntry[]> {
  const { stdout, code } = await execGit(["stash", "list"], cwd);
  if (code !== 0) {
    return [];
  }
  const lines = stdout.split("\n").filter(Boolean);
  const checkpoints: CheckpointEntry[] = [];
  // Format: stash@{N}: On <branch>: <message>
  const re = /^stash@\{(\d+)\}:\s+On\s+(\S+):\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m && m[3].startsWith("checkpoint-")) {
      checkpoints.push({ index: parseInt(m[1], 10), branch: m[2], message: m[3] });
    }
  }
  return checkpoints;
}

async function popCheckpoint(cwd: string, index: number): Promise<void> {
  const { code, stderr } = await execGit(["stash", "pop", `stash@{${index}}`], cwd);
  if (code !== 0) {
    throw new Error(`git stash pop failed: ${stderr}`);
  }
}

async function getChangedFiles(cwd: string): Promise<string> {
  // Get a compact summary of changes since last commit
  const { stdout: stat } = await execGit(["diff", "--stat", "HEAD"], cwd);
  if (stat) return stat;

  // If no commits yet, show untracked/modified files
  const { stdout: status } = await execGit(["status", "--short"], cwd);
  return status || "(no changes detected)";
}

// ---------------------------------------------------------------------------
// Session summary
// ---------------------------------------------------------------------------

async function generateSummary(cwd: string, sessionId: string): Promise<string> {
  const changed = await getChangedFiles(cwd);
  const lines: string[] = [];

  lines.push(`Session: ${sessionId.slice(0, 8)}`);
  lines.push(`Ended: ${new Date().toLocaleString()}`);

  // Extract a compact file list from the diff stat
  const fileLines = changed.split("\n").filter(Boolean);
  if (fileLines.length > 0) {
    lines.push(`Changed files: ${fileLines.slice(0, 10).join("; ")}`);
    if (fileLines.length > 10) {
      lines.push(`  ... and ${fileLines.length - 10} more`);
    }
  } else {
    lines.push("Changed files: none");
  }

  return lines.join("\n");
}

function readPreviousSummary(cwd: string): string | null {
  const path = summaryPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8").trim();
    return content || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function checkpointExtension(pi: ExtensionAPI) {

  // ---- /checkpoint ----
  pi.registerCommand("checkpoint", {
    description: "Create a git stash checkpoint to save current working state",
    handler: async (_args, ctx) => {
      try {
        const sessionId = ctx.sessionManager.getSessionId();
        const result = await createCheckpoint(ctx.cwd, sessionId);
        if (result) {
          ctx.ui.notify(`Checkpoint created: ${result}`, "info");
        } else {
          ctx.ui.notify("Checkpoint skipped: no local changes to save", "info");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Checkpoint failed: ${msg}`, "error");
      }
    },
  });

  // ---- /rollback ----
  pi.registerCommand("rollback", {
    description: "List and restore checkpoints. Usage: /rollback [list | index]",
    handler: async (args, ctx) => {
      const arg = args?.trim() ?? "";

      if (arg === "list") {
        const checkpoints = await listCheckpoints(ctx.cwd);
        if (checkpoints.length === 0) {
          ctx.ui.notify("No checkpoints found.", "info");
          return;
        }
        const lines = checkpoints.map(
          (c) => `stash@{${c.index}} [${c.branch}] ${c.message}`,
        );
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (arg !== "") {
        // Numeric index provided: pop directly
        const idx = parseInt(arg, 10);
        if (isNaN(idx)) {
          ctx.ui.notify(`Invalid stash index: ${arg}. Use /rollback list to see available checkpoints.`, "error");
          return;
        }
        try {
          await popCheckpoint(ctx.cwd, idx);
          ctx.ui.notify(`Restored stash@{${idx}}`, "info");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`Rollback failed: ${msg}`, "error");
        }
        return;
      }

      // No argument: interactive selection
      if (!ctx.hasUI) {
        ctx.ui.notify("Interactive rollback requires a UI. Use /rollback list to see checkpoints or /rollback <N> to restore directly.", "warning");
        return;
      }

      const checkpoints = await listCheckpoints(ctx.cwd);
      if (checkpoints.length === 0) {
        ctx.ui.notify("No checkpoints found.", "info");
        return;
      }

      const options = checkpoints.map(
        (c) => `stash@{${c.index}} [${c.branch}] ${c.message}`,
      );
      const choice = await ctx.ui.select("Select checkpoint to restore", options);
      if (!choice) return;

      // Find the index from the selected option
      const idx = checkpoints[options.indexOf(choice)]?.index;
      if (idx === undefined) {
        ctx.ui.notify("Could not determine stash index from selection.", "error");
        return;
      }

      try {
        await popCheckpoint(ctx.cwd, idx);
        ctx.ui.notify(`Restored ${choice}`, "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Rollback failed: ${msg}`, "error");
      }
    },
  });

  // ---- session_start ----
  pi.on("session_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();

    // Auto-checkpoint current state
    try {
      await createCheckpoint(ctx.cwd, sessionId);
    } catch {
      // Silently skip if checkpoint fails on startup (not in a git repo, etc.)
    }

    // Inject previous session summary as context
    const prevSummary = readPreviousSummary(ctx.cwd);
    if (prevSummary) {
      pi.sendMessage(
        {
          customType: "checkpoint-summary",
          content: `[Previous session summary]\n${prevSummary}`,
          display: false,
        },
        { deliverAs: "nextTurn" },
      );
    }
  });

  // ---- session_shutdown ----
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const sessionId = ctx.sessionManager.getSessionId();
      const summary = await generateSummary(ctx.cwd, sessionId);
      ensureDir(statePath(ctx.cwd));
      writeFileSync(summaryPath(ctx.cwd), summary + "\n", "utf-8");
    } catch {
      // Silently skip on failure — don't block shutdown
    }
  });
}
