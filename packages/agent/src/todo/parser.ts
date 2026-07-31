import type { TodoGraph, TodoNode } from "./types.js";

const NODE_TABLE_HEADER = "| ID | Name | Files | Verify | DependsOn | Status |";

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

  if (cells.length < 6) {
    throw new Error(`Invalid node row (expected 6 cells): "${line}"`);
  }

  return {
    id: parseInt(cells[0]!, 10),
    name: cells[1]!,
    files: cells[2]!.split(",").map((f) => f.trim()).filter(Boolean),
    verify: cells[3]!,
    dependsOn: parseDependsOn(cells[4]!),
    status: cells[5]! as TodoNode["status"],
  };
}

function parseNodeTable(content: string): TodoNode[] {
  const headerIndex = content.indexOf(NODE_TABLE_HEADER);
  if (headerIndex === -1) throw new Error("No node table found in content");

  // Find the separator line (next line after header)
  const afterHeader = content.slice(headerIndex + NODE_TABLE_HEADER.length);
  const lines = afterHeader.split("\n");

  // Skip the leading empty element (from the newline after the header)
  // and the separator line (|---|...)
  const dataLines = lines.slice(2);

  const nodes: TodoNode[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) break; // end of table
    nodes.push(parseNodeRow(trimmed));
  }

  return nodes;
}

function parseGroups(content: string): number[][] {
  const groups: number[][] = [];
  const groupRegex = /^G\d+:\s*\[([^\]]+)\]/gm;
  let match: RegExpExecArray | null;

  while ((match = groupRegex.exec(content)) !== null) {
    const ids = match[1]!.split(",").map((s) => {
      const id = parseInt(s.trim(), 10);
      if (isNaN(id)) throw new Error(`Invalid group entry: "${s.trim()}"`);
      return id;
    });
    groups.push(ids);
  }

  if (groups.length === 0) throw new Error("No concurrent groups found in content");
  return groups;
}

export function parseTodoGraph(content: string): TodoGraph {
  const nodes = parseNodeTable(content);
  const groups = parseGroups(content);
  return { nodes, groups };
}
