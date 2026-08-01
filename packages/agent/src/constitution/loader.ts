import { readFileSync } from "node:fs";
import type {
  Constitution,
  ArchitecturePrinciple,
  RubricDimension,
  AgentPoolEntry,
  AgentPoolRule,
} from "./types.js";

// ---- Metadata ----

const META_VERSION = /^- version:\s*(\d+)/m;
const META_UPDATED = /^- updated:\s*(.+)/m;

function parseMetadata(content: string): { version: number; updatedAt: string } {
  const v = content.match(META_VERSION);
  const d = content.match(META_UPDATED);
  return {
    version: v ? parseInt(v[1]!, 10) : 1,
    updatedAt: d ? d[1]!.trim() : new Date().toISOString().slice(0, 10),
  };
}

// ---- Principles ----

function parsePrinciples(content: string): ArchitecturePrinciple[] {
  const section = extractSection(content, "Architecture Principles");
  if (!section) return [];

  const principles: ArchitecturePrinciple[] = [];
  const lines = section.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.+?)(?:\s+—\s+(.+))?$/);
    if (!match) continue;
    principles.push({
      order: parseInt(match[1]!, 10),
      statement: match[2]!.trim(),
      description: match[3]?.trim(),
    });
  }
  return principles;
}

// ---- Rubric ----

function parseRubric(content: string): RubricDimension[] {
  const section = extractSection(content, "Rubric");
  if (!section) return [];

  return parseTable(section, (cells) => ({
    key: cells[0] ?? "",
    label: cells[1] ?? "",
    defaultWeight: parseInt(cells[2] ?? "0", 10),
    description: cells[3] ?? "",
  }));
}

// ---- Agent Pool ----

function parseAgentPool(content: string): AgentPoolEntry[] {
  const entries: AgentPoolEntry[] = [];

  // Core section
  const coreSection = extractSubSection(content, "Agent Pool", "Core");
  if (coreSection) {
    const core = parseTable(coreSection, (cells) => ({
      persona: cells[0] ?? "",
      type: "core" as const,
      description: cells[1] ?? "",
    }));
    entries.push(...core);
  }

  return entries;
}

function parseAgentPoolRules(content: string): AgentPoolRule[] {
  const section = extractSubSection(content, "Agent Pool", "Extension Rules");
  if (!section) return [];

  return parseTable(section, (cells) => ({
    subProblemType: cells[0] ?? "",
    addPersonas: (cells[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  }));
}

// ---- Helpers ----

function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = content.match(regex);
  return match ? match[1]!.trim() : null;
}

function extractSubSection(content: string, parentHeading: string, subHeading: string): string | null {
  const parent = extractSection(content, parentHeading);
  if (!parent) return null;
  const regex = new RegExp(`###\\s+${escapeRegex(subHeading)}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`, "i");
  const match = parent.match(regex);
  return match ? match[1]!.trim() : null;
}

function parseTable<T>(section: string, rowMapper: (cells: string[]) => T): T[] {
  const lines = section.split("\n");
  const results: T[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    // Skip header separator (|---|---|)
    if (/^\|[-|\s]+\|$/.test(trimmed)) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    if (cells.length > 0 && cells.some((c) => c.length > 0)) {
      results.push(rowMapper(cells));
    }
  }

  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Public API ----

export function loadConstitution(content: string): Constitution {
  const meta = parseMetadata(content);
  return {
    version: meta.version,
    updatedAt: meta.updatedAt,
    principles: parsePrinciples(content),
    rubric: parseRubric(content),
    agentPool: parseAgentPool(content),
    agentPoolRules: parseAgentPoolRules(content),
  };
}

export function loadConstitutionFromFile(path: string): Constitution {
  const content = readFileSync(path, "utf-8");
  return loadConstitution(content);
}
