---
name: arena-plan
description: Plan with Design Arena — confirms requirements, suggests review perspectives, runs multi-agent design debate, produces a TODO graph, and executes it.
---

# Arena Plan

Full design workflow: confirm requirements → suggest review perspectives → multi-agent debate → design review → execute.

## Usage

/arena-plan <feature description>

## Workflow

1. **Requirements** — confirm the feature scope and identify decision points. The requirements doc should contain a `## Decision Points` section with bullet items:

   ```markdown
   ## Decision Points
   - title: description
   - title: description
   ```

2. **Perspective Suggestions** — call `runPipeline({ mode: "perspectives" })` from `@piforge/agent`. The LLM analyzes each decision point and suggests which architect personas should review it, with reasons. Present the suggestions to the user for confirmation.

3. **Design Arena** — after user confirms perspectives, call `runPipeline({ mode: "arena-only", perspectives: confirmed })`:

   - Each decision point gets debated by the confirmed architect personas
   - A Critic reviews all generated solutions
   - A Synthesizer fuses the best approach into a unified design
   - Output: revised Plan + TODO Graph + Debate Summary

4. **Design Review** — present the Debate Summary, revised Plan, and TODO Graph to the user. Let them:
   - Review each decision and the chosen approach
   - See the full debate trace (agent proposals, scores, critic feedback)
   - Approve or request changes

5. **Execution** — after design approval, call `runPipeline({ mode: "execute-only", todoMarkdown })`:

   - Tasks execute by concurrent group (respecting dependencies)
   - Each node runs with retry (configurable maxRetries)
   - Failures retry; downstream dependencies skip on upstream failure
   - Status updates written to the todo file

## Output

- `.claude/arena/<feature>/plan.md` — debated and revised design
- `.claude/arena/<feature>/todo.md` — executable task graph
- Debate summary showing all agent proposals, scores, critic feedback, and final decisions
- Execution report with completion/failure/skip counts

## Quick Mode

For fast iteration, skip the review gates:

/arena-plan --fast <feature>

Equivalent to `runPipeline({ mode: "full" })` — runs perspectives, arena, and execution in one shot with defaults.
