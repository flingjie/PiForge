import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMProvider } from "./types.js";

/** Creates an LLMProvider that delegates to a user-supplied completion function. */
export function createLLMProvider(
  complete: (prompt: string) => Promise<string>,
): LLMProvider {
  return { complete };
}

/** Creates an LLMProvider that uses a shell command (e.g., `llm` CLI) for completion. */
export function createCLILLMProvider(command: string): LLMProvider {
  return {
    complete: async (prompt: string): Promise<string> => {
      // Use a temp file for the prompt to avoid shell escaping issues
      const tmpFile = join(tmpdir(), `arena-prompt-${Date.now()}.txt`);
      writeFileSync(tmpFile, prompt, "utf-8");
      try {
        // Feed prompt via stdin, capture stdout
        return execSync(`cat "${tmpFile}" | ${command}`, {
          encoding: "utf-8",
          maxBuffer: 100 * 1024 * 1024, // 100MB
          timeout: 120_000,
        });
      } finally {
        try {
          unlinkSync(tmpFile);
        } catch {
          /* cleanup failure is fine */
        }
      }
    },
  };
}
