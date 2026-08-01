import type { ValidationResult } from "./types.js";

// Match file paths like "packages/core/src/a.ts" or "auth/handler.ts"
const FILE_PATH_RE = /[\w./-]+\.(ts|tsx|js|jsx|json|md)/g;

function extractFilesFromPlan(plan: string): Set<string> {
  const files = new Set<string>();
  const matches = plan.matchAll(FILE_PATH_RE);
  for (const m of matches) {
    files.add(m[0]);
  }
  return files;
}

function extractFilesFromTodo(todoMarkdown: string): Set<string> {
  const files = new Set<string>();
  // Parse the node table to extract file paths
  const rowRegex = /^\|\s*\d+\s+\|.+?\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(todoMarkdown)) !== null) {
    const filesCell = match[1]!;
    for (const f of filesCell.split(",")) {
      const trimmed = f.trim();
      if (trimmed) files.add(trimmed);
    }
  }
  return files;
}

interface DepEdge {
  from: number;
  to: number;
}

function extractDependencies(todoMarkdown: string): { nodes: Set<number>; edges: DepEdge[] } {
  const nodes = new Set<number>();
  const edges: DepEdge[] = [];
  const rowRegex = /^\|\s*(\d+)\s+\|.+?\|\s*(.+?)\s*\|$/gm;
  let match: RegExpExecArray | null;

  while ((match = rowRegex.exec(todoMarkdown)) !== null) {
    const id = parseInt(match[1]!, 10);
    nodes.add(id);
    // The fifth cell is DependsOn
    const cells = match[0].split("|").map((c) => c.trim());
    // Row: | ID | Name | Files | Verify | DependsOn | Status |
    // cells: ["", ID, Name, Files, Verify, DependsOn, Status, ""]
    const dependsOnCell = cells[5];
    if (dependsOnCell && dependsOnCell !== "-") {
      for (const dep of dependsOnCell.split(",")) {
        const depId = parseInt(dep.trim(), 10);
        if (!isNaN(depId)) {
          edges.push({ from: depId, to: id });
        }
      }
    }
  }

  return { nodes, edges };
}

function hasCycle(nodes: Set<number>, edges: DepEdge[]): boolean {
  // DFS-based cycle detection
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<number, number>();
  for (const n of nodes) color.set(n, WHITE);

  function dfs(node: number): boolean {
    color.set(node, GRAY);
    for (const edge of edges) {
      if (edge.from !== node) continue;
      const c = color.get(edge.to);
      if (c === GRAY) return true; // back edge
      if (c === WHITE && dfs(edge.to)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n) === WHITE && dfs(n)) return true;
  }
  return false;
}

export function validateDesign(plan: string, todoMarkdown: string): ValidationResult {
  const errors: Array<{ location: string; message: string }> = [];
  const warnings: string[] = [];

  // 1. Check file references: plan → todo consistency
  const planFiles = extractFilesFromPlan(plan);
  const todoFiles = extractFilesFromTodo(todoMarkdown);

  for (const f of planFiles) {
    if (!todoFiles.has(f) && f.includes("/src/")) {
      warnings.push(`File "${f}" referenced in plan but not found in todo nodes`);
    }
  }

  // 2. Check for empty todo
  const { nodes, edges } = extractDependencies(todoMarkdown);
  if (nodes.size === 0) {
    warnings.push("TODO graph has no nodes");
  }

  // 3. Check for dependency cycles
  if (hasCycle(nodes, edges)) {
    errors.push({
      location: "todo dependency graph",
      message: "Dependency cycle detected in TODO graph",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
