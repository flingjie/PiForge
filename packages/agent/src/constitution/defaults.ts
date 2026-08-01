import type { Constitution } from "./types.js";

export function createDefaultConstitution(): Constitution {
  return {
    version: 1,
    updatedAt: "2026-08-01",
    principles: [
      { order: 1, statement: "Simple > Clever", description: "Prefer straightforward solutions over clever ones." },
      { order: 2, statement: "Composition > Inheritance", description: "Favor composition for code reuse." },
      { order: 3, statement: "Explicit > Implicit", description: "Make dependencies and data flow visible." },
      { order: 4, statement: "Interface First", description: "Define contracts before implementation." },
      { order: 5, statement: "Testable", description: "Every module must be independently verifiable." },
    ],
    rubric: [
      { key: "decoupling", label: "Decoupling", defaultWeight: 20, description: "Module independence" },
      { key: "maintainability", label: "Maintainability", defaultWeight: 20, description: "Ease of safe changes" },
      { key: "extensibility", label: "Extensibility", defaultWeight: 15, description: "Adding new capabilities" },
      { key: "testability", label: "Testability", defaultWeight: 15, description: "Verifying correctness" },
      { key: "performance", label: "Performance", defaultWeight: 10, description: "Throughput and latency" },
      { key: "observability", label: "Observability", defaultWeight: 10, description: "Internal state visibility" },
      { key: "complexity", label: "Complexity", defaultWeight: 5, description: "Code and abstraction needed" },
      { key: "ai_friendliness", label: "AI Friendliness", defaultWeight: 5, description: "AI agent navigability" },
    ],
    agentPool: [
      { persona: "speed", type: "core", description: "Fastest implementation, minimal abstraction" },
      { persona: "maintain", type: "core", description: "Long-term maintenance, modularity" },
      { persona: "minimal", type: "core", description: "YAGNI, delete more than add" },
      { persona: "perf", type: "extension", description: "Performance optimization" },
      { persona: "secure", type: "extension", description: "Security and defense in depth" },
      { persona: "scalable", type: "extension", description: "Horizontal scaling and growth" },
    ],
  };
}
