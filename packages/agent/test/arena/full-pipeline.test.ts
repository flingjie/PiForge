import { describe, it } from "vitest";
import { runPipeline } from "../../src/pipeline.js";
import { createDefaultConstitution } from "../../src/constitution/defaults.js";

const plan = `# API Rate Limiter

## Requirement
Need to add rate limiting to prevent API abuse and ensure fair usage across tenants.

## Decision Points
- Rate limit storage: Where to store rate limit counters — in-memory, Redis, or database?
- Rate limit algorithm: Token bucket vs sliding window log vs fixed window counter?
`;

const provider = {
  complete: async (prompt: string): Promise<string> => {
    const res = await fetch("http://127.0.0.1:15721/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        max_tokens: 4096,
        messages: [
          { role: "system", content: "Always respond with valid JSON. No markdown wrapping." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = (await res.json()) as { choices: Array<{ delta?: { content?: string }; message?: { content?: string } }> };
    return data.choices[0]?.delta?.content ?? data.choices[0]?.message?.content ?? "{}";
  },
};

describe("Full Arena Pipeline", () => {
  it("step 1: perspective suggestions", async () => {
    console.log("=== Step 1: Perspective Suggestions ===");
    const result = await runPipeline({
      plan, llm: provider,
      executor: async () => ({ output: "" }),
      constitution: createDefaultConstitution(),
      mode: "perspectives",
    });

    for (const s of result.perspectivesSuggestions ?? []) {
      console.log(`\n${s.decision}`);
      for (const p of s.perspectives) {
        console.log(`  ${p.persona}: ${p.reason}`);
      }
    }
  }, 120000);

  it("step 2: arena-only with debate", async () => {
    // Use pre-confirmed perspectives from step 1 to skip LLM call
    const perspectives = new Map([
      ["Rate limit storage", ["speed", "maintain", "perf"]],
      ["Rate limit algorithm", ["maintain", "minimal", "perf"]],
    ]);

    console.log("\n=== Step 2: Arena Debate ===");
    const result = await runPipeline({
      plan, llm: provider,
      executor: async () => ({ output: "" }),
      constitution: createDefaultConstitution(),
      mode: "arena-only",
      perspectives,
    });

    console.log(result.debateSummary?.slice(0, 2000));
    console.log("\n=== Decisions ===");
    for (const d of result.arenaResult.state.synthesis?.decisions ?? []) {
      console.log(`  ${d.problemTitle}: ${d.chosenApproach} — ${d.decision}`);
    }
  }, 600000);

  it("step 3: execute", async () => {
    // Run arena first, then execute
    const arena = await runPipeline({
      plan, llm: provider,
      executor: async () => ({ output: "" }),
      constitution: createDefaultConstitution(),
      mode: "arena-only",
    });

    console.log("\n=== Step 3: Execute ===");
    const result = await runPipeline({
      plan, llm: provider,
      executor: async (node) => {
        console.log(`  Executing: ${node.name} (${node.files.join(", ")})`);
        return { output: `done: ${node.name}` };
      },
      constitution: createDefaultConstitution(),
      mode: "execute-only",
      todoMarkdown: arena.todoMarkdown,
    });

    console.log(`Completed: ${result.report?.completed}, Failed: ${result.report?.failed}`);
  }, 600000);
});
