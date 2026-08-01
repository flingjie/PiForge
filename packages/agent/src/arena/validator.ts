import type { ValidationResult } from "./types.js";
import type { TodoGraph } from "../todo/types.js";
import { parseTodoGraph } from "../todo/parser.js";

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

interface DepEdge {
  from: number;
  to: number;
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

  // 1. Parse the TODO graph using the canonical parser.
  let todoGraph: TodoGraph;
  try {
    todoGraph = parseTodoGraph(todoMarkdown);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({
      location: "todo graph",
      message: `Failed to parse TODO graph: ${message}`,
    });
    return { valid: false, errors, warnings };
  }

  // 2. Check file references: plan → todo consistency
  const planFiles = extractFilesFromPlan(plan);
  const todoFiles = new Set(todoGraph.nodes.flatMap((n) => n.files));

  for (const f of planFiles) {
    if (!todoFiles.has(f) && f.includes("/src/")) {
      warnings.push(`File "${f}" referenced in plan but not found in todo nodes`);
    }
  }

  // 3. Check for empty todo
  if (todoGraph.nodes.length === 0) {
    warnings.push("TODO graph has no nodes");
  }

  // 4. Check for dependency cycles
  const nodes = new Set(todoGraph.nodes.map((n) => n.id));
  const edges: DepEdge[] = [];
  for (const node of todoGraph.nodes) {
    for (const dep of node.dependsOn) {
      edges.push({ from: dep, to: node.id });
    }
  }

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
