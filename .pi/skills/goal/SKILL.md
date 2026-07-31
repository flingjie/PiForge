---
name: goal
description: >
  Claude Code-style goal and task management. Define multi-step goals, break
  them into ordered subtasks with dependencies, track progress. Triggers on:
  "/goal", "/tasks", "set a goal", "create task", "todo list", "任务列表",
  "查看任务", "what's next", "track progress", "define goal".
  Tasks persist in state/goal.json across sessions.
---

# Goal Skill

Define goals, break them into tasks with dependencies, and track progress.

## Commands

| Command | Purpose |
|---------|---------|
| `/goal <description>` | Define a new goal and auto-generate task list |
| `/goal add <task>` | Add a single task to the current goal |
| `/goal status` | Show current goal with task progress |
| `/tasks` | Alias for `/goal status` |
| `/tasks done <id>` | Mark a task as completed |
| `/tasks fail <id> <reason>` | Mark a task as failed |
| `/tasks skip <id>` | Skip a task |
| `/tasks unskip <id>` | Unskip a previously skipped task |
| `/tasks reorder <id> <new_position>` | Move a task to a new position |
| `/goal clear` | Clear the current goal (requires confirmation) |

## Workflow

### Step 1: Define

User: `/goal "Add unit tests for all API endpoints"`

Read `state/goal.json`. If one exists and is still active, ask: "已有进行中的目标: [existing]. 要替换它吗？"

Generate tasks:
1. Each task: specific, actionable, verifiable — one clear deliverable
2. Identify dependencies: which tasks must complete before others
3. Assign priorities: `high` (blocking), `medium` (core), `low` (nice-to-have)
4. Present for confirmation:

```
## Goal: Add unit tests for all API endpoints

6 tasks  |  0 done  |  0 in progress  |  6 pending

P1  1. [ ] Find all untested API endpoints
P2  2. [ ] Write tests for GET /users
P2  3. [ ] Write tests for POST /users       (depends on: #2)
P2  4. [ ] Write tests for GET /items/:id
P2  5. [ ] Write tests for PUT /items/:id     (depends on: #4)
P3  6. [ ] Run full test suite, verify coverage

/tasks done <id> to mark complete, /goal add "..." to add more
```

### Step 2: Track

As the user works through tasks, they update status:

```
User: /tasks done 1
Agent: Marked #1 as done. 1/6 complete. Next ready: #2, #4.

User: /tasks fail 3 "API changed, need to rewrite"
Agent: Marked #3 as failed. Reason: API changed, need to rewrite.
       Note: #3 blocks nothing, so no impact on other tasks.
```

### Step 3: Complete

When all tasks done:
1. Set goal status → `completed`
2. Show summary: "Goal complete: [N]/[N] tasks done."

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
      "description": "Scan src/routes/ for endpoints without *.test.ts",
      "status": "pending",
      "priority": "high",
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

                        ┌── #2 (P2, done)
#1 (P1, done) ──────────┤
                        └── #3 (P2, failed: "API changed, need to rewrite")

#4 (P2, done)
#5 (P2, pending) — depends on #4
#6 (P3, pending)

✓ 3 done  |  ✗ 1 failed  |  ○ 2 pending

Next ready: #5 (/tasks done 5), #6 (/tasks done 6)
```

## Dependencies

Tasks declare `depends_on` (what must complete first) and `blocks` (what this task unblocks).

When creating tasks:
- Auto-populate `blocks` as the reverse of `depends_on`
- Only show tasks whose `depends_on` are all resolved as "ready"
- If a dependency is `failed` or `skipped`, flag the dependent task as blocked

## Task Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Not yet started |
| `in_progress` | Currently working on it |
| `completed` | Done successfully |
| `failed` | Attempted but didn't work |
| `skipped` | Intentionally skipped |

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| `/goal` with active goal | "已有进行中的目标。要替换吗？" |
| All remaining tasks blocked | Show what's blocking each. Suggest unblocking. |
| Empty task list | "/goal add <task> to add tasks, or /goal clear to start over." |
| Goal file corrupted | Report error. Offer to recreate. |
| Task depends on a failed task | Flag: "Task #N is blocked because #M failed. /tasks unskip #M or re-plan." |

## Key Files

| File | Purpose |
|------|---------|
| `state/goal.json` | Current goal state — read, update, persist |
