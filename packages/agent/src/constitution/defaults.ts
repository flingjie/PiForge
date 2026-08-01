import type { Constitution } from "./types.js";

export function createDefaultConstitution(): Constitution {
  return {
    version: 3,
    updatedAt: "2026-08-01",
    principles: [
      { order: 1, statement: "Simple > Clever", description: "Prefer straightforward solutions over clever ones." },
      { order: 2, statement: "Composition > Inheritance", description: "Favor composition for code reuse." },
      { order: 3, statement: "Explicit > Implicit", description: "Make dependencies and data flow visible." },
      { order: 4, statement: "Interface First", description: "Define contracts before implementation." },
      { order: 5, statement: "Testable", description: "Every module must be independently verifiable." },
      { order: 6, statement: "Maximize Concurrency", description: "Structure work so independent tasks can execute in parallel. Minimize sequential dependency chains." },
      { order: 7, statement: "Reusable > Bespoke", description: "Build composable, generic units with clear interfaces. Prefer reuse over one-off implementations." },
      { order: 8, statement: "Reuse > Reinvent", description: "Search GitHub (via gh CLI), npm, and open-source communities for mature solutions before building from scratch. Adapt and wrap existing work." },
      { order: 9, statement: "Dependencies > DIY", description: "Prefer stable, well-maintained third-party libraries over custom implementations. Justify every dependency, but default to reuse." },
    ],
    rubric: [
      { key: "decoupling", label: "Decoupling", defaultWeight: 25, description: "Module independence — can work be parallelized?" },
      { key: "maintainability", label: "Maintainability", defaultWeight: 15, description: "Ease of safe changes" },
      { key: "extensibility", label: "Extensibility", defaultWeight: 15, description: "Adding new capabilities" },
      { key: "testability", label: "Testability", defaultWeight: 15, description: "Verifying correctness" },
      { key: "observability", label: "Observability", defaultWeight: 10, description: "Internal state visibility" },
      { key: "performance", label: "Performance", defaultWeight: 5, description: "Throughput and latency" },
      { key: "complexity", label: "Complexity", defaultWeight: 5, description: "Code and abstraction needed" },
      { key: "ai_friendliness", label: "AI Friendliness", defaultWeight: 5, description: "AI agent navigability" },
      { key: "concurrency", label: "Concurrency", defaultWeight: 5, description: "How easily can tasks be parallelized?" },
    ],
    agentPool: [
      { persona: "speed", type: "core", description: "Fastest implementation, minimal abstraction" },
      { persona: "maintain", type: "core", description: "Long-term maintenance, modularity" },
      { persona: "minimal", type: "core", description: "YAGNI, delete more than add" },
      { persona: "parallel", type: "extension", description: "Maximize concurrency — find independent work streams, eliminate false dependencies" },
      { persona: "perf", type: "extension", description: "Performance optimization" },
      { persona: "secure", type: "extension", description: "Security and defense in depth" },
      { persona: "scalable", type: "extension", description: "Horizontal scaling and growth" },
    ],
  };
}
