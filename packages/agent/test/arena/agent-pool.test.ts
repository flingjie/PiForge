import { describe, it, expect } from "vitest";
import {
  getCoreAgentsFromConstitution,
  AGENT_SYSTEM_PROMPTS,
} from "../../src/arena/agent-pool.js";
import { createDefaultConstitution } from "../../src/constitution/defaults.js";

const c = createDefaultConstitution();

describe("Agent Pool (Constitution-driven)", () => {
  it("core agents include speed, maintain, minimal", () => {
    const core = getCoreAgentsFromConstitution(c);
    expect(core).toContain("speed");
    expect(core).toContain("maintain");
    expect(core).toContain("minimal");
    expect(core).toHaveLength(3);
  });

  it("every core agent has a system prompt", () => {
    for (const persona of getCoreAgentsFromConstitution(c)) {
      expect(AGENT_SYSTEM_PROMPTS[persona]).toBeDefined();
      expect(AGENT_SYSTEM_PROMPTS[persona].length).toBeGreaterThan(50);
    }
  });

  it("extension agents have system prompts", () => {
    expect(AGENT_SYSTEM_PROMPTS["perf"]).toBeDefined();
    expect(AGENT_SYSTEM_PROMPTS["secure"]).toBeDefined();
    expect(AGENT_SYSTEM_PROMPTS["scalable"]).toBeDefined();
  });

  it("createDefaultConstitution produces a full constitution", () => {
    expect(c.principles.length).toBeGreaterThan(0);
    expect(c.rubric.length).toBeGreaterThan(0);
    expect(c.agentPool.length).toBeGreaterThan(0);
  });
});
