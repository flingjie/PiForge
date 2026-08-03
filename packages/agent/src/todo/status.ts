import { readFileSync, writeFileSync, renameSync } from "node:fs";

const VALID_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
  "escalated",
  "degraded",
]);

/**
 * Updates the Status cell of a single node row in a TODO markdown file.
 * Writes to a temporary file in the same directory and renames it over the
 * original, so a crash mid-write never leaves the file in a partial state.
 */
export function updateStatus(
  todoPath: string,
  nodeId: number,
  newStatus: string,
): void {
  if (!VALID_STATUSES.has(newStatus)) {
    throw new Error(
      `Invalid status "${newStatus}"; allowed values: ${[...VALID_STATUSES].sort().join(", ")}`,
    );
  }

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

  const tempPath = `${todoPath}.${process.pid}.tmp`;
  writeFileSync(tempPath, lines.join("\n"), "utf-8");
  renameSync(tempPath, todoPath);
}

/**
 * Reads all node IDs and their Status values from a TODO markdown file.
 * Returns an empty map if the file contains no node rows.
 */
export function readStatuses(todoPath: string): Map<number, string> {
  const content = readFileSync(todoPath, "utf-8");
  const statuses = new Map<number, string>();

  for (const line of content.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|");
    if (cells.length < 3) continue;
    const id = parseInt(cells[1]!.trim(), 10);
    if (isNaN(id)) continue;
    // Status is the second-to-last cell (last is empty after trailing |)
    const status = cells[cells.length - 2]!.trim();
    statuses.set(id, status);
  }

  return statuses;
}
