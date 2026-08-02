---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each node, interfaces, exit criteria, contract tests, and verify commands. Give them the whole plan as a node graph with concurrent groups. DRY. YAGNI. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill at execution time.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own verify cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the node whose
deliverable needs them; split only where a reviewer could meaningfully
reject one node while approving its neighbor. Each node ends with an
independently testable deliverable.

## Node Spec Format

Every task in the plan is a node with exactly these fields. Each node is a
self-contained unit that a subagent implements, tests, and verifies
independently.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan node-by-node.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every node's requirements implicitly
include this section.]

## Dependency Graph

[ASCII layered diagram — nodes on same line have no mutual deps, run in parallel]

## Concurrent Groups

[Groups derived from the diagram — each group runs sequentially, nodes within a group run in parallel]

---
```

### Field specifications

| Field | Required | Description |
|-------|----------|-------------|
| Files | Yes | Exact paths for create/modify/test. Subagents use these to scope their context. |
| Interfaces | Yes | Consumes and Produces with exact TypeScript signatures. This is the contract between nodes. Must match how dependent nodes reference these types. |
| Exit Criteria | Yes | What "done" means beyond the verify command. Tests should prove each criterion is met. Each criterion must be concrete and falsifiable. |
| Contract Test | If Produces | Path to a test file that exports a `contractSuite` function. The suite exercises only the Produces interface, not internals. Required whenever a node produces an interface consumed by other nodes. |
| Verify | Yes | Single bash command. Must pass for the node to be complete. |
| DependsOn | No | List of node IDs this node depends on. Empty or absent = no dependencies (can run in first group). |

### Node template

````markdown
### Node N: Name

**Files:**
- Create: `exact/path/to/new.ts`
- Modify: `exact/path/to/existing.ts`
- Test: `tests/exact/path/to/test.ts`

**Interfaces:**
- Consumes: `TypeName` from Node N (exact signature)
- Produces: `TypeName { method(args): ReturnType }` (exact signature)

**Exit Criteria:**
- Bulleted list of concrete, verifiable conditions
- Each must be falsifiable — "returns typed errors" is not enough; "duplicate email returns UserError.DUPLICATE" is

**Contract Test:** `tests/path/to/contract.test.ts` exports `contractSuite`
- Required for every node that Produces an interface consumed by other nodes

**Verify:**
```bash
cd packages/agent && npx vitest run test/path/to/test.ts
```

**DependsOn:** [list of node IDs]
````

### Exit Criteria conventions

Exit criteria specify what outcomes are required. The subagent designs its own
test strategy to prove each criterion. Each criterion must be concrete and
falsifiable.

Good:
- `create() returns Result<User, UserError> — never throws, even on unexpected input`
- `Duplicate email returns UserError.DUPLICATE, not a generic error`

Bad:
- `Add error handling` (vague)
- `Write tests for create` (describes process, not outcome)
- `It works` (not falsifiable)

### Contract Test rules

A contract test is the parallel-safety mechanism. Nodes that Produce interfaces
must include a contract test that exercises the interface exactly as downstream
consumers will use it. The test file exports a `contractSuite` function:

- Tests only the Produces signature — no internal methods, private state, or implementation details
- Self-invoke at the bottom of the file — `vitest run` on the test file proves the implementation matches the contract
- Downstream nodes import and run the contract suite before starting their own implementation
- Contract violation halts the dependent node before any work begins

## No Placeholders

Every field in every node must contain the actual content an implementer
needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases" (too vague for exit criteria)
- "Similar to Node N" (repeat the full spec — the implementer may read nodes out of order)
- Exit criteria that describe process instead of outcome ("write tests for X" is wrong; "X returns typed errors for invalid input" is right)
- Nodes that produce interfaces without a Contract Test field
- References to types, functions, or methods not defined in any node's Interfaces block

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a node that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later nodes match what you defined in earlier nodes? A function called `clearLayers()` in Node 3 but `clearFullLayers()` in Node 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no node, add the node.

## Rubric Self-Score

After self-review, score the plan against `.pi/rubric-checklist.md`. Fill in the Scoring Summary table in the checklist file (or inline in the plan). The plan must score >= "ok" on all 9 dimensions before presenting the Test Strategy Review Gate. If any dimension scores "poor", revise the plan and re-score.

Reference the checklist: `.pi/rubric-checklist.md` contains the full 9-dimension rubric with poor/ok/good criteria.

## Test Strategy Review Gate

After self-review passes, present the test strategy to the user for confirmation
BEFORE saving the plan. This gate ensures the test approach is correct before the
plan is frozen.

### What to Present

Extract from the plan and present in three sections:

**1. Test Case Inventory** — every test case in the plan, one line each:

```
| # | Test Name | What It Verifies | File |
|---|-----------|-----------------|------|
| 1 | writes pipeline index page | File content contains correct header and plan link | test/trace/store.test.ts |
| 2 | renders multiple decisions | Two decisions both appear in arena trace | test/trace/store.test.ts |
| 3 | does not throw on impossible path | Trace failure is caught, never propagates | test/trace/store.test.ts |
```

**2. Spec Coverage Map** — each spec requirement mapped to at least one test:

```
| Spec Requirement | Covered By Test(s) |
|-----------------|-------------------|
| Arena trace page with decisions | #4, #5 |
| Best-effort error handling | #9 |
| Pipeline ID in timestamp-hex format | #10, #11 |
```

**3. Edge Cases** — boundary conditions explicitly tested or noted as deferred:

```
| Edge Case | Status |
|-----------|--------|
| Empty synthesis (no decisions) | Tested (#X) |
| Read-only output directory | Tested (#Y) |
| null planPath | Tested (#Z) |
| Concurrent pipeline runs | Deferred (future) |
```

### Gate Interaction

After presenting the three sections, ask:

> "Test strategy above. Any missing cases, wrong coverage, or edge cases you want added before I save the plan?"

Wait for the user's response. If they request changes, return to the plan and
add/modify tests. Re-run self-review, then re-present the updated test strategy.
Only proceed to saving the plan once the user confirms.

### What This Gate Is NOT

- It is NOT a general "review the whole plan" gate — that happens in design-arena
- It is NOT an approval of the implementation logic — only the test approach
- It does NOT replace in-plan test code — it extracts summaries from it
- It applies to ALL plans, including "simple" ones — even a single-test plan
  gets this gate

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per node, review between nodes, fast iteration

**2. Inline Execution** - Execute nodes in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per node + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
