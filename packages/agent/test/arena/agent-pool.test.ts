import { describe, it, expect } from "vitest";
import {
  getCoreAgentsFromConstitution,
  getExtensionsFromConstitution,
  getAgentsForFromConstitution,
  AGENT_SYSTEM_PROMPTS,
} from "../../src/arena/agent-pool.js";
import { createDefaultConstitution } from "../../src/constitution/defaults.js";
import type { SubProblem } from "../../src/arena/types.js";

const c = createDefaultConstitution();

describe("Agent Pool (Constitution-driven)", () => {
  it("core agents include speed, maintain, minimal", () => {
    const core = getCoreAgentsFromConstitution(c);
    expect(core).toContain("speed");
    expect(core).toContain("maintain");
    expect(core).toContain("minimal");
    expect(core).toHaveLength(3);
  });

  it("adds perf for tech_selection", () => {
    const ext = getExtensionsFromConstitution(c, "tech_selection");
    expect(ext).toContain("perf");
  });

  it("adds scalable for cross_module", () => {
    const ext = getExtensionsFromConstitution(c, "cross_module");
    expect(ext).toContain("scalable");
  });

  it("getAgentsForFromConstitution combines core + extensions", () => {
    const problem: SubProblem = {
      id: "p1", title: "Pick a database", description: "...",
      type: "tech_selection", uncertainty: "high", sourceSection: "## DB",
    };
    const agents = getAgentsForFromConstitution(c, problem);
    expect(agents).toContain("speed");
    expect(agents).toContain("maintain");
    expect(agents).toContain("minimal");
    expect(agents).toContain("perf");
    expect(agents).toHaveLength(4);
  });

  it("getAgentsForFromConstitution critical_path returns only core", () => {
    const problem: SubProblem = {
      id: "p2", title: "Core loop", description: "...",
      type: "critical_path", uncertainty: "high", sourceSection: "## Loop",
    };
    const agents = getAgentsForFromConstitution(c, problem);
    expect(agents).toEqual(["speed", "maintain", "minimal"]);
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
    expect(c.agentPoolRules.length).toBeGreaterThan(0);
  });
});
