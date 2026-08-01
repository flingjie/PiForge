---
name: design-arena
description: >
  Multi-agent adversarial design review. Use when the user wants to debate design
  decisions, review an implementation plan, resolve architecture tradeoffs, or
  generate a TODO execution graph from a plan. Triggers on: "/arena", "design
  arena", "design debate", "design review", "方案辩论", "设计评审", "设计决策",
  "架构评审", "multi-agent design", "debate this plan", "review my architecture".
  Also use when a plan has "## Design Decision:" sections that need resolution.
allowed-tools: web_fetch
---

# Design Arena

Adversarial multi-agent design review: pit contrasting architectural philosophies against each
other, let a critic tear them apart, then synthesize the best approach.

**Code reference**: `packages/agent/src/arena/` — the `@piforge/agent` library this skill is
based on. Read source files there for the full type definitions and prompt templates.

## When to Use

- User has an implementation plan with open design questions
- Multiple architectural approaches are plausible and need comparison
- User says "which approach is better for X?"
- User wants a TODO execution graph generated from a plan
- User types `/arena` or asks for a "design review"

Do NOT use for trivial decisions (pick a library name, choose a file structure). The Arena
adds overhead — use it when the decision has meaningful tradeoffs.

## Workflow

### Step 0: Load Constitution & Plan

1. **Constitution**: Read `state/constitution.md`. If missing, use the defaults from
   `packages/agent/src/constitution/defaults.ts` (embedded below in the Reference section).

2. **Plan**: The user provides a plan — either a file path, pasted markdown, or the most
   recent plan in `output/` or `.claude/plans/`.

3. Validate the plan has at least one `## Design Decision:` section. If not:
   > "这个计划没有 `## Design Decision:` 章节。Arena 需要至少一个待解决的设计决策。
   > 要不要我先帮你把计划里的开放问题标记出来？"

### Step 1: Extract Design Decisions

Parse the plan for all `## Design Decision: <title>` sections. Each becomes one sub-problem.
Show the user what was found:

> "从计划中提取到 [N] 个设计决策："
> 1. Database Selection
> 2. API Authentication Strategy
> ...

### Step 2: Multi-Agent Proposal Generation

For EACH design decision, simulate the 3 core agents from the constitution's Agent Pool.
Each agent receives: the sub-problem description, the original plan context, and the rubric.

**The 3 core personas and their design philosophies:**

| Persona | Philosophy |
|---------|-----------|
| **speed** | Fastest implementation. Minimal abstraction — every layer must justify its existence. Prefer well-known libraries. Cut scope aggressively. Optimize for time-to-working-code. |
| **maintain** | Long-term codebase health. Clear module boundaries with explicit interfaces. Composition over inheritance. Every module independently testable and replaceable. |
| **minimal** | YAGNI extremist. If a decision can be deferred, defer it. Fewer files, fewer interfaces, fewer abstractions = fewer bugs. The best code is the code you don't write. |

For each persona, produce:
- **proposal**: 2-3 paragraphs describing the approach
- **scores**: self-score on each rubric dimension (0-100)
- **rationale**: why this approach, what tradeoffs are accepted

Present proposals in a comparison table:

```
## Decision: Database Selection

| Dimension | speed | maintain | minimal |
|-----------|-------|----------|---------|
| Decoupling (20) | 60 | 85 | 70 |
| Maintainability (20) | 55 | 88 | 65 |
| Extensibility (15) | 50 | 80 | 45 |
| Testability (15) | 60 | 82 | 75 |
| Performance (10) | 85 | 65 | 60 |
| Observability (10) | 40 | 75 | 40 |
| Complexity (5) | 70 | 50 | 95 |
| AI Friendliness (5) | 65 | 60 | 55 |

**speed**: SQLite with raw SQL, no ORM, no migrations framework — just a .sql file.
**maintain**: PostgreSQL + Drizzle ORM with migration tooling and repository pattern.
**minimal**: JSON file on disk, swap to a DB later if needed.
```

### Step 3: Critique

Adopt the Critic persona: "Assume every design is wrong. Find weaknesses."

For each decision, review all proposals and identify:
- **Weaknesses**: specific problems with each approach
- **Severity**: blocker (can't proceed), major (significant risk), minor (annoyance)
- **needsMoreDebate**: true if the proposals are too similar or miss a key dimension

Present as:

```
## Critique: Database Selection

| Persona | Weakness | Severity |
|---------|----------|----------|
| speed | No migration story — schema drift inevitable | major |
| maintain | Over-engineered for current scope (3 tables) | minor |
| minimal | No concurrent write safety | blocker |

Verdict: needsMoreDebate = false. Critique is sufficient to proceed.
```

**Recursive debate**: If `needsMoreDebate` is true, add the debateFocus as a deeper sub-problem
and run another round. Cap recursion at 2 levels (configurable via maxDepth).

### Step 4: Synthesize

For each decision, fuse the best parts of each proposal into a single decision:

```
## Synthesis: Database Selection

**Chosen approach**: maintain (dominant), with speed influence
**Decision**: PostgreSQL with a thin Drizzle schema layer. Skip the full repository
pattern for now — direct queries in route handlers. Add repository abstraction only
when a second data source appears.
**Reasoning**: maintain gives us schema safety and migration tooling (Drizzle handles
both). speed's pushback on abstraction layers is correct at this scale — we defer
the repository pattern. minimal's YAGNI insight is respected by using Drizzle's
inferred types rather than manual interface definitions.
```

### Step 5: Synthesize All — Revised Plan + TODO Graph

After all decisions are resolved, produce two outputs:

**1. Revised Plan** — the original plan with decisions replaced by Arena conclusions.
Add an `## Arena Decisions` appendix summarizing all resolutions.

**2. TODO Execution Graph** — break the revised plan into a dependency-ordered task graph:

```
# TODO: auth-module

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | DB schema | db/schema.ts | tsc --noEmit | - | pending |
| 2  | User model | auth/user.ts | vitest run | 1 | pending |
| 3  | Register endpoint | auth/register.ts | vitest run | 1, 2 | pending |
| 4  | Login endpoint | auth/login.ts | vitest run | 1, 2 | pending |
| 5  | Session middleware | auth/session.ts | vitest run | 1, 2 | pending |
| 6  | Integration test | auth/__tests__/auth.test.ts | vitest run | 3, 4, 5 | pending |

## Concurrent Groups
G1: [1]
G2: [2]
G3: [3, 4, 5]
G4: [6]
```

The TODO graph follows the format from `packages/agent/src/todo/`:
- Each node has: ID, Name, Files (paths to create/modify), Verify (command), DependsOn, Status
- Concurrent groups show what can run in parallel
- Nodes in the same group have no dependencies on each other

### Step 6: Save Output

Write the output to `output/arena/`:

| File | Content |
|------|---------|
| `output/arena/revised-plan.md` | The revised plan with Arena decisions |
| `output/arena/todo.md` | The TODO execution graph |
| `output/arena/arena-report.md` | Full Arena report (all proposals, critiques, synthesis) |

Tell the user:
> "Arena 完成。输出文件："
> - `output/arena/revised-plan.md` — 修订后的计划
> - `output/arena/todo.md` — TODO 执行图
> - `output/arena/arena-report.md` — 完整辩论记录
>
> 接下来可以运行 `/goal` 将 TODO 图转为可追踪的任务列表。

## Extension Personas

For specific sub-problem types, the constitution may define extension personas to add:

| Sub-Problem Type | Add Persona |
|------------------|-------------|
| `tech_selection` | **perf** — Performance-oriented. Identify hot paths, propose benchmarks, streaming/batching/caching patterns. |
| `cross_module` | **scalable** — Scalability-oriented. Design for horizontal scaling, minimize shared mutable state, consider data partitioning. |

Also available when relevant:
- **secure** — Defense in depth. Least privilege, validate at every boundary, audit trails, explicit threat model.

## Code-Backed Mode (Optional)

If the user has LLM API keys configured and wants to run the actual Arena code:

```bash
cd packages/agent && npx tsx -e "
import { runArena, createCLILLMProvider } from './src/index.js';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';

const plan = readFileSync('../../output/arena-input.md', 'utf-8');
const result = await runArena(
  { maxDepth: 2, maxCritiqueCycles: 1, outputDir: '../../output/arena' },
  createCLILLMProvider('llm -m gpt-4o'),
  plan
);
console.log('Completed:', result.problemsBattled, 'decisions in', result.durationMs, 'ms');
"
```

This uses the `@piforge/agent` library directly with real API calls. Useful when the user
wants truly independent agent outputs (not simulated by the same LLM).

## Reference: Default Constitution

When `state/constitution.md` is missing, use these defaults (from `packages/agent/src/constitution/defaults.ts`):

**Architecture Principles:**
1. Simple > Clever
2. Composition > Inheritance
3. Explicit > Implicit
4. Interface First
5. Testable

**Rubric (8 dimensions, weight sums to 100):**

| Key | Label | Weight | Description |
|-----|-------|--------|-------------|
| decoupling | Decoupling | 20 | Module independence |
| maintainability | Maintainability | 20 | Ease of safe changes |
| extensibility | Extensibility | 15 | Adding new capabilities |
| testability | Testability | 15 | Verifying correctness |
| performance | Performance | 10 | Throughput and latency |
| observability | Observability | 10 | Internal state visibility |
| complexity | Complexity | 5 | Code and abstraction needed |
| ai_friendliness | AI Friendliness | 5 | AI agent navigability |

**Agent Pool (core always dispatched, extension on demand):**

| Persona | Type | Description |
|---------|------|-------------|
| speed | core | Fastest implementation, minimal abstraction |
| maintain | core | Long-term maintenance, modularity |
| minimal | core | YAGNI, delete more than add |
| perf | extension | Performance optimization |
| secure | extension | Security and defense in depth |
| scalable | extension | Horizontal scaling and growth |

## Edge Cases

| Scenario | Action |
|----------|--------|
| No Design Decision sections in plan | Offer to help identify and mark open decisions |
| Single decision | Still run full Arena — single decisions benefit from multi-angle review |
| constitution.md missing | Use default constitution (embedded above) |
| Plan is very long (>300 lines) | Extract only Design Decision sections + surrounding context |
| User wants to skip critique | Do minimum: at least one pass of criticism per decision |
| User disagrees with synthesis | Re-run synthesis with user's feedback as an additional persona ("user") |
