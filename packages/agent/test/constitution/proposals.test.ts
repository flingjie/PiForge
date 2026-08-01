import { afterEach, describe, it, expect } from "vitest";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProposal,
  applyProposal,
  serializeProposal,
  writeProposal,
  readProposals,
} from "../../src/constitution/proposals.js";
import type { Constitution } from "../../src/constitution/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

describe("writeProposal / readProposals", () => {
  function tempProposalsPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "proposals-"));
    tempDirs.push(dir);
    return join(dir, "proposals.jsonl");
  }

  it("writes and reads back the same proposal (roundtrip)", () => {
    const path = tempProposalsPath();
    const p = createProposal("rubric", "add", { key: "security", defaultWeight: 10 }, "Need security", "arena-1");

    writeProposal(p, path);
    const read = readProposals(path);

    expect(read).toEqual([p]);
  });

  it("appends multiple proposals without overwriting", () => {
    const path = tempProposalsPath();
    const p1 = createProposal("principle", "add", { statement: "Test > Skip" }, "Because", "arena-1");
    const p2 = createProposal("agent_pool", "add", { persona: "security", type: "extension" }, "Need persona", "arena-2");

    writeProposal(p1, path);
    writeProposal(p2, path);

    const read = readProposals(path);
    expect(read).toHaveLength(2);
    expect(read[0]?.id).toBe(p1.id);
    expect(read[1]?.id).toBe(p2.id);
  });

  it("skips unparseable lines", () => {
    const path = tempProposalsPath();
    const p = createProposal("rubric", "modify", { key: "decoupling", defaultWeight: 25 }, "Re-weight", "arena-1");

    writeProposal(p, path);
    appendFileSync(path, "not valid json\n", "utf-8");

    const read = readProposals(path);
    expect(read).toEqual([p]);
  });

  it("returns an empty list for a missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "proposals-missing-"));
    tempDirs.push(dir);
    expect(readProposals(join(dir, "does-not-exist.jsonl"))).toEqual([]);
  });
});
