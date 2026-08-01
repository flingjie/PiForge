import { describe, it, expect } from "vitest";
import { runArena } from "../../src/arena/orchestrator.js";
import { createLLMProvider } from "../../src/arena/llm-provider.js";
import { createDefaultConstitution } from "../../src/constitution/defaults.js";
import type { ArenaConfig, LLMProvider } from "../../src/arena/types.js";

const BASE_URL = "http://127.0.0.1:15721";
const MODEL = "deepseek-v4-pro";

const plan = `# API Rate Limiter

## Context
We need to add rate limiting to the API to prevent abuse and ensure fair use.

## Design Decision: Rate Limit Storage
We need to choose where to store rate limit counters. Options include in-memory storage (fast but not shared across instances), Redis (shared, persistent, with TTL support), or a database table (durable, transaction-safe, but slower).
`;

const config: ArenaConfig = { maxDepth: 2, maxCritiqueCycles: 1 };

function makeProvider(): LLMProvider {
  const calls: string[] = [];
  return createLLMProvider(async (prompt: string): Promise<string> => {
    calls.push(prompt.slice(0, 60));
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          { role: "system", content: "You are a helpful assistant. Always respond with valid JSON. Never wrap your response in markdown code blocks." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices: Array<{ message?: { content?: string }; delta?: { content?: string } }> };
    const text = data.choices[0]?.message?.content ?? data.choices[0]?.delta?.content ?? "{}";
    // Log the last call (synthesizer / synthesizeAll)
    if (prompt.includes("Synthesiz") || prompt.includes("Fuse") || prompt.includes("revisedPlan") || prompt.includes("todoMarkdown")) {
      console.log("\n--- SYNTH/SYNTHALL RESPONSE ---");
      console.log("Prompt preview:", prompt.slice(-200));
      console.log("Response:", text.slice(0, 300));
    }
    // Log solution agent responses too
    if (prompt.includes("Problem to solve")) {
      console.log("Solution agent response:", text.slice(0, 100));
    }
    return text;
  });
}

describe("Arena with real LLM", () => {
  it("battles a design decision and produces a TODO graph", async () => {
    const result = await runArena(config, makeProvider(), plan, createDefaultConstitution());

    expect(result.state.status).toBe("completed");
    expect(result.problemsBattled).toBe(1);
    console.log("=== RAW STATE ===");
    console.log("Status:", result.state.status);
    console.log("Solutions:", result.state.solutions.size);
    for (const [id, sols] of result.state.solutions) {

      console.log(`  ${id}: ${sols.length} solutions`);
    }
    console.log("Synthesis:", JSON.stringify(result.state.synthesis, null, 2).slice(0, 1000));
  }, 300_000);
});
