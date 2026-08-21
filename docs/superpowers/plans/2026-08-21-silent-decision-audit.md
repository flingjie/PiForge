# Silent Decision Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ex-post audit step to the pipeline that surfaces decisions an implementer made where the spec was silent, recording them to `state/choices.md`.

**Architecture:** Three-file documentation change, no new skill, no code logic. `state/choices.md` is the append-only ledger (schema first); `docs/audit-choices.md` is the runbook (persona, inputs, auditor prompt, gate rules); `CLAUDE.md` gains an `audit` step in Phase 4.

**Tech Stack:** Markdown only. Verification is structural (grep / read-back), not unit tests — there is no runnable code.

## Global Constraints

- No new skill package; audit runs as a pipeline step driven by `docs/audit-choices.md`.
- Ex-ante (`state/decisions/`) and ex-post (`state/choices.md`) ledgers stay separate; never mix semantics.
- Audit agent persona is `maintain`; never the implementer (`speed`).
- Trigger threshold reuses the "Plan Before Code" rule: multi-file / new module / architecture change / ~50+ lines.
- Commit message format `docs[(scope)]: <message>`; stage explicit paths only.

---

### Task 1: Ledger schema (`state/choices.md`)

**Files:**
- Create: `state/choices.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the entry schema (6 required fields: `When`, `The choice`, `The gap`, `The reach`, `Verdict`, `Confidence`; 2 conditional: `If unsound`, `If needs-user`). Tasks 2 and 3 reference these field names verbatim.

- [ ] **Step 1: Write the ledger file**

Create `state/choices.md`:

```markdown
# Choices Ledger

Append-only record of decisions an implementer made where the spec was silent.
Ex-ante decisions (the ones a human made) live in `state/decisions/` — this
file is ex-post only, and never mixes with them.

Entries are appended chronologically as the audit finds them. When presenting
to a human, sort by confidence ascending (low first) and group by verdict
(`needs-user` → `unsound` → `sound`).

## Entry Template

6 required fields + 2 conditional.

### [decision headline] (one line)

- **When**: which pass / commit / implementer node
- **The choice**: ELI5 — trigger event → current behavior → rejected alternatives → key-term definitions (pseudocode allowed)
- **The gap**: what the spec was missing that forced the guess
- **The reach**: which downstream slices this poisons
- **Verdict**: `sound` | `unsound` | `needs-user`
- **Confidence**: `low` | `medium` | `high`
- **If unsound**: the general property that should hold (not a concrete patch)
- **If needs-user**: reversible temporary choice + how to roll back

## Entries

(no entries yet)
```

- [ ] **Step 2: Verify the schema fields are present**

Run: `grep -nE '\*\*(When|The choice|The gap|The reach|Verdict|Confidence)\*\*' state/choices.md`
Expected: 6 lines, one per required field, in the order listed above.

- [ ] **Step 3: Commit**

```bash
git add state/choices.md
git commit -m "docs: add choices ledger schema"
```

---

### Task 2: Audit runbook (`docs/audit-choices.md`)

**Files:**
- Create: `docs/audit-choices.md`

**Interfaces:**
- Consumes: the entry schema field names from Task 1 (`When`, `The choice`, `The gap`, `The reach`, `Verdict`, `Confidence`).
- Produces: the auditor prompt (referenced by name in Task 3), the trigger rule, the persona (`maintain`), the gate rules, and the output path `state/choices.md`.

- [ ] **Step 1: Write the runbook**

Create `docs/audit-choices.md`:

````markdown
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
````

- [ ] **Step 2: Verify the runbook sections are present**

Run: `grep -nE '^## (Trigger|Who Audits|Inputs|Auditor Prompt|Gate Rules|Output)$' docs/audit-choices.md`
Expected: 6 section headers.

Run: `grep -c 'state/choices.md' docs/audit-choices.md`
Expected: ≥2 (referenced in the intro and in the Output section).

- [ ] **Step 3: Commit**

```bash
git add docs/audit-choices.md
git commit -m "docs: add silent decision audit runbook"
```

---

### Task 3: Phase 4 audit gate (`CLAUDE.md`)

**Files:**
- Modify: `CLAUDE.md` (Phase 4 "Close" steps)

**Interfaces:**
- Consumes: Task 1 (the ledger path `state/choices.md`) and Task 2 (the runbook path `docs/audit-choices.md`).
- Produces: the pipeline step that dispatches the audit; renumbers `Finish` and `Reflect`.

- [ ] **Step 1: Insert the audit step into Phase 4**

In `CLAUDE.md`, find the Phase 4 "Steps" block and replace these three lines:

```
  4a. **Verify** — Run end-to-end verification. Confirm no regressions.
  4b. **Finish** — Use `finishing-a-development-branch` to decide: merge, PR, or keep as branch.
  4c. **Reflect** — Consider running `/reflect` to extract insights from the completed work.
```

with these four lines:

```
  4a. **Verify** — Run end-to-end verification. Confirm no regressions.
  4b. **Audit** — For non-trivial changes, dispatch a separate `maintain`-persona audit agent (never the implementer) to record silent decisions to `state/choices.md`. See `docs/audit-choices.md`. Skip for trivial changes.
  4c. **Finish** — Use `finishing-a-development-branch` to decide: merge, PR, or keep as branch.
  4d. **Reflect** — Consider running `/reflect` to extract insights from the completed work.
```

- [ ] **Step 2: Verify the step and its reference are in place**

Run: `grep -n '4b. \*\*Audit\*\*' CLAUDE.md`
Expected: one line, containing `state/choices.md` and `docs/audit-choices.md`.

Run: `grep -n '4d. \*\*Reflect\*\*' CLAUDE.md`
Expected: one line (renumbering took effect).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(agent): add Phase 4 audit gate for silent decisions"
```

---

## Self-Review

- **Spec coverage:** All three files from the spec's Architecture table map to Tasks 1-3. The 6-field schema, the auditor prompt, the trigger rule, the gate rules, and the banking note are all present. The `needs-user` rollback path and the empty-ledger flag are in Task 2's runbook.
- **Placeholder scan:** No TBD/TODO. Every step carries full file content.
- **Type consistency:** Field names `When`/`The choice`/`The gap`/`The reach`/`Verdict`/`Confidence` are identical across Task 1 and Task 2; paths `state/choices.md` and `docs/audit-choices.md` are identical across Tasks 1-3.
