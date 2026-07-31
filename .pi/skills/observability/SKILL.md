---
name: observability
description: >
  Use this skill when the user wants to check whether their actual behavior
  aligns with their stated values — mismatch detection between user_dna.json
  and observed patterns. Also use when the user says "check my predictions",
  "validate assumptions", "anything changed?", "verify past analysis",
  "我之前猜的对不对", "任何东西变了吗", "验证一下之前的预测",
  "观测", "行为对齐", "value drift", or references observability directly.
  This skill compares recent behavior (conversation patterns, decisions,
  expressed preferences) against the cognitive model in state/user_dna.json,
  flags value drift, and surfaces blind spots. Auto-suggest after every
  3-5 value-discovery or significant decision-making conversations.
---

# Observability Skill

Check whether the user's actual behavior aligns with their stated values and cognitive model.

## When to Use

- User asks to check alignment between their stated values and actual behavior
- After every 3-5 significant decision-making conversations
- When user_dna.json hasn't been reviewed in 30+ days
- User mentions drift, contradiction, or "anything changed?"
- After major life/work changes that might shift values

## The Three Checks

### 1. Value-Behavior Mismatch Detection

Compare recent conversation patterns against `state/user_dna.json` values.

**Process:**
1. Read `state/user_dna.json` — the user's stated values, beliefs, criteria
2. Review recent conversation history for decision patterns, emotional responses, expressed preferences
3. Flag where actual behavior diverges from stated values

**Output format:**
```
### 行为一致性检查

**stated**: 最看重 autonomy（自主） — score 9/10
**observed**: 最近 3 次重大决策都是征求他人意见后做出的，没有一次独立拍板
**gap**: 中等 — 可能环境因素（团队协作需要）暂时压制了自主偏好，也可能是分值需要调整
```

**What to ask:** "你在 user_dna 里把自主排最高（9分），但最近几次决策你都是协作模式。是环境因素还是你的偏好变了？"

### 2. Blind Spot Check

Identify patterns the user's belief system may be filtering out.

**Process:**
1. Read `state/user_dna.json` beliefs with `confidence` scores
2. Look for recent conversations where an alternative perspective was dismissed or not considered
3. Flag beliefs that may be creating blind spots

**Output format:**
```
### 盲点检查

**belief**: "深度理解底层原理比快速应用更重要" (confidence: 0.9)
**observation**: 最近 2 次因为追求理解底层而错过了截止时间
**pattern**: 这个信念让你看到了深度，但可能让你忽略了时机窗口
**question**: "有没有什么情况，快速行动比深度理解更值得？"
```

### 3. Criteria Drift Detection

Track whether the user's decision criteria have shifted over time.

**Process:**
1. Compare current decision patterns against `user_dna.json` criteria
2. Note any new criteria that emerged in recent decisions
3. Flag stale criteria that no longer drive decisions

**Output format:**
```
### 决策标准漂移

**新的标准**: "团队文化匹配" — 最近 3 次选择中都提到了这个，但 user_dna 里没有
**冷却的标准**: "技术先进性" — 以前排很高，最近 5 次决策都没提到
**建议**: 更新 criteria，添加 team_culture_fit，降低 tech_advancement 权重
```

## Config Metadata Check

Also check user_dna.json consistency:

| Check | Issue | Fix |
|-------|-------|-----|
| 所有维度都缺失评分 | 可能 value-discovery 没完整跑完 | 建议重新运行 value-discovery |
| 信念的 confidence 都很低（<0.5） | Phase 2 信号不够 | 需要更多对话数据 |
| preferences 为空 | 只提取了显式值，缺少偏好标签 | 补充 preferences 字段 |
| evidence_log 为空但 beliefs 非空 | 缺少证据链 | 追溯原始对话补上 |

## Report Format

```
## 观测报告

**User DNA 版本:** v1 (extracted 2026-07-31)
**检查范围:** 最近 N 次对话

### 行为一致性
[summary of mismatches — all aligned, or flag specific drifts]

### 盲点
[blind spots surfaced from belief filtering — or "无显著盲点"]

### 决策标准漂移
[criteria that have shifted — or "标准稳定"]

### 建议
[actionable items ranked by priority]
```

## Edge Cases

| Situation | Response |
|-----------|----------|
| No `state/user_dna.json` | "还没有认知模型——先跑一次 value-discovery 建立 baseline。" |
| Not enough conversation data | "最近对话不够多，建议有了 10+ 次交互后再跑 observability。" |
| All aligned | "你的行为和 stated values 很一致 ✓ 没有显著的 drift 或盲点。" |
| Major drift detected | "你的行为变化比较大——可能是正常的环境适应，也可能值本身在变化。要更新 user_dna 吗？" |
| user_dna.json is malformed | Report parse error, suggest fixing or re-running value-discovery |

## Key Files

| File | Purpose |
|------|---------|
| `state/user_dna.json` | The user's cognitive model |
