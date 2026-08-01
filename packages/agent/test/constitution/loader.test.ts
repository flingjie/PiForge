import { describe, it, expect } from "vitest";
import { loadConstitution } from "../../src/constitution/loader.js";

const sampleMd = `# Design Constitution

## Metadata
- version: 1
- updated: 2026-07-31

## Architecture Principles
1. Simple > Clever — Prefer straightforward solutions over clever ones.
2. Composition > Inheritance — Favor composition for code reuse.

## Rubric
| Key | Label | Weight | Description |
|-----|-------|--------|-------------|
| decoupling | Decoupling | 20 | Module independence |
| maintainability | Maintainability | 20 | Ease of future changes |
| performance | Performance | 10 | Throughput and latency |

## Agent Pool
### Core
| Persona | Description |
|---------|-------------|
| speed | Fastest implementation, minimal abstraction |
| maintain | Long-term maintenance, modularity |
| minimal | YAGNI, delete more than add |

### Extension Rules
| Sub-Problem Type | Add Personas |
|------------------|-------------|
| tech_selection | perf |
| cross_module | scalable |
`;

describe("loadConstitution", () => {
  it("parses version and timestamp", () => {
    const c = loadConstitution(sampleMd);
    expect(c.version).toBe(1);
    expect(c.updatedAt).toBe("2026-07-31");
  });

  it("parses architecture principles", () => {
    const c = loadConstitution(sampleMd);
    expect(c.principles).toHaveLength(2);
    expect(c.principles[0]).toMatchObject({
      order: 1,
      statement: "Simple > Clever",
      description: "Prefer straightforward solutions over clever ones.",
    });
  });

  it("parses rubric dimensions with weights", () => {
    const c = loadConstitution(sampleMd);
    expect(c.rubric).toHaveLength(3);
    expect(c.rubric[0]).toMatchObject({
      key: "decoupling",
      label: "Decoupling",
      defaultWeight: 20,
    });
  });

  it("parses core agent pool entries", () => {
    const c = loadConstitution(sampleMd);
    expect(c.agentPool).toHaveLength(3);
    expect(c.agentPool[0]).toMatchObject({
      persona: "speed",
      type: "core",
    });
  });

  it("parses extension rules", () => {
    const c = loadConstitution(sampleMd);
    expect(c.agentPoolRules).toHaveLength(2);
    expect(c.agentPoolRules[0]).toMatchObject({
      subProblemType: "tech_selection",
      addPersonas: ["perf"],
    });
  });

  it("returns defaults for missing sections", () => {
    const minimal = `# Design Constitution

## Metadata
- version: 1
`;
    const c = loadConstitution(minimal);
    expect(c.principles).toHaveLength(0);
    expect(c.rubric).toHaveLength(0);
    expect(c.agentPool).toHaveLength(0);
    expect(c.agentPoolRules).toHaveLength(0);
  });
});
