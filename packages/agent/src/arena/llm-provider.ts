import { spawn } from "node:child_process";
import type { LLMProvider } from "./types.js";

/** Creates an LLMProvider that delegates to a user-supplied completion function. */
export function createLLMProvider(
  complete: (prompt: string) => Promise<string>,
): LLMProvider {
  return { complete };
}

/** Creates an LLMProvider that pipes the prompt to a shell command via stdin. */
export function createCLILLMProvider(command: string): LLMProvider {
  return {
    complete: (prompt: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const parts = command.split(/\s+/).filter(Boolean);
        const cmd = parts[0]!;
        const args = parts.slice(1);
        const cp = spawn(cmd, args, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 120_000,
        });

        let stdout = "";
        let stderr = "";
        cp.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        cp.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        cp.on("error", reject);
        cp.on("close", (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(`Command "${command}" exited ${code}: ${stderr.slice(0, 200)}`));
        });

        cp.stdin.write(prompt);
        cp.stdin.end();
      });
    },
  };
}
