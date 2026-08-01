/** Configuration for the trace module, set via PipelineOptions.trace. */
export interface TraceOptions {
  /** When false, no trace files are written. Default false. */
  enabled: boolean;
  /** Directory for trace output files. Default "output/traces". */
  outputDir: string;
  /** Path to the upstream plan file (e.g. "docs/superpowers/plans/2026-08-01-auth.md"). */
  planPath?: string;
}

/** Summary row for index.md — one per pipeline run. */
export interface RunSummary {
  /** ISO-8601 timestamp of the run. */
  time: string;
  /** Relative path to the upstream plan file, or null. */
  planPath: string | null;
  /** Number of design decisions resolved in the arena phase. */
  decisionsCount: number;
  /** Number of todo nodes that completed successfully. */
  todoCompleted: number;
  /** Total number of todo nodes in the graph. */
  todoTotal: number;
}
