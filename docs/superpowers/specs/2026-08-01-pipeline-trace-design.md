# Pipeline Trace: Decision Provenance via Markdown Wiki

> **Status:** approved
> **Date:** 2026-08-01

## Motivation

The pipeline (arena → todo execution) currently produces results in-memory only, with optional markdown output to `outputDir`. After a run completes, there is no structured archive of what decisions were made, what alternatives were debated, or why a particular approach won. This makes it impossible to answer "why was this decision made in run A vs run B?"

## Scope

Add a lightweight trace module (`packages/agent/src/trace/`) that persists pipeline
outputs as interlinked markdown files — a wiki-style knowledge base following the
Karpathy LLM Wiki pattern.

**In scope:**
- Arena run trace page: metadata + all decisions with alternatives and critiques
- Pipeline index page: one page per run linking to its arena and todo sub-pages
- Global index page: chronological list of all runs
- Todo execution result page (basic — node outcomes, not full output)
- Integration into `runPipeline()` via post-hoc write (zero introspection into arena / orchestrator internals)

**Out of scope:**
- Grilling / brainstorming / writing-plans phases (these produce filesystem artifacts already)
- Real-time streaming trace output
- Full LLM prompt/response storage (opt-in via debug toggle, future)
- Query API beyond file system navigation (this is plain markdown)
- Todo execution sub-node details (future iteration)

## Design Decisions

### 1. Storage: Markdown Wiki, not SQLite

**Decision:** Plain markdown files in `output/traces/` with cross-page relative links. No database.

**Alternatives considered:**
| Persona | Proposal | Weakness | Severity |
|---------|----------|----------|----------|
| maintain | SQLite with relational schema | Over-engineered — decision provenance queries are human browsing, not programmatic aggregation | minor |
| minimal | Filesystem JSON (ls + jq) | No cross-linking, poor human readability | major |

**Reasoning:** Decision provenance is a human-driven audit use case — people open files and read. Markdown is universally readable, git-friendly, and LLM agents can navigate it natively. Cross-page linking with relative paths gives us the relational model without a DB.

### 2. Identity Model: Multi-Root Runs

**Decision:** Arena run and todo run are independent trace pages, linked by `pipelineId`.

| Persona | Proposal | Weakness | Severity |
|---------|----------|----------|----------|
| speed | Single run page per pipeline | Arena decisions and todo execution muddled in one page; todo failure contaminates arena trace | major |
| maintain | Nested run tree with sub-run pages | Overkill — recursive debates already captured in arena page's alternative table | minor |

**Reasoning:** Arena and todo have independent lifecycles (can re-run todo against same arena result). Each gets its own page. A pipeline page links them. `pipelineId` is the correlation key.

### 3. Integration: Post-Hoc Write

**Decision:** `runPipeline()` writes trace files after the pipeline completes. Arena and orchestrator internals are not modified.

**Reasoning:** Decision provenance does not require real-time trace streaming. The only downside (partial runs lost on crash) is irrelevant — incomplete decisions have no provenance value.

### 4. Coverage: Arena + Todo Execution Only

**Decision:** Only arena and todo execution phases are traced. Grilling / brainstorming / writing-plans produce their own filesystem artifacts (`docs/superpowers/`) — the trace page references the upstream plan path.

**Reasoning:** The three upstream phases are agent-skill-driven (not code-driven). Their outputs are already persisted as markdown files. The trace module fills the gap for the code-driven phases that previously had no persistent record.

## Architecture

### Module Structure

```
packages/agent/src/trace/
  types.ts      — Trace-related types (no external deps)
  store.ts      — Markdown generation + file I/O (dependency: node:fs, node:path)
  index.ts      — Public re-exports
```

### File Layout

```
output/traces/
  index.md                           # Chronological list of all pipeline runs
  pipeline-<pipelineId>.md            # Pipeline overview: plan link, sub-run links
  arena-<runId>.md                    # Arena decisions page (core artifact)
  todo-<runId>.md                     # Todo execution node summary
```

### Data Flow

```
PipelineResult
  │
  ├─→ savePipelineIndex()    → output/traces/pipeline-<id>.md
  ├─→ saveArenaTrace()       → output/traces/arena-<id>.md
  ├─→ saveTodoTrace()        → output/traces/todo-<id>.md
  └─→ appendToIndex()        → output/traces/index.md (append line)
```

### Markdown Templates

**arena-<runId>.md:**
```markdown
# Arena Run: <timestamp>

**Pipeline:** [pipeline-<id>](pipeline-<id>.md)
**Plan:** [<path>](../../<plan-path>)
**Status:** completed
**Duration:** 3.2s
**Problems battled:** 1 (recursive: 0)

## Decision 1: <title>

**Chosen:** <persona>
**Decision:** <decision text>

### Reasoning
<reasoning>

### Alternatives Considered

| Persona | Proposal | Scores | Critique | Severity |
|---------|----------|--------|----------|----------|
| speed   | ...      | ...    | ...      | minor    |
```

**pipeline-<pipelineId>.md:**
```markdown
# Pipeline: <pipelineId>

**Created:** <timestamp>
**Plan:** [<path>](../../<plan-path>)

## Runs

- [Arena: <timestamp>](arena-<runId>.md) — N decisions, completed
- [Todo: <timestamp>](todo-<runId>.md) — M/N nodes completed
```

**index.md:**
```markdown
# Pipeline Traces

| Pipeline | Time | Plan | Decisions | Todo |
|----------|------|------|-----------|------|
| [<id>](pipeline-<id>.md) | <time> | <plan> | N | M/N |
```

### API Surface

```typescript
export interface TraceOptions {
  enabled: boolean;
  outputDir: string;        // "output/traces"
  planPath?: string;         // upstream plan file, for linking
}

// store.ts — call from runPipeline() after completion
export function savePipelineIndex(pipelineId: string, planPath: string | null, outputDir: string): void;
export function saveArenaTrace(pipelineId: string, planPath: string | null, result: PipelineResult, outputDir: string): void;
export function saveTodoTrace(pipelineId: string, arenaRunId: string, result: PipelineResult, outputDir: string): void;
export function appendToIndex(pipelineId: string, outputDir: string, summary: RunSummary): void;
```

### Integration Point

`PipelineOptions` gets a new optional `trace?: TraceOptions` field. When set and `enabled: true`, `runPipeline()` calls the trace functions at the end. When absent or `enabled: false`, zero code from `src/trace/` is imported or executed.

`PipelineResult` gets a `pipelineId: string` field. `runPipeline()` generates it via `crypto.randomUUID()` at start, or accepts an override in `PipelineOptions` for testing.

### Error Handling

All `save*` and `appendToIndex` functions must not throw into the caller. If a trace write fails (disk full, permission denied), the error is caught, logged to stderr, and the pipeline result is still returned. Trace is best-effort — a missing trace file must never cause a pipeline failure.

### Testing Strategy

- **Unit tests:** `saveArenaTrace()` with a mock `PipelineResult` → assert markdown file content matches expected template
- **Unit tests:** `appendToIndex()` — initial write creates index, subsequent calls append line
- **Integration test:** `runPipeline` with `trace.enabled: true` → assert all 4 files exist and contain expected data
- **Failure test:** Write to a read-only `outputDir` → pipeline still returns result, error logged to stderr
- **Idempotency:** Calling `savePipelineIndex` with same `pipelineId` overwrites (not appends duplicate)
- **Mock provider:** All tests use the existing mock LLM provider from `test/pipeline.test.ts` — no real API calls
