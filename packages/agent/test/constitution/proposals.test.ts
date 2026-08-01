import { describe, it, expect } from "vitest";
import {
  createProposal,
  applyProposal,
  serializeProposal,
} from "../../src/constitution/proposals.js";
import type { Constitution } from "../../src/constitution/types.js";

const sampleConstitution: Constitution = {
  version: 1,
  updatedAt: "2026-07-31",
  principles: [
    { order: 1, statement: "Simple > Clever" },
  ],
  rubric: [
    { key: "decoupling", label: "Decoupling", defaultWeight: 20, description: "..." },
  ],
  agentPool: [
    { persona: "speed", type: "core", description: "Fast" },
  ],
  agentPoolRules: [
    { subProblemType: "tech_selection", addPersonas: ["perf"] },
  ],
};

describe("createProposal", () => {
  it("creates a proposal with unique id", () => {
    const p1 = createProposal("rubric", "add", { key: "security" }, "Need security dimension", "arena-run-1");
    const p2 = createProposal("rubric", "add", { key: "latency" }, "Need latency dimension", "arena-run-2");
    expect(p1.id).not.toBe(p2.id);
  });

  it("sets status to proposed", () => {
    const p = createProposal("principle", "add", { statement: "New rule" }, "Because", "arena-1");
    expect(p.status).toBe("proposed");
    expect(p.target).toBe("principle");
    expect(p.action).toBe("add");
    expect(p.rationale).toBe("Because");
    expect(p.source).toBe("arena-1");
  });
});

describe("applyProposal", () => {
  it("adds a new principle", () => {
    const p = createProposal("principle", "add", { statement: "Test > Skip" }, "Rationale", "arena-1");
    const updated = applyProposal({ ...sampleConstitution, principles: [...sampleConstitution.principles] }, p);
    expect(updated.principles).toHaveLength(2);
    expect(updated.principles[1]?.statement).toBe("Test > Skip");
  });

  it("adds a new rubric dimension", () => {
    const p = createProposal("rubric", "add", { key: "security", label: "Security", defaultWeight: 15, description: "Safety" }, "Need it", "arena-1");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.rubric).toHaveLength(2);
    expect(updated.rubric[1]?.key).toBe("security");
  });

  it("modifies an existing principle", () => {
    const p = createProposal("principle", "modify", { order: 1, statement: "Simple >= Clever" }, "Updated", "arena-1");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.principles[0]?.statement).toBe("Simple >= Clever");
  });

  it("removes a rubric dimension", () => {
    const p = createProposal("rubric", "remove", { key: "decoupling" }, "Not needed", "arena-1");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.rubric).toHaveLength(0);
  });

  it("adds an agent pool entry", () => {
    const p = createProposal("agent_pool", "add", { persona: "security", type: "extension", description: "Security-focused" }, "Need security persona", "arena-2");
    const updated = applyProposal(sampleConstitution, p);
    expect(updated.agentPool).toHaveLength(2);
    expect(updated.agentPool[1]?.persona).toBe("security");
  });
});

describe("serializeProposal", () => {
  it("serializes to markdown", () => {
    const p = createProposal("rubric", "add", { key: "security", defaultWeight: 10 }, "Need security", "arena-1");
    const md = serializeProposal(p);
    expect(md).toContain("## Amendment Proposal");
    expect(md).toContain("security");
    expect(md).toContain("arena-1");
    expect(md).toContain("proposed");
  });
});
