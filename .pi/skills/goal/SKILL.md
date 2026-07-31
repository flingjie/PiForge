---
name: goal
description: >
  Goal and task management with superpower skills integration. Define goals,
  break them into typed subtasks with dependencies, and each task auto-maps to
  the right superpower skill for execution. Triggers on: "/goal", "/tasks",
  "set a goal", "create task", "todo list", "任务列表", "查看任务", "what's next",
  "track progress", "define goal". Tasks persist in state/goal.json across sessions.
  When executing tasks, invokes the matching superpower skill (brainstorming,
  tdd, systematic-debugging, subagent-driven-development, etc.) automatically.
---

# Goal Skill

Define goals, classify tasks by type, and execute them through superpower skills.

## Task Type → Superpower Skill Mapping

When creating tasks, classify each one. The type determines which superpower skill to invoke at execution time.

| Task Type | Superpower Skill | When to Use |
|-----------|-----------------|-------------|
| `explore` | `superpowers:brainstorming` | Understanding codebase, exploring options, research |
| `plan` | `superpowers:writing-plans` | Designing architecture, writing implementation plans |
| `implement` | `superpowers:test-driven-development` | Writing new features or fixing bugs with tests first |
| `implement-parallel` | `superpowers:subagent-driven-development` | Multiple independent implementation tasks |
| `dispatch` | `superpowers:dispatching-parallel-agents` | Fanning out to parallel subagents |
| `debug` | `superpowers:systematic-debugging` | Investigating bugs, test failures, unexpected behavior |
| `verify` | `superpowers:verification-before-completion` | Confirming fixes, checking tests pass, validating output |
| `review` | `superpowers:requesting-code-review` | Reviewing completed work before merging |
| `handle-feedback` | `superpowers:receiving-code-review` | Processing code review feedback |
| `integrate` | `superpowers:finishing-a-development-branch` | Merging, PR creation, cleanup after implementation |
| `isolate` | `superpowers:using-git-worktrees` | Work that needs isolation from current workspace |

## Commands

| Command | Purpose |
|---------|---------|
| `/goal <description>` | Define a new goal, auto-generate typed tasks |
| `/goal add <task>` | Add a single task |
| `/goal status` | Show current goal with task types and skills |
| `/tasks` | Alias for `/goal status` |
| `/tasks start <id>` | Begin a task — invokes its superpower skill |
| `/tasks done <id>` | Mark a task as completed |
| `/tasks fail <id> <reason>` | Mark a task as failed |
| `/tasks skip <id>` | Skip a task |
| `/tasks unskip <id>` | Unskip a previously skipped task |
| `/goal clear` | Clear the current goal (requires confirmation) |

## Workflow

### Step 1: Define

User: `/goal "Add unit tests for all API endpoints"`

Read `state/goal.json`. If one exists and active, ask about replacing.

Auto-classify each generated task:

```
## Goal: Add unit tests for all API endpoints

6 tasks  |  0 done  |  ○ 6 pending

P1  1. [ ] Find all untested endpoints          [explore]  brainstorming
P2  2. [ ] Write tests for GET /users            [implement]  tdd
P2  3. [ ] Write tests for POST /users           [implement]  tdd       (depends on: #2)
P2  4. [ ] Write tests for GET /items/:id        [implement]  tdd
P2  5. [ ] Write tests for PUT /items/:id        [implement]  tdd       (depends on: #4)
P3  6. [ ] Run full test suite, verify coverage  [verify]  verification

/tasks start <id> to begin, /tasks done <id> to mark complete
```

Each task shows its `[type]` and the matching superpower skill.

### Step 2: Start a Task

User: `/tasks start 2`

```
## Task 2/6: Write tests for GET /users
Type: implement  |  Skill: superpowers:test-driven-development

Invoking TDD workflow:
  1. Write a failing test first (red)
  2. Write minimal code to pass (green)
  3. Refactor while tests stay green

Starting now...
```

Then invoke `Skill("superpowers:test-driven-development")` and proceed with the task.

### Step 3: Task Completed

After the task is done (via its skill), user marks it:

```
User: /tasks done 2
Agent: ✓ Task #2 complete. 1/6 done. 5 remaining.
       Next ready: #3 (/tasks start 3), #4 (/tasks start 4)
```

### Step 4: Goal Complete

When all tasks are `completed` or `skipped`:
1. Set goal status → `completed`
2. Show summary with elapsed time

## Task Schema (state/goal.json)

```json
{
  "subject": "Add unit tests for all API endpoints",
  "description": "user's full goal description",
  "status": "active",
  "created_at": "2026-07-31T06:00:00Z",
  "completed_at": null,
  "tasks": [
    {
      "id": 1,
      "subject": "Find all untested endpoints",
      "description": "Scan for endpoints without tests",
      "status": "pending",
      "priority": "high",
      "type": "explore",
      "skill": "superpowers:brainstorming",
      "depends_on": [],
      "blocks": [2, 3],
      "activeForm": "Finding untested endpoints",
      "metadata": {},
      "result": null,
      "started_at": null,
      "completed_at": null
    }
  ],
  "stats": {
    "total": 6,
    "pending": 6,
    "in_progress": 0,
    "completed": 0,
    "failed": 0,
    "skipped": 0
  }
}
```

## Status Display

`/goal status` or `/tasks`:

```
## Goal: Add unit tests for all API endpoints
Status: active  |  Created: Jul 31 14:00  |  Progress: 33%

                        ┌── #2 (implement, done) [tdd]
#1 (explore, done) ─────┤
 [brainstorming]        └── #3 (implement, pending) [tdd]  blocks: #5

#4 (implement, done) [tdd]
#5 (implement, pending) [tdd] — depends on #4
#6 (verify, pending) [verification]

✓ 3 done  |  ○ 3 pending

Next: /tasks start 3 → superpowers:test-driven-development
```

## Task Type Auto-Classification

When generating tasks from a goal description, classify each by analyzing its verb and deliverable:

| Pattern | Type |
|---------|------|
| "Find", "Explore", "Research", "Understand", "Analyze", "Scan" | `explore` |
| "Design", "Plan", "Architect", "Blueprint" | `plan` |
| "Implement", "Write", "Build", "Create", "Add", "Refactor" | `implement` |
| "Debug", "Fix", "Investigate", "Diagnose" | `debug` |
| "Test", "Verify", "Validate", "Check", "Run tests" | `verify` |
| "Review", "Audit", "Inspect" | `review` |
| "Merge", "Deploy", "PR", "Integrate" | `integrate` |
| Multiple independent tasks of same type | change to `implement-parallel` or `dispatch` |

If uncertain, default to `implement`.

## Task Execution

When `/tasks start <id>` is invoked:

1. Read the task from `state/goal.json`
2. Set status → `in_progress`, `started_at` → now
3. Read the `skill` field
4. Invoke the superpower skill with context about the task:
   - `Skill("superpowers:test-driven-development")` — the skill loads and guides execution
5. The skill's workflow takes over until the task is done
6. User marks it with `/tasks done <id>`

If the task has `type: "implement-parallel"` or `type: "dispatch"`:
- Explain that these fan out to parallel subagents
- The parent task tracks overall completion
- Sub-tasks get their own entries in the goal

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| Task has no `skill` field | Default to `superpowers:brainstorming` for explore/plan, `tdd` for implement |
| Skill invocation fails | Suggest manual execution. Mark task as `in_progress` for user to handle. |
| Multiple ready tasks, user doesn't specify | Show all ready tasks with their skills. Ask which to start. |
| Task type `dispatch` or `implement-parallel` | These create sub-goals. Track completion of each sub-unit. |

## Key Files

| File | Purpose |
|------|---------|
| `state/goal.json` | Current goal state with typed tasks and skill mappings |
