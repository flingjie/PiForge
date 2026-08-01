---
name: arena-plan
description: Plan with Design Arena — generates a Plan, runs multi-agent design debate, produces a TODO graph, and executes it.
---

# Arena Plan

Plan a feature with built-in design debate. After `writing-plans` generates the Plan, the Design Arena battles every `## Design Decision:` section with multiple architect agents (speed, maintain, minimal) before finalizing.

## Usage

/arena-plan <feature description>

## Workflow

1. **Plan Generation** — invoke `superpowers:writing-plans` to create the initial Plan.
2. **Design Arena** — call `runPipeline` from `@piforge/agent`:
   - Every `## Design Decision:` section gets debated by 3 core architects
   - A Critic reviews all solutions
   - A Synthesizer fuses the best approach
   - Output: revised Plan + TODO Graph
3. **Execution** — call `superpowers:subagent-driven-development` with the TODO Graph:
   - Tasks execute by concurrent group
   - Failures retry, downstream dependencies skip

## Output

- `.claude/arena/<feature>/plan.md` — debated and revised design
- `.claude/arena/<feature>/todo.md` — executable task graph
- Execution report with completion/failure/skip counts
