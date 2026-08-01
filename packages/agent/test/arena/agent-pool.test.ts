import { describe, it, expect } from "vitest";
import {
  getCoreAgents,
  getExtensions,
  getAgentsFor,
  getCoreAgentsFromConstitution,
  getExtensionsFromConstitution,
  getAgentsForFromConstitution,
  AGENT_SYSTEM_PROMPTS,
} from "../../src/arena/agent-pool.js";
import type { SubProblem } from "../../src/arena/types.js";
import type { Constitution } from "../../src/constitution/types.js";

const constitution: Constitution = {
  version: 1,
  updatedAt: "2026-08-01T00:00:00.000Z",
  principles: [],
  rubric: [],
  agentPool: [
    { persona: "speed", type: "core", description: "Speed-optimized" },
    { persona: "maintain", type: "core", description: "Maintenance-oriented" },
    { persona: "minimal", type: "core", description: "Minimalist" },
    { persona: "perf", type: "extension", description: "Performance" },
    { persona: "secure", type: "extension", description: "Security" },
  ],
  agentPoolRules: [
    { subProblemType: "tech_selection", addPersonas: ["perf"] },
    { subProblemType: "cross_module", addPersonas: ["scalable"] },
  ],
};

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

  it("getCoreAgentsFromConstitution reads core entries from the constitution", () => {
    const core = getCoreAgentsFromConstitution(constitution);
    expect(core).toEqual(["speed", "maintain", "minimal"]);
  });

  it("getExtensionsFromConstitution reads extension rules for a sub-problem type", () => {
    expect(getExtensionsFromConstitution(constitution, "tech_selection")).toEqual(["perf"]);
    expect(getExtensionsFromConstitution(constitution, "cross_module")).toEqual(["scalable"]);
    // Unknown type has no matching rule.
    expect(getExtensionsFromConstitution(constitution, "critical_path")).toEqual([]);
  });

  it("getAgentsForFromConstitution combines core + extension rules", () => {
    const problem: SubProblem = {
      id: "p3",
      title: "Pick a database",
      description: "...",
      type: "tech_selection",
      uncertainty: "high",
      sourceSection: "## Database",
    };
    const agents = getAgentsForFromConstitution(constitution, problem);
    expect(agents).toContain("speed");
    expect(agents).toContain("maintain");
    expect(agents).toContain("minimal");
    expect(agents).toContain("perf");
    expect(agents).toHaveLength(4); // core 3 + perf from rule
  });
});
