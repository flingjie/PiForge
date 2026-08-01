# Parallel-First Plan System

Date: 2026-08-01

## Context

The current plan system has three diverging formats (CLAUDE.md node graph, writing-plans TDD task list, design-arena `todo.md`) connected through manual translation. The plan format explicitly models concurrency via dependency graphs and concurrent groups, but the execution skill (subagent-driven-development) enforces strictly sequential dispatch — "Never dispatch multiple implementation subagents in parallel (conflicts)." The parallelism the plan encodes is never exploited.

Additionally, the writing-plans format produces highly detailed TDD micro-steps (write test → run test (fail) → implement → run test (pass) → commit) designed for a single developer working linearly. This format precludes parallelism by design and makes plan-writing itself a bottleneck.

**Goal:** Unify into a single plan format that drives parallel execution natively, without sacrificing correctness guarantees.

## Architecture

Three changes to existing skills:

1. **writing-plans** — output format switches from TDD micro-step task list to node spec format
2. **subagent-driven-development** — execution loop changes from sequential to per-group parallel dispatch, with contract test gating between groups
3. **CLAUDE.md** — plan format description updated to match the unified node spec format

The dependency graph notation from CLAUDE.md and design-arena stays. The node spec format from design-arena's `todo.md` (ID, Name, Files, Verify, DependsOn, Status) is extended with Interfaces, Exit Criteria, and Contract Test.

## Node Spec Format

Every task in the plan is a node. Replaces the TDD micro-step task list.

```markdown
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
```

### Field specifications

| Field | Required | Description |
|-------|----------|-------------|
| Files | Yes | Exact paths for create/modify/test. Subagents use these to scope their context. |
| Interfaces | Yes | Consumes and Produces with exact TypeScript signatures. This is the contract between nodes. Must match how dependent nodes reference these types. |
| Exit Criteria | Yes | What "done" means beyond the verify command. Tests should prove each criterion is met. |
| Contract Test | If Produces | Path to a test file that exports a `contractSuite` function. The suite exercises only the Produces interface, not internals. |
| Verify | Yes | Single bash command. Must pass for the node to be complete. |
| DependsOn | No | List of node IDs this node depends on. Empty or absent = no dependencies (can run in first group). |

### Exit Criteria conventions

Exit criteria replace "edge case lists" from the TDD format. Instead of pre-specifying every test case, the plan specifies what outcomes are required. The subagent designs its own test strategy to prove each criterion.

Good exit criteria:
- `create() returns Result<User, UserError> — never throws, even on unexpected input`
- `Duplicate email returns UserError.DUPLICATE, not a generic error`
- `All callsites in user.ts use typed errors; no try/catch wrapping`

Bad exit criteria:
- `Add error handling` (vague)
- `Write tests for create` (describes process, not outcome)
- `It works` (not falsifiable)

## Parallel Execution Model

### Group dispatch

The dependency graph is parsed into concurrent groups. Nodes within a group have no mutual dependencies. All nodes in a group dispatch simultaneously.

```
[1]                    ← Group 1
[2]  [3]  [4]          ← Group 2 (no deps on each other, all depend on 1)
[5]                    ← Group 3 (depends on 2, 3, 4)
```

Execution:
1. Dispatch Group 1: Node 1 runs in isolation
2. Wait for Node 1 to complete (implement + self-test + review + fix loop)
3. Contract gate: validate Node 1's contract suite passes. If it fails, Node 1 re-enters fix loop — Group 2 is not dispatched until the gate clears
4. Dispatch Group 2: Nodes 2, 3, 4 dispatch simultaneously as independent subagents
5. Wait for all three to complete (any order, each has own fix loop)
6. Contract gate: validate each node's contract suite passes against its own code. Any failing node re-enters fix loop; siblings are unaffected. Group 3 not dispatched until all gates clear
7. Dispatch Group 3: Node 5 runs
8. Pre-flight: Node 5 validates Nodes 2, 3, 4's contract suites before starting its own work
9. Complete

### Rules

| Rule | Reason |
|------|--------|
| All nodes in a group dispatch simultaneously | Graph guarantees no mutual dependencies |
| Failed node does not kill siblings in same group | If Node 3 fails and Node 4 passes, Node 4 is committed. Only downstream nodes that depend on 3 are affected |
| Contract gate between groups | Controller validates Group N's contract suites before dispatching Group N+1. Gate failure blocks the next group and triggers fix loop for the failing node. This is an optimization — catches contract failures before dependent subagents are dispatched, avoiding wasted context |
| Pre-flight validation for dependent nodes | Each node in Group N+1 runs its dependencies' contract suites before starting implementation. Redundant with the contract gate — the gate catches failures early, pre-flight is the final safeguard inside the subagent's own context |
| Model selection per node | Within a group, mechanical nodes get cheap models; integration nodes get mid-tier; design-sensitive nodes get capable models |
| Review per node, parallel within group | Each node gets its own task review. Reviews within a group dispatch concurrently after all implementations complete |

### What stays from subagent-driven-development

- Task review cycle (spec compliance + quality) — but reviews parallelize within groups
- Fix loop with escalation (R rounds, breaker cap at 5)
- Ledger-based progress tracking
- Implementer prompt template and report file pattern
- Review package generation via `scripts/review-package`
- Final whole-branch review
- `finishing-a-development-branch` handoff

### What changes

| Old Rule | New Rule |
|----------|----------|
| "Never dispatch multiple implementation subagents in parallel" | "Dispatch all nodes in a group in parallel" |
| Tasks dispatched sequentially | Groups dispatched sequentially, nodes within groups in parallel |
| Reviews sequential | Reviews parallel within a group |
| Plan format: TDD micro-steps | Plan format: node specs with interfaces, exit criteria, contract tests |

## Contract Test Specification

The mechanism that makes parallel dispatch safe. A contract test exercises the interface a node Produces, exactly as downstream consumers will use it. It is exported so dependent nodes can validate their dependencies before starting.

### Format

```typescript
// test/services/user.contract.test.ts

import { describe, it, expect } from 'vitest';
import { UserService, UserError } from '../src/services/user';

/**
 * Contract Suite for UserService (Node 3)
 *
 * Downstream nodes run this suite before starting.
 * If it passes, the interface contract is satisfied.
 */
export function contractSuite(service: UserService) {
  describe('UserService contract', () => {
    it('create: valid input returns Ok<User>', () => {
      const result = service.create({ email: 'a@b.com', name: 'Alice' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeTypeOf('string');
        expect(result.value.email).toBe('a@b.com');
      }
    });

    it('create: duplicate email returns DUPLICATE', () => {
      service.create({ email: 'dup@b.com', name: 'A' });
      const result = service.create({ email: 'dup@b.com', name: 'B' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(UserError.DUPLICATE);
    });

    it('create: never throws', () => {
      expect(() => service.create(null as any)).not.toThrow();
    });

    it('findById: missing user returns NotFound', () => {
      const result = service.findById('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NotFound');
    });
  });
}

// Self-test: the implementation must pass its own contract
const service = new UserService(/* deps from dependency nodes */);
contractSuite(service);
```

### Rules

| Rule | Description |
|------|-------------|
| One contract suite per node that Produces an interface | No node that produces a consumed interface skips this |
| Tests only the Produces signature | No testing internal methods, private state, or implementation choices |
| Self-invoke in the file | `vitest run` on the test file must pass against the implementation |
| `contractSuite` is the exported name | Dependent nodes import by this name. Non-negotiable. |
| Dependent nodes run contract suites pre-flight | Before starting implementation, validate each dependency's contract suite passes against the actual code |
| Contract violation halts the dependent node | If a contract suite fails, the node reports the violation and does not start implementation |

### Dependency chain safety

```
Node 3 (UserService) produces contractSuite
    │
    ├── Node 3 self-test: contractSuite passes → Node 3 is complete
    │
    └── Node 5 (AuthService, depends on [3]) starts Group 3:
        │
        ├── Pre-flight: import { contractSuite } from Node 3's test file
        ├── Run contractSuite against actual UserService implementation
        ├── If passes → Node 5 proceeds with AuthService implementation
        └── If fails → Node 5 reports: "Contract violation in Node 3"
```

## File Layout

```
docs/superpowers/
  specs/
    YYYY-MM-DD-<topic>-design.md      # Spec (unchanged location)
  plans/
    YYYY-MM-DD-<feature>-plan.md       # Plan in node spec format (unchanged location)

.pi/skills/superpowers/skills/
  writing-plans/SKILL.md              # Updated: node spec format
  subagent-driven-development/SKILL.md # Updated: parallel group dispatch

CLAUDE.md                             # Updated: plan format description
```

## Out of Scope

- Changes to the design-arena skill (its `todo.md` format already matches the node spec)
- Changes to the brainstorming skill
- Multi-plan orchestration (running independent plans in parallel is a separate problem)
- Automatic model selection heuristics (manual selection per node in the plan)
- Git merge conflict resolution for parallel subagent commits (handled by git; subagents commit to isolated paths by design)

## Verification

End-to-end test: Write a 5-node plan with dependency graph `[1] → [2,3,4] → [5]`. Execute via subagent-driven-development. Verify:
1. Nodes 2, 3, 4 dispatch simultaneously
2. Each node's verify command passes independently
3. Contract suites gate the group boundaries
4. Node 5's pre-flight validates dependencies' contracts before implementation
5. Total execution time is approximately `max(time(2), time(3), time(4))` + overhead, not `sum(time(2), time(3), time(4))`
