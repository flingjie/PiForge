# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

PiForge is a smart assistant built on the [Pi Agent Harness](https://github.com/earendil-works/pi) — an open-source (MIT) TypeScript monorepo providing a unified LLM API, agent runtime, TUI library, and coding agent CLI. PiForge extends Pi with domain-specific tools, skills, and configurations to create a tailored intelligent assistant.

## Architecture (Planned)

Following Pi's layered separation of concerns, the monorepo will be structured as:

```
PiForge/
├── packages/
│   ├── ai/            # Multi-provider LLM API (extends @earendil-works/pi-ai or wraps it)
│   ├── agent/         # Agent runtime with tool calling and state management
│   ├── skills/        # Custom skills and tool definitions for the assistant
│   ├── tui/           # Terminal UI library (based on @earendil-works/pi-tui)
│   └── cli/           # CLI entry point for the smart assistant
├── scripts/           # Build/test helpers
├── docs/              # Project documentation
├── extensions/        # Extension modules for additional capabilities
├── tsconfig.base.json
├── biome.json
├── vitest.base.ts
└── package.json       # npm workspaces root
```

**Key design principles (from Pi):**
- **Self-extensible** — the assistant can explain itself and modify its own configuration
- **Provider abstraction** — `packages/ai` provides a unified interface over LLM providers (OpenAI, Anthropic, Google, etc.)
- **Sandboxing by composition** — no built-in permission system; use containerization patterns (Docker, Gondolin micro-VMs) for isolation
- **Skills as packages** — each skill or domain capability is an independent package that plugs into the agent runtime

## Tech Stack

- **Language:** TypeScript (strict)
- **Monorepo:** npm workspaces
- **Runtime:** Node.js, with Bun-compiled standalone binaries for distribution
- **Linting/Formatting:** Biome (`biome.json`)
- **Testing:** Vitest (`vitest.base.ts`)
- **Git hooks:** Husky (`.husky/`)

## Development Commands

```bash
# Install dependencies (no lifecycle scripts)
npm install --ignore-scripts

# Build all packages (with model data refresh)
npm run build

# Build offline (no network, uses cached model data)
npm run build:offline

# Lint, format, and type check
npm run check

# Run tests (skips LLM-dependent tests without API keys)
./test.sh

# Run tests with vitest CLI from a package root
npx vitest run path/to/test.test.ts

# Clean install for CI
npm ci --ignore-scripts
```

## Code Standards

### TypeScript

- **No `any`** — use proper types or `unknown`; never downgrade deps to fix type errors
- **Only erasable TypeScript syntax** — no `enum`, `namespace`, `module`, `import =`, `export =`, or parameter properties; use explicit fields with constructor assignments
- **Top-level imports only** — no `await import()`, dynamic type imports, or inline imports
- Inline single-call-site helpers rather than extracting them

### Code Quality

- Run `npm run check` after code changes (not docs) — this runs lint, format, and type check but NOT tests
- Never run `npm run build` or `npm test` unless explicitly requested
- Read files in full before making wide-ranging changes — don't rely on search snippets
- Don't hardcode key bindings; add defaults to shared keybinding configuration constants
- Never edit generated files directly — update the generator script and regenerate

### Tests

- Use `./test.sh` from repo root for non-e2e tests
- Run specific tests via `npx vitest` from the package root
- Regression tests: name them `<issue-number>-<short-slug>.test.ts` and place in `test/suite/regressions/`
- Test harnesses should use faux providers — no real provider API keys or paid tokens
- If you create or modify a test file, run it and iterate until it passes

### Style

- Keep answers short and concise
- No emojis in commits, issues, PRs, or code
- No fluff or cheerful filler
- Answer the user's question before making edits

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

1. **Enter plan mode** — use `EnterPlanMode` to explore the codebase and design the approach
2. **Resolve ambiguity** — for complex design decisions, use grilling (`/mattpocock-skills:grilling`) to walk the decision tree one question at a time. Each answer constrains the next question. Don't jump ahead.
3. **Write the plan** — save to `.claude/plans/<slug>.md`. The plan file must include:
   - **Context** — why this change, what problem it solves
   - **Design decisions** — key choices made and their rationale
   - **Implementation steps** — concrete, bite-sized, in dependency order
   - **Verification** — how to test end-to-end (specific commands)
4. **Get approval** — use `ExitPlanMode` to present the plan. Don't start coding until approved.

### What a good plan looks like

- References existing code patterns and files to reuse
- Names concrete files to create or modify
- Each step is independently verifiable
- Covers both the happy path and edge cases (error handling, degraded modes, cycle limits)
- Scopes what's out of scope as clearly as what's in

For larger features, pair the plan with a grilling session: the plan captures the *what* and *how*; grilling resolves the *why* for each design choice.

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

- Direct external deps pinned to exact versions (`.npmrc`: `save-exact=true`)
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
