import type { SubProblem, SubProblemType } from "./types.js";

// ---- Patterns that signal a design decision needs battle ----

interface GapPattern {
  regex: RegExp;
  type: SubProblemType;
}

const HIGH_RISK_PATTERNS: GapPattern[] = [
  // Tech selection: database, message queue, cache, framework
  {
    regex:
      /\b(database|DB|datastore|storage engine|message queue|MQ|broker|cache|Redis|Kafka|RabbitMQ|PostgreSQL|MySQL|MongoDB)\b/i,
    type: "tech_selection",
  },
  // Cross-module: API boundary, service interface, package boundary
  {
    regex:
      /\b(API|endpoint|service boundary|interface between|module boundary|package boundary|gRPC|REST|GraphQL)\b/i,
    type: "cross_module",
  },
  // Critical path: main loop, hot path, core algorithm, auth, data processing
  {
    regex:
      /\b(hot path|critical path|core loop|pipeline|throughput|latency|bottleneck)\b/i,
    type: "critical_path",
  },
];

// Keywords that suggest uncertainty / alternatives exist
const UNCERTAINTY_MEDIUM =
  /\b(alternative|either|could also|option|maybe|might|consider|TBD)\b/i;

// Low-risk patterns — these decisions don't need battle
const LOW_RISK =
  /\b(logging format|file format|code style|linting|formatting|naming convention)\b/i;

// ---- Detection logic ----

interface RawMatch {
  title: string;
  description: string;
  type: SubProblemType;
  sourceSection: string;
  isTentative: boolean;
}

function extractDesignDecisions(
  content: string,
): Array<{ title: string; body: string }> {
  const decisions: Array<{ title: string; body: string }> = [];
  const headerRegex = /^##\s+Design Decision:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(content)) !== null) {
    const title = match[1]!.trim();
    const start = match.index + match[0].length;
    // Find the next ## header or end of content
    const nextHeader = content.indexOf("\n## ", start);
    const body = content
      .slice(start, nextHeader === -1 ? undefined : nextHeader)
      .trim();
    decisions.push({ title, body });
  }

  return decisions;
}

function classifyDecision(
  title: string,
  body: string,
): RawMatch | null {
  // Skip low-risk decisions
  if (LOW_RISK.test(title) || LOW_RISK.test(body)) return null;

  // Check against high-risk patterns
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.regex.test(title) || pattern.regex.test(body)) {
      return {
        title,
        description: body.slice(0, 200),
        type: pattern.type,
        sourceSection: `## Design Decision: ${title}`,
        isTentative:
          UNCERTAINTY_MEDIUM.test(title) || UNCERTAINTY_MEDIUM.test(body),
      };
    }
  }

  return null;
}

export function detectGaps(planContent: string): SubProblem[] {
  const decisions = extractDesignDecisions(planContent);
  const gaps: SubProblem[] = [];
  let counter = 0;

  for (const decision of decisions) {
    const raw = classifyDecision(decision.title, decision.body);
    if (!raw) continue;

    counter++;
    gaps.push({
      id: `gap-${counter}`,
      title: raw.title,
      description: raw.description,
      type: raw.type,
      uncertainty: raw.isTentative ? "medium" : "high",
      sourceSection: raw.sourceSection,
    });
  }

  return gaps;
}
