import type { LLMProvider, PerspectiveSuggestion, PerspectivesResult, SubProblem } from "./types.js";
import type { Constitution } from "../constitution/types.js";
import { getCoreAgentsFromConstitution } from "./agent-pool.js";
import { extractJSON, complete } from "./json-utils.js";

// ---- Prompt ----

function buildPerspectivesPrompt(
  decisionPoints: SubProblem[],
  availablePersonas: string[],
): string {
  const points = decisionPoints
    .map((d, i) => `${i + 1}. ${d.title}: ${d.description}`)
    .join("\n");

  return `You are a Design Strategy Advisor. For each decision point below, suggest which architect personas should review it. You can suggest 2-5 personas per decision.

**Available personas:**
${availablePersonas.map((p) => `  - ${p}`).join("\n")}

**Decision Points:**
${points}

**Brief persona descriptions:**
- speed: Fastest implementation, minimal abstraction
- maintain: Long-term maintenance, modularity, dependency injection
- minimal: YAGNI, delete more than add
- perf: Performance optimization, caching, concurrency
- secure: Security, defense in depth, least privilege
- scalable: Horizontal scaling, stateless services

**Instructions:**
- For each decision point, pick 2-5 most relevant personas
- Provide a brief reason (one sentence) for why each persona should review
- Favor more personas for higher-risk decisions
- Always include at least "maintain" for any decision that affects code structure

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "decision": "<decision title>",
      "perspectives": [
        { "persona": "<name>", "reason": "<one sentence why>" }
      ]
    }
  ]
}`;
}

function parsePerspectivesResponse(
  raw: string,
  decisionPoints: SubProblem[],
): Array<{ decision: string; perspectives: PerspectiveSuggestion[] }> {
  const o = JSON.parse(extractJSON(raw)) as PerspectivesResult;
  const suggestionMap = new Map(
    (o.suggestions ?? []).map((s) => [s.decision, s.perspectives ?? []]),
  );
  return decisionPoints.map((d) => ({
    decision: d.title,
    perspectives: suggestionMap.get(d.title) ?? [],
  }));
}

// ---- Public API ----

export async function suggestPerspectives(
  provider: LLMProvider,
  decisionPoints: SubProblem[],
  constitution: Constitution,
  signal?: AbortSignal,
): Promise<Array<{ decision: string; perspectives: PerspectiveSuggestion[] }>> {
  if (decisionPoints.length === 0) return [];

  signal?.throwIfAborted();

  const allPersonas = [
    ...new Set(constitution.agentPool.map((e) => e.persona)),
  ];

  const prompt = buildPerspectivesPrompt(decisionPoints, allPersonas);
  const raw = await complete(provider, prompt, signal);
  return parsePerspectivesResponse(raw, decisionPoints);
}
