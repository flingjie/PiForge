import { describe, it, expect } from "vitest";
import {
  getCoreAgents,
  getExtensions,
  getAgentsFor,
  AGENT_SYSTEM_PROMPTS,
} from "../../src/arena/agent-pool.js";
import type { SubProblem } from "../../src/arena/types.js";

describe("Agent Pool", () => {
  it("core agents always include speed, maintain, minimal", () => {
    const core = getCoreAgents();
    expect(core).toContain("speed");
    expect(core).toContain("maintain");
    expect(core).toContain("minimal");
    expect(core).toHaveLength(3);
  });

  it("adds perf for tech_selection", () => {
    const ext = getExtensions("tech_selection");
    expect(ext).toContain("perf");
  });

  it("adds scalable for cross_module", () => {
    const ext = getExtensions("cross_module");
    expect(ext).toContain("scalable");
  });

  it("getAgentsFor combines core + extensions", () => {
    const problem: SubProblem = {
      id: "p1",
      title: "Pick a database",
      description: "...",
      type: "tech_selection",
      uncertainty: "high",
      sourceSection: "## Database",
    };
    const agents = getAgentsFor(problem);
    expect(agents).toContain("speed");
    expect(agents).toContain("maintain");
    expect(agents).toContain("minimal");
    expect(agents).toContain("perf");
    expect(agents).toHaveLength(4); // core 3 + perf
  });

  it("getAgentsFor critical_path adds no extensions (no matching rule)", () => {
    const problem: SubProblem = {
      id: "p2",
      title: "Core loop design",
      description: "...",
      type: "critical_path",
      uncertainty: "high",
      sourceSection: "## Main Loop",
    };
    const agents = getAgentsFor(problem);
    expect(agents).toEqual(["speed", "maintain", "minimal"]);
  });

  it("every core agent has a system prompt", () => {
    for (const persona of getCoreAgents()) {
      expect(AGENT_SYSTEM_PROMPTS[persona]).toBeDefined();
      expect(AGENT_SYSTEM_PROMPTS[persona].length).toBeGreaterThan(50);
    }
  });

  it("extension agents have system prompts", () => {
    expect(AGENT_SYSTEM_PROMPTS["perf"]).toBeDefined();
    expect(AGENT_SYSTEM_PROMPTS["secure"]).toBeDefined();
    expect(AGENT_SYSTEM_PROMPTS["scalable"]).toBeDefined();
  });
});
