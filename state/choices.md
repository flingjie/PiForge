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
