import type { TodoGraph, TodoNode } from "./types.js";
import { parseMarkdownRoutes } from "./routing.js";

interface ParsedGroup {
  label: string;
  ids: number[];
}

function parseDependsOn(raw: string): number[] {
  const trimmed = raw.trim();
  if (trimmed === "-" || trimmed === "") return [];
  return trimmed.split(",").map((s) => {
    const id = parseInt(s.trim(), 10);
    if (isNaN(id)) throw new Error(`Invalid DependsOn value: "${raw}"`);
    return id;
  });
}

function parseNodeRow(line: string): TodoNode {
  // Split by '|', strip first/last empty and whitespace
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

  if (cells.length !== 6 && cells.length !== 7) {
    throw new Error(`Invalid node row (expected 6 or 7 cells): "${line}"`);
  }

  const hasRoutes = cells.length === 7;

  return {
    id: parseInt(cells[0]!, 10),
    name: cells[1]!,
    files: cells[2]!.split(",").map((f) => f.trim()).filter(Boolean),
    verify: cells[3]!,
    dependsOn: parseDependsOn(cells[4]!),
    routes: hasRoutes ? parseMarkdownRoutes(cells[5]!) : undefined,
    status: cells[hasRoutes ? 6 : 5]! as TodoNode["status"],
  };
}

function parseNodeTable(content: string): TodoNode[] {
  // Match the node table header with flexible whitespace padding.
  // Supports both 6-column (legacy) and 7-column (with Routes) formats.
  const headerPattern =
    /\|\s*ID\s*\|\s*Name\s*\|\s*Files\s*\|\s*Verify\s*\|\s*DependsOn\s*\|(?:\s*Routes\s*\|)?\s*Status\s*\|/;
  const match = content.match(headerPattern);

  if (!match || match.index === undefined) {
    throw new Error("No node table found in content");
  }

  const headerIndex = match.index;
  const headerLength = match[0].length;

  // Find the separator line (next line after header)
  const afterHeader = content.slice(headerIndex + headerLength);
  const lines = afterHeader.split("\n");

  // Skip the separator line (|---|...) — lines[0] is empty (before first \n),
  // lines[1] is the separator, lines[2] is the first data row.
  const dataLines = lines.slice(2);

  const nodes: TodoNode[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) break; // end of table
    nodes.push(parseNodeRow(trimmed));
  }

  return nodes;
}

function parseGroups(content: string): ParsedGroup[] {
  const groups: ParsedGroup[] = [];
  const groupRegex = /^G\d+:\s*\[([^\]]*)\]/gm;
  let match: RegExpExecArray | null;

  while ((match = groupRegex.exec(content)) !== null) {
    const label = match[0].slice(0, match[0].indexOf(":"));
    const ids = match[1]!
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => {
        const id = parseInt(s, 10);
        if (isNaN(id)) throw new Error(`Invalid group entry: "${s}"`);
        return id;
      });
    groups.push({ label, ids });
  }

  if (groups.length === 0) throw new Error("No concurrent groups found in content");
  return groups;
}

/**
 * Validates that the parsed graph is internally consistent:
 * - Every `dependsOn` target exists in the node table.
 * - Every group entry references an existing node.
 * - Every node appears in exactly one group.
 * - Every dependency executes in a strictly earlier group than its dependent.
 */
function validateGraph(nodes: TodoNode[], groups: ParsedGroup[]): void {
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Every dependsOn target must exist in the node table.
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodeIds.has(dep)) {
        throw new Error(
          `Node ${node.id} depends on node ${dep}, but node ${dep} does not exist in the node table`,
        );
      }
    }
  }

  // Every group entry must reference an existing node, and every node must
  // appear in exactly one group.
  const groupOf = new Map<number, number>();
  for (let g = 0; g < groups.length; g++) {
    for (const id of groups[g]!.ids) {
      if (!nodeIds.has(id)) {
        throw new Error(
          `Group ${groups[g]!.label} references node ${id}, but node ${id} does not exist in the node table`,
        );
      }
      const prev = groupOf.get(id);
      if (prev !== undefined) {
        throw new Error(
          `Node ${id} appears in both ${groups[prev]!.label} and ${groups[g]!.label}; every node must appear in exactly one group`,
        );
      }
      groupOf.set(id, g);
    }
  }

  for (const node of nodes) {
    if (!groupOf.has(node.id)) {
      throw new Error(
        `Node ${node.id} does not appear in any concurrent group`,
      );
    }
  }

  // Dependencies must execute in strictly earlier groups.
  for (const node of nodes) {
    const aGroup = groupOf.get(node.id)!;
    for (const dep of node.dependsOn) {
      const bGroup = groupOf.get(dep)!;
      if (bGroup >= aGroup) {
        throw new Error(
          `Node ${node.id} (${groups[aGroup]!.label}) depends on node ${dep} (${groups[bGroup]!.label}), but a dependency must appear in an earlier group`,
        );
      }
    }
  }
}

export function parseTodoGraph(content: string): TodoGraph {
  const nodes = parseNodeTable(content);
  const parsedGroups = parseGroups(content);
  validateGraph(nodes, parsedGroups);
  return { nodes, groups: parsedGroups.map((g) => g.ids) };
}
