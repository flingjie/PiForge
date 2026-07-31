---
name: optimize
description: >
  Diagnose→Propose→Apply→Verify loop for continuous improvement. Use when the
  user says "/optimize", "optimize", "improve", "优化", "提升", "fix", or wants
  to iteratively improve any output, configuration, or analysis result.
  This skill reads diagnostics from observability or recent session outputs,
  generates concrete improvement proposals, gets user confirmation, applies
  changes, re-runs verification, and records successful patterns.
  General-purpose optimization — not limited to any specific domain.
---

# Optimize Skill

Diagnose → Propose → Confirm → Apply → Verify loop for continuous improvement.

## Architecture

```
User: "/optimize [target]" or "优化 [目标]"
       │
       ▼
1. DISCOVER — identify what to optimize based on context or explicit target
       │
       ▼
2. DIAGNOSE — analyze current state, find issues and improvement opportunities
       │
       ▼
3. BOOTSTRAP — check state/bootstrap.json for prior successful patterns
       │
       ▼
4. PROPOSE — generate one proposal per actionable finding, write to state/proposals/
       │
       ▼
5. CONFIRM — present proposals one at a time, wait for accept/reject/skip/edit
       │
       ▼
6. APPLY — execute accepted proposals (edit files, run commands, adjust config)
       │
       ▼
7. VERIFY — check results, compare before/after
       │
       ▼
8. RECORD — if improvement confirmed, record to state/bootstrap.json
```

## Step 1: Discover

Determine what to optimize:

- If user provides explicit target: use it
- If user just ran observability: optimize the findings
- If user has state/user_dna.json with low confidence: optimize the cognitive model
- If .pi/permissions.json recently changed: optimize permission rules
- Otherwise: ask user what they want to improve

## Step 2: Diagnose

Analyze the target and present findings:

```
## 诊断: [target]

Issues found:
  1. [severity] issue description — impact
  2. [severity] issue description — impact
  ...
```

Severity levels:
- **HIGH**: Blocking or causing significant problems
- **MEDIUM**: Degrading quality or adding friction
- **LOW**: Minor improvement opportunity

For each issue, note whether it's fixable by configuration change vs. requires structural change.

## Step 3: Bootstrap

Check `state/bootstrap.json` for prior successful patterns related to the current target. If found:

> "这个领域之前有 N 次成功的优化记录。参考：[summary of past successful approaches]."

If no bootstrap data: "这是第一次优化这个领域——每次采纳的方案会积累成经验。"

## Step 4: Propose

For each actionable diagnostic, generate ONE proposal:

```json
{
  "id": "prop_YYYYMMDD_HHMMSS",
  "created_at": "ISO8601",
  "target": "what's being optimized",
  "issue": "description of the problem",
  "severity": "high|medium|low",
  "diagnosis": "root cause analysis",
  "proposed_change": {
    "action": "what to do",
    "details": {}
  },
  "expected_impact": {
    "metric": "what should improve",
    "current": "before state",
    "expected": "after state",
    "basis": "why we think this will work"
  },
  "risk": "low|medium|high",
  "status": "pending"
}
```

Risk levels:
- **low**: Non-destructive change, easy to revert
- **medium**: Moderate blast radius, may affect related areas
- **high**: Significant change, hard to roll back

Write proposals to `state/proposals/prop_YYYYMMDD_HHMMSS.json`.

## Step 5: Confirm

Present proposals one at a time:

```
## Proposal 1/3: [severity] title

**Problem:** [what's wrong, with evidence]
**Root cause:** [why it's happening]
**Fix:** [what will change]
**Expected impact:** [before → after]
**Risk:** [level — what could go wrong]

**Accept?** (a)ccept / (r)eject / (s)kip / (e)dit
```

Wait for user response after each proposal.

If "edit", let the user modify the proposal before applying.
If "reject", mark the proposal `rejected` and move on.
If "skip", mark `skipped` — can revisit later.

## Step 6: Apply

Execute accepted proposals. For each:

1. Make the change (file edit, config update, command execution)
2. Track what was changed (old value, new value, reason)
3. If the change is reversible, note how to revert

If multiple proposals touch the same target, apply in dependency order.

## Step 7: Verify

Check the result:

1. Run relevant verification (tests, smoke test, before/after comparison)
2. Present results:

```
## 验证结果

Proposal 1: [status] — [evidence of improvement or regression]
Proposal 2: [status] — [evidence]
```

If improvement: mark `applied`.
If regression: mark `failed`, suggest rollback.
If no change: mark `applied` (still a valid attempt).

## Step 8: Record

For proposals marked `applied`:
1. Update proposal JSON status to `applied`
2. Record to `state/bootstrap.json`:

```json
{
  "domain": "optimization target",
  "approach": "what worked",
  "result": "outcome",
  "timestamp": "ISO8601",
  "quality": "high|medium|low"
}
```

## Rollback

If regression detected:
1. Revert the change using tracked old/new values
2. Mark proposal `failed`
3. Suggest alternative approach
4. Record the failure to bootstrap to avoid repeating

## Summary

After all proposals processed:

```
## Optimization Summary

Target: [what was optimized]
Accepted: X/Y proposals
Applied:  A/X (B failed, C no change)

Changes:
  [list of applied changes with results]

Next: [suggestion for what to check or optimize next]
```

## Edge Cases

| Situation | Response |
|-----------|----------|
| No issues found | "没有发现需要优化的地方。" |
| No target specified | "你想优化什么？——权限配置、认知模型、还是最近的分析结果？" |
| Proposal would cause conflict | Flag: "这个改动会和 [other thing] 冲突。建议先解决冲突再优化。" |
| Multiple proposals conflict | Resolve dependencies first, then content changes |
| Verify fails | "验证失败——已回滚。[details]。需要调整方案。" |
| User rejects all | "没有应用任何更改。随时可以重新 /optimize。" |
| No state/bootstrap.json | "首次优化——每次采纳的方案会积累经验，帮助未来的优化决策。" |

## Key Files

| File | Purpose |
|------|---------|
| `state/proposals/` | Generated proposals |
| `state/bootstrap.json` | Successful optimization patterns |
| `state/user_dna.json` | User cognitive model (for personalized optimization context) |
