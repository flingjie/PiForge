# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

PiForge is a smart assistant built on the [Pi Agent Harness](https://github.com/earendil-works/pi) — an open-source (MIT) TypeScript monorepo providing a unified LLM API, agent runtime, TUI library, and coding agent CLI. PiForge extends Pi with domain-specific tools, skills, and configurations to create a tailored intelligent assistant.

## Project Layout

```
PiForge/
├── packages/
│   └── agent/         # Agent runtime — the only implemented package so far
├── .pi/
│   ├── skills/        # Pi skills loaded by the coding agent at runtime (see available_skills in prompt)
│   └── permissions.json  # Tool permission rules
├── skills/            # Custom skill definitions (top-level, work-in-progress)
├── state/             # Runtime state: goal.json, reflections.jsonl, records.jsonl, user_dna.json
├── docs/              # Project documentation
├── references/        # External reference material (papers, specs)
├── output/            # Generated artifacts, logs, scratch output
├── tsconfig.base.json
├── vitest.base.ts
└── package.json       # Root (minimal — agent is the active package)
```

**What's implemented:** `packages/agent/` — an agent runtime with tool calling, state management, and real-LLM test harnesses.

**What's planned:** `packages/ai/`, `packages/skills/`, `packages/tui/`, `packages/cli/` — following Pi's layered separation of concerns.

### Key Design Principles

- **Self-extensible** — the assistant can explain itself and modify its own configuration
- **Provider abstraction** — `packages/ai` provides a unified interface over LLM providers (OpenAI, Anthropic, Google, etc.)
- **Skills as packages** — each skill or domain capability is an independent package that plugs into the agent runtime

## Tech Stack

- **Language:** TypeScript (strict)
- **Monorepo:** npm workspaces (package-level, not yet configured at root)
- **Runtime:** Node.js
- **Testing:** Vitest — base config at `vitest.base.ts`, per-package overrides (e.g., `packages/agent/vitest.config.ts`)
- **Linting/Formatting:** TBD — Biome planned, not yet configured
- **Git hooks:** TBD — Husky planned, not yet configured

## Development Commands

Root has no scripts yet. All commands run from `packages/agent/`:

```bash
# Install dependencies (no lifecycle scripts)
npm install --ignore-scripts

# Type check agent package
cd packages/agent && npx tsc --noEmit

# Run agent tests (skips LLM tests without API keys by default)
cd packages/agent && npx vitest run

# Run a specific test file
cd packages/agent && npx vitest run path/to/test.test.ts

# Watch mode during development
cd packages/agent && npx vitest
```

## Code Standards

### TypeScript

- **No `any`** — use proper types or `unknown`; never downgrade deps to fix type errors
- **Only erasable TypeScript syntax** — no `enum`, `namespace`, `module`, `import =`, `export =`, or parameter properties; use explicit fields with constructor assignments
- **Top-level imports only** — no `await import()`, dynamic type imports, or inline imports
- Inline single-call-site helpers rather than extracting them

### Code Quality

- Type check after code changes: `cd packages/agent && npx tsc --noEmit`
- Do NOT run build or tests unless explicitly asked or when you have created/modified a test file
- Read files in full before making wide-ranging changes — don't rely on search snippets
- Don't hardcode key bindings; add defaults to shared keybinding configuration constants
- Never edit generated files directly — update the generator script and regenerate

### Tests

- Run tests from the package root: `cd packages/agent && npx vitest run`
- For a single test file: `cd packages/agent && npx vitest run <path>`
- Regression tests: name them `<issue-number>-<short-slug>.test.ts` and place in `test/suite/regressions/`
- Test harnesses should use faux providers — no real provider API keys or paid tokens
- When you create or modify a test file: run it and iterate until it passes (this overrides the general "don't run tests" rule)

### Style

- Keep answers short and concise
- No emojis in commits, issues, PRs, or code
- No fluff or cheerful filler
- Answer the user's question before making edits

## Agent Behavior

How the coding agent should operate in this repo.

### Navigation & Discovery

1. **Start with `ls` or `read`** to understand current layout before acting — the repo is early-stage and layout may drift from docs.
2. **Use `rg` (ripgrep) for code search**, `ls` for directory listing, `read` for file inspection. Prefer `rg` over `grep`.
3. **Check `package.json`** (root and per-package) for actual scripts and dependencies — these are the source of truth.
4. **Skills are in `.pi/skills/`** — read `SKILL.md` inside a skill directory before invoking that skill.

### Tool Usage

- **Batch independent calls** — when multiple `read` or `bash` calls have no dependencies, issue them together in one turn.
- **`edit` over `write`** — use `edit` for targeted changes. Use `write` only for new files or complete rewrites.
- **Merge adjacent edits** — if two changes touch the same or nearby lines, merge into one `edit` call with multiple `edits[]` entries. Each `edits[].oldText` matches the original file, not incrementally.
- **Small oldText** — make `oldText` as short as possible while still being unique in the file. Don't pad with large unchanged regions.
- **Verify after changes** — after editing code, always run the relevant verify command (typecheck or test) before claiming success.

### Escalation

- **Ask before large changes** — if a change spans 3+ files or introduces new architecture, pause and confirm the approach with the user.
- **Surface ambiguity** — if requirements are unclear or there are multiple valid approaches, present options rather than guessing.
- **Auto-proceed on mechanical fixes** — typo fixes, formatting, updating stale references, single-line corrections: just do them.

## Reliability & Observability

### Async & Concurrency

- **async/await only** — no raw `.then()`/`.catch()` chains. Every Promise must be awaited or explicitly handled (e.g., `Promise.allSettled` for fire-and-forget with error logging).
- **Structured concurrency** — use `Promise.all` / `Promise.allSettled` for parallel work with a clear, bounded lifecycle. Never fire-and-forget without error handling.
- **Cancellation** — long-running operations (LLM calls, network requests) must accept `AbortSignal`. Use `AbortController` for timeouts and user-initiated cancellation.
- **Explicit ordering** — when tool calls depend on prior results, make the dependency graph explicit in code. Do not rely on implicit ordering from `await` to mask hidden dependencies.
- **Rate limiting** — batch concurrent LLM calls with awareness of provider rate limits. Use a concurrency limiter (e.g., `p-limit`) rather than unbounded `Promise.all` against external APIs.

### Error Handling

- **No silent failures** — every `catch` block must either recover, rethrow with context, or log. Empty `catch {}` is banned.
- **Error classification** — distinguish three categories:
  - *Retryable* (rate limit, network timeout, temporary unavailability) — retry with exponential backoff and jitter.
  - *Degradable* (tool unavailable, optional feature unsupported) — fall back to a simpler path or inform the user, do not crash.
  - *Fatal* (auth failure, invalid config, programming error) — fail fast and report clearly.
- **Error enrichment** — wrap errors with context before rethrowing: what was being attempted, with what inputs. Use `Error.cause` chaining.
- **User vs system errors** — system errors (LLM API failure, network issues) must not leak raw stack traces to the user. Present a clear, actionable message.
- **Tool errors** — a tool that throws must not crash the agent loop. Catch, log, and return a structured error result to the LLM so it can decide the next step.

### Logging & Observability

- **Structured logging** — log as JSON objects, not plain strings. Every log entry must include at minimum: `level`, `message`, `timestamp`, and `traceId`.
- **Trace ID propagation** — each user request or agent run generates a `traceId` carried through all downstream calls (LLM API, tools, skills). Enables end-to-end tracing.
- **Log levels**:
  - `debug` — detailed internal state, prompt contents, tool inputs/outputs (verbose, development only).
  - `info` — key lifecycle events: agent run started/completed, tool calls, skill invocations.
  - `warn` — recoverable errors, retries, fallbacks triggered.
  - `error` — failures that need attention: LLM API errors, tool crashes, assertion failures.
- **Never log secrets, API keys, or PII** — sanitize before logging. Redact known sensitive fields (keys, tokens, emails, IPs).
- **Key metrics** — track and expose: LLM call latency (p50/p95), token consumption per run, tool call success rate, agent run duration, retry count.
- **Debug toggle** — a single env var or config flag that enables `debug` level and full prompt logging without code changes.

## Plan Before Code

Non-trivial changes require a written plan before implementation. Skip the plan only for typo fixes, single-line changes, or trivial renames.

### When to plan

Write a plan when ANY of these apply:
- New feature or module
- Multiple files will change
- Design decisions are unresolved (API surface, data flow, routing)
- The change affects existing architecture or interfaces
- More than ~50 lines of new code

### How to plan

1. **Resolve ambiguity** — for complex design decisions, use the brainstorming skill (`/brainstorming`) to explore the decision space before committing to an approach.
2. **Enter plan mode** — use `EnterPlanMode` to explore the codebase and design the approach.
3. **Write the plan** — save to `.claude/plans/<slug>.md`. The plan file must include:
   - **Context** — why this change, what problem it solves
   - **Design Decisions** — key choices and their rationale (grilling output)
   - **Execution Graph** — see format below. Each node has a unique integer ID so it can be referenced during review and adjustment.
   - **Out of Scope** — what's explicitly NOT included
   - **Verification** — end-to-end test command
4. **Get approval** — use `ExitPlanMode` to present the graph. The user can reorder, merge, or split nodes by ID before approving.

### Execution Graph Format

Every plan must include a graph of implementation steps. Two parts: a node table and a layered dependency diagram.

**Node Table** — each row is one step:

```
| ID | Name | Files | Interfaces | Exit Criteria | Contract Test | Verify | DependsOn |
|----|------|-------|------------|---------------|---------------|--------|-----------|
| 1  | 核心类型 | graph/types.ts | Consumes: Logger; Produces: Graph | create() returns Result | test/types.contract.test.ts | npm test | - |
```

- **ID**: unique integer. Used for cross-referencing and adjustment ("move 4 before 3").
- **Name**: 2-4 word label.
- **Files**: concrete paths to create or modify.
- **Interfaces**: what this node Consumes (from earlier nodes, with exact signatures) and Produces (for later nodes, with exact signatures).
- **Exit Criteria**: concrete, falsifiable outcomes the implementation must satisfy — "duplicate email returns UserError.DUPLICATE", not "add error handling".
- **Contract Test**: path to a test file exporting `contractSuite`. Required for every node whose Interfaces Produces block is consumed by other nodes. Exercises only the Produces interface.
- **Verify**: the command that proves this step is done (typecheck, test, build).
- **DependsOn**: list of node IDs this node depends on. Empty = can run in first group.

**Dependency Diagram** — layered ASCII layout. Nodes on the same line have no dependencies on each other and can run concurrently. A node on a lower line depends on all nodes connected from the line above.

```
[1]

[2]

[3]  [4]  [5]  [6]

[7]       [8]
```

**Concurrent Groups** — derived from the diagram. Each group runs in parallel; groups run sequentially.

```
G1: [1]
G2: [2]
G3: [3, 4, 5, 6]      ← no mutual dependencies, run together
G4: [7, 8]
```

**Rules for decomposing into nodes:**
- Each node should touch one or a few closely-related files
- Maximize concurrency: if two steps share no dependencies, put them on the same layer
- A node should take roughly 5-30 minutes — split anything larger
- Every node has a verify command — no "just write code" steps
- Nodes that Produce interfaces consumed by other nodes must include a Contract Test
- Nodes on the same line dispatch in parallel; select model per node based on complexity (cheap for mechanical 1-2 file nodes, mid-tier for integration, capable for design-sensitive)

### What a good plan looks like

- The dependency graph shows clear concurrent groups — no bottlenecks where 1 node blocks 5 others
- Each node is independently verifiable
- Nodes with Produced interfaces include contract tests
- Covers both the happy path and edge cases
- Scopes what's out of scope as clearly as what's in

### Plan → Execution

After approval:
1. Create one task per concurrent group (G1→task, G2→task, ...)
2. Within each group, nodes run in parallel (spawn subagents or fan out writes)
3. Contract tests gate group boundaries — Group N+1 not dispatched until Group N's contract suites pass
4. Each node's verify command must pass before marking the group done
5. If a node fails, fix it before moving to the next group
6. Use `subagent-driven-development` for parallel group dispatch; use `executing-plans` for inline sequential execution

## Git Conventions

### Commits

- Message format: `{feat,fix,docs}[(scope)]: <message>`
- Scope examples: `ai`, `agent`, `skills`, `tui`, `cli`
- Only commit files you changed this session; stage explicit paths — never `git add -A` or `git add .`
- Never commit unless asked

### Branches

- Feature branches from main: `feature/<description>` or `fix/<description>`
- Never force push, never `git reset --hard`

## GitHub Operations

- **Default to `gh` CLI** for all GitHub-related searches, analysis, and queries — do NOT use `web_search` or `web_fetch` for GitHub content
- Use `gh search issues` / `gh search prs` to find issues and pull requests
- Use `gh issue view` / `gh pr view` to inspect specific items
- Use `gh api` for advanced GitHub API queries (e.g., `gh api /repos/{owner}/{repo}/...`)
- Use `gh repo view` for repository metadata and analysis
- Use `gh browse` to open GitHub URLs in browser when needed
- For searching code on GitHub: `gh search code`
- Always use `--json` flag with `gh` commands for structured output when available
- When searching, narrow results with flags like `--limit`, `--label`, `--author`, `--state`
- Before fetching external GitHub content via `web_fetch`, check if `gh` can provide the same data

## Dependency Management

- Direct external deps pinned to exact versions (`npm install --save-exact`)
- Never run lifecycle scripts directly — use `--ignore-scripts`
- Refresh lockfile: `npm install --package-lock-only --ignore-scripts`
- Treat dependency changes as reviewed code; audit before committing

## Extension System

Extensions are independent packages that plug into the agent runtime. They should:
- Be self-contained in `extensions/` or as separate packages
- Not bloat the core — the core is intentionally minimal
- Use documented hook points for integration
- Include their own tests and documentation

## Key References

- Upstream Pi project: https://github.com/earendil-works/pi
- Pi documentation: https://pi.dev/docs/latest
- Pi AGENTS.md (contributor guidelines): https://github.com/earendil-works/pi/blob/main/AGENTS.md
- RFCs for larger changes: https://rfc.earendil.com
