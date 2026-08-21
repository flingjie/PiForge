# Silent Decision Audit

Run after a non-trivial implementation completes (Phase 4, before `finish`).
Surfaces decisions an implementer made where the spec was silent — not bugs,
not code review. Writes to `state/choices.md`.

## Trigger

Non-trivial only, reusing the "Plan Before Code" threshold: multi-file change,
new module, architecture change, or ~50+ lines. Trivial changes (typo,
single-line, mechanical fix) skip the audit.

## Who Audits

A separate audit agent, persona `maintain` (long-term maintenance, modularity,
dependency injection). Never the implementer (`speed`). Separation prevents
self-justification.

## Inputs

- `git diff` of the implementation
- the implementation commit(s)
- `state/records.jsonl` (may be empty — degrade gracefully, downgrade confidence)
- the plan file under `docs/superpowers/plans/` (if one exists)

## Auditor Prompt

Feed this verbatim to the audit agent:

---

You are a decision auditor. An implementer just completed a non-trivial change.
Your job is to surface every decision the implementer made where the
specification was silent. You are NOT reviewing code quality or finding bugs.

Read the diff, commits, plan, and records. For each implicit decision:

1. Identify it: data shape, storage, API shape, dependency choice, performance
   tradeoff, error-handling pattern, retry strategy, shared-table decision,
   design pattern.
2. Write an ELI5 entry with the 6 required fields from the template in
   `state/choices.md`. A reader with zero context (no code, no spec, no logs)
   must understand it.
3. Verdict:
   - `sound` — reasonable and defensible.
   - `unsound` — works but is fragile; state the general property that should
     hold, not a concrete patch.
   - `needs-user` — a genuine fork requiring human call; give a reversible
     temporary choice and a rollback path.
4. Confidence in whether the human will agree: `low` / `medium` / `high`.
5. If the diff or records are incomplete (empty `records.jsonl`, unreadable diff), append the note `input incomplete, confidence downgraded` to the affected entries.

Do NOT modify code. You only record.

---

## Gate Rules

- Empty ledger on a non-trivial feature = audit not deep enough; flag red in
  the Close report, never treat as "nothing to see".
- ≥3 homogeneous decisions = spec too vague; recommend re-slicing, not
  re-auditing.
- `sound` entries → propose promotion into `state/constitution.md` (new
  principle or a "Banked Decisions" section).
- `needs-user` entries → include a reversible temporary choice + rollback.

## Output

Append entries to `state/choices.md`. In the Close report, present entries
sorted confidence ascending (low first), grouped `needs-user` → `unsound` →
`sound`. Human pushes back only 3-5 items.
