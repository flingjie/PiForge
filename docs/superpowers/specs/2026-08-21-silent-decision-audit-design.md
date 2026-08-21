# Silent Decision Audit (choices.md)

Date: 2026-08-21

## Context

PiForge's decision governance is fully built for the *ex-ante* half: `grilling` and `design-arena` force decisions before implementation, and `state/decisions/TEMPLATE.md` records the ones a human makes (options / rejected / chosen / rubric / revisit-trigger). But the *ex-post* half is missing.

When Phase 3 dispatches implementer subagents via `subagent-driven-development`, those agents make implicit decisions wherever the spec is silent — data shape, storage, retry strategy, shared tables, dependency choice, error-handling pattern. These are not bugs (tests are green), but they are exactly the choices that hurt three months later when requirements change. Nothing in Phase 4 currently surfaces them: `reflect` reflects on the *user's* psychology, not the code's silent decisions, and `records.jsonl` (0 bytes) is never fed.

This spec adds the missing ex-post audit, adapted from dzhng's `audit-choices` skill. The guiding principle: **review decisions, not diffs** — and do it *separately* from the implementer to prevent self-justification.

**Goal:** After a non-trivial implementation, a separate audit agent surfaces every decision the implementer made in the spec's silence, records it to a persistent ledger, presented sorted by lowest confidence first, and hands `needs-user` items back to the human for push-back.

## Confirmed Constraints

| Dimension | Decision |
|-----------|----------|
| Deliverable | Lightweight integration — no new skill, no code logic |
| Auditor | Separate audit agent, persona `maintain`, never the implementer (`speed`) |
| Trigger | Only non-trivial changes — reuses the "Plan Before Code" threshold (multi-file / new module / architecture change / ~50+ lines) |
| Ledger | New `state/choices.md`, sibling to `state/decisions/` |

## Architecture

Three files, zero new skills, zero code logic.

| File | Action | Content |
|------|--------|---------|
| `state/choices.md` | new | Ledger body. Header carries a self-describing entry template; entries appended chronologically below; sorted lowest-confidence first at presentation time |
| `docs/audit-choices.md` | new | Audit runbook: agent persona, input sources, the full prompt fed to the auditor, gate rules |
| `CLAUDE.md` | edit | Phase 4 (Close) gains an `audit` step before `finish`, one line pointing to `docs/audit-choices.md` |

Untouched: `subagent-driven-development` / `executing-plans` dispatch internals, `grilling`, `arena`, `reflect`. `decisions/` (ex-ante, human-made) and `choices.md` (ex-post, AI-made-in-silence) sit side by side without mixing semantics.

## Data Flow

```
implementation complete (non-trivial change)
  → Phase 4 audit gate
  → dispatch 1 audit agent, persona `maintain` (≠ implementer `speed`)
  → inputs: git diff + commit + records.jsonl + plan file (if any)
  → output: append to state/choices.md chronologically; present sorted confidence ascending (low first)
  → Close report lists needs-user entries; sound entries carry a promote suggestion
  → human pushes back only 3-5 items
```

**Reconciliation with user_dna ("insert a gate before, don't append review after"):** the audit is *mechanically* post-hoc — you can only see silent decisions after the code exists — but its *output* is a pre-gate for the next slice. `sound` entries bank into spec/constitution and become next round's premises; `needs-user` entries become the next confirmation gate. It serves the next round's "before", not this round's "after".

## Entry Schema

`state/choices.md` header template (self-describing). Each entry: 6 required fields + 2 conditional.

```markdown
### [decision headline] (one line)

- **When**: <which pass / commit / implementer node>
- **The choice**: <ELI5: trigger event → current behavior → rejected alternatives → key-term definitions, pseudocode allowed>
- **The gap**: <what the spec was missing that forced the guess>
- **The reach**: <which downstream slices this poisons>
- **Verdict**: `sound` | `unsound` | `needs-user`
- **Confidence**: `low` | `medium` | `high`
- **If unsound**: <the general property that should hold, not a concrete patch>
- **If needs-user**: <reversible temporary choice + how to roll back>
```

Presentation sorting rule: **confidence ascending, low first**; within equal confidence, group by verdict — `needs-user` first, `unsound` second, `sound` last.

## Error Handling & Boundaries

- **Empty ledger**: a non-trivial feature yielding 0 entries means the audit was not deep enough. Flag it explicitly in the Close report; never treat as "nothing to see".
- **Unreadable diff / empty records.jsonl**: auditor degrades to reading commit + plan only; still records, but appends "input incomplete, confidence downgraded".
- **Clustering signal**: ≥3 homogeneous decisions → upstream spec is too vague; recommend re-slicing, not re-auditing.
- **Banking**: `sound` entries, once human-approved, promote — into `state/constitution.md` as a new principle (or a new "Banked Decisions" section), isomorphic to the existing `bootstrap.json` promotion loop. `needs-user` entries carry a written rollback path.

## Out of Scope

- No new skill package — audit runs as a pipeline step driven by `docs/audit-choices.md`.
- No automated diff *analysis* beyond what the LLM auditor reads; no persistent decision database (the ledger is `state/choices.md`, append-only).
- No change to `subagent-driven-development` / `executing-plans` internals.
- No modification to existing `decisions/` records; ex-ante and ex-post ledgers stay separate.

## Verification

End-to-end: after a non-trivial implementation, run the Phase 4 audit gate. Expected — `state/choices.md` gains ≥1 entry with all 6 required fields; `needs-user` entries appear first in the Close report with a rollback path; a trivial (typo / single-line) change does not trigger the audit.
