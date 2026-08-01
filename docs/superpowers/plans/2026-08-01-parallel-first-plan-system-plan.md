# Parallel-First Plan System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify three diverging plan formats into a single node-spec format that drives parallel group dispatch, replacing the TDD micro-step task list in writing-plans and enabling concurrent subagent execution in subagent-driven-development.

**Architecture:** Three file modifications — writing-plans/SKILL.md (output format), subagent-driven-development/SKILL.md (execution model), CLAUDE.md (convention docs). Nodes 1 and 2 are independent; Node 3 depends on both.

**Tech Stack:** Markdown documentation only — no code changes.

## Global Constraints

- Plan uses the node spec format defined in the parent spec (docs/superpowers/specs/2026-08-01-parallel-first-plan-system-design.md)
- Contract test suite exported name: `contractSuite`
- Plan save path: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Dependency graph notation uses ASCII layered layout
- No emojis in any committed content
- Keep answers short, no fluff

---

## Dependency Graph

```
[1]  [2]

[3]
```

## Concurrent Groups

```
G1: [1, 2]
G2: [3]
```

---

### Node 1: writing-plans format switch

**Files:**
- Modify: `.pi/skills/superpowers/skills/writing-plans/SKILL.md`

**Interfaces:**
- Consumes: nothing
- Produces: Node spec format section (referenced by Node 3's CLAUDE.md update)

**Exit Criteria:**
- "Bite-Sized Task Granularity" section replaced with node spec format description
- "Task Structure" section replaced with node spec template (Files, Interfaces, Exit Criteria, Contract Test, Verify, DependsOn)
- "No Placeholders" section updated — no references to "Python code blocks" or "test code", adapted for node spec format
- "Task Right-Sizing" section kept but wording adjusted to fit node-based tasks (remove "test cycle" reference, replace with "verify cycle")
- All other sections (Plan Document Header, Scope Check, File Structure, Self-Review, Test Strategy Review Gate, Execution Handoff) preserved unchanged
- Frontmatter (name, description) unchanged

**Contract Test:** Not applicable — this node produces no executable interface consumed by other nodes.

**Verify:** Read the file and confirm:
```bash
# Check that the old TDD template is gone and new node spec template is present
grep -c 'Step 1: Write the failing test' .pi/skills/superpowers/skills/writing-plans/SKILL.md
# Expected: 0

grep -c 'Interfaces:' .pi/skills/superpowers/skills/writing-plans/SKILL.md
# Expected: >= 1

grep -c 'Exit Criteria:' .pi/skills/superpowers/skills/writing-plans/SKILL.md
# Expected: >= 1

grep -c 'Contract Test:' .pi/skills/superpowers/skills/writing-plans/SKILL.md
# Expected: >= 1
```

**DependsOn:** []

---

### Node 2: subagent-driven-development parallel dispatch

**Files:**
- Modify: `.pi/skills/superpowers/skills/subagent-driven-development/SKILL.md`

**Interfaces:**
- Consumes: nothing
- Produces: Parallel group dispatch section, contract test gate section (referenced by Node 3's CLAUDE.md update)

**Exit Criteria:**
- "Core principle" updated: "Fresh subagent per task" → "Fresh subagent per node; parallel dispatch within groups"
- "Never dispatch multiple implementation subagents in parallel (conflicts)" removed — replaced with parallel group dispatch rules
- New section "Contract Test Gate" added between group dispatch and task review, covering:
  - Controller validates group N's contract suites before dispatching group N+1
  - Failed gate → failing node re-enters fix loop, next group not dispatched
  - Gate is optimization: catches failures before dependent subagents are dispatched
  - Pre-flight validation within each dependent subagent (redundant with gate, final safeguard)
- "The Task Loop" renamed to "The Group Loop" — steps restructured:
  - Step 1: Resolve groups from dependency graph
  - Step 2: For each group, dispatch all nodes in parallel
  - Step 3: Wait for all to complete (any order, each has own fix loop)
  - Step 4: Contract gate
  - Step 5: Next group or done
- Per-node review, fix loop, ledger rules preserved
- Process diagram updated to show parallel dispatch and contract gate
- "When to Use" section updated: decision tree references parallel dispatch
- Final review and finishing-a-development-branch sections unchanged

**Contract Test:** Not applicable — this node produces no executable interface consumed by other nodes.

**Verify:** Read the file and confirm:
```bash
# Old sequential-only rule must be gone
grep -c 'Never dispatch multiple implementation subagents in parallel' .pi/skills/superpowers/skills/subagent-driven-development/SKILL.md
# Expected: 0

# New parallel dispatch must be present
grep -c 'parallel' .pi/skills/superpowers/skills/subagent-driven-development/SKILL.md
# Expected: >= 1

# Contract gate must be present
grep -c 'Contract Test Gate\|contract test gate\|contract gate' .pi/skills/superpowers/skills/subagent-driven-development/SKILL.md
# Expected: >= 1

# Group loop must be present
grep -c 'Group Loop\|group loop' .pi/skills/superpowers/skills/subagent-driven-development/SKILL.md
# Expected: >= 1
```

**DependsOn:** []

---

### Node 3: CLAUDE.md plan format update

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Node spec format (from Node 1), parallel dispatch model (from Node 2) — used to ensure CLAUDE.md accurately describes the final system

**Exit Criteria:**
- Node Table format extended: columns for Interfaces, Exit Criteria, Contract Test added
- Example row updated to show the new columns
- Description of each column added below the table
- "Dependency Diagram" section unchanged
- "Concurrent Groups" section preserved
- "Rules for decomposing into nodes" updated:
  - "A node should take roughly 5-30 minutes" stays
  - Add: "Nodes that Produce interfaces must include a contract test"
  - Add: "Nodes on the same line dispatch in parallel; use model selection per node based on complexity"
- "Plan → Execution" section updated:
  - "Within each group, nodes run in parallel" stays
  - Add: "Contract tests gate group boundaries — Group N+1 not dispatched until Group N's contract suites pass"
  - Add: "Use subagent-driven-development for parallel group dispatch; use executing-plans for inline sequential execution"
- "What a good plan looks like" updated: add "Nodes with Produced interfaces include contract tests"
- Rest of CLAUDE.md (unrelated sections) preserved unchanged

**Contract Test:** Not applicable — CLAUDE.md is documentation, not code.

**Verify:** Read the file and confirm:
```bash
# New columns must be present
grep -c 'Exit Criteria' CLAUDE.md
# Expected: >= 1

grep -c 'Contract Test' CLAUDE.md
# Expected: >= 1

# Old resource-heavy format description should not be the only one
grep -c 'Interfaces' CLAUDE.md
# Expected: >= 1
```

**DependsOn:** [1, 2]
