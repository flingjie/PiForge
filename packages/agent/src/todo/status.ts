import { readFileSync, writeFileSync } from "node:fs";

/**
 * Updates the Status cell of a single node row in a TODO markdown file.
 * This is the single writer for the Status column — it reads the file,
 * rewrites one row, and writes the file back atomically for the caller.
 */
export function updateStatus(
  todoPath: string,
  nodeId: number,
  newStatus: string,
): void {
  let content = readFileSync(todoPath, "utf-8");
  const lines = content.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match a table row starting with "| {nodeId} "
    if (!line.match(new RegExp(`^\\|\\s*${nodeId}\\s+\\|`))) continue;

    // Replace the last cell (Status column) while preserving leading whitespace
    const cells = line.split("|");
    if (cells.length < 2) continue;

    // The status is the second-to-last element (last is empty after trailing |)
    cells[cells.length - 2] = ` ${newStatus} `;
    lines[i] = cells.join("|");
    found = true;
    break;
  }

  if (!found) throw new Error(`Node with ID ${nodeId} not found in ${todoPath}`);

  writeFileSync(todoPath, lines.join("\n"), "utf-8");
}

/**
 * Reads all node IDs and their Status values from a TODO markdown file.
 * Returns an empty map if the file contains no node rows.
 */
export function readStatuses(todoPath: string): Map<number, string> {
  const content = readFileSync(todoPath, "utf-8");
  const statuses = new Map<number, string>();
  const rowRegex = /^\|\s*(\d+)\s+\|.+?\|\s*(\S+)\s*\|$/;

  for (const line of content.split("\n")) {
    const match = line.match(rowRegex);
    if (!match) continue;
    const id = parseInt(match[1]!, 10);
    const status = match[2]!;
    statuses.set(id, status);
  }

  return statuses;
}
