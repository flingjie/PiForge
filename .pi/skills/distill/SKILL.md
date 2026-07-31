---
name: distill
description: >
  Use when the user wants to synthesize accumulated reflections into a growth
  narrative and propose self-model updates. Triggers: "/distill", "synthesize
  my reflections", "growth report", "what have I learned recently", "aggregate
  insights", "蒸馏", "阶段性复盘", "总结最近的复盘", "这段时间有什么变化".
  Can also be auto-suggested after /reflect when the cumulative impact score
  crosses the threshold. Gathers all unprocessed reflections, produces a
  Tension + Resolution narrative, proposes user_dna.json diffs (including
  cognitive_patterns). Writes a markdown report to state/distill_reports/ and
  presents a conversational summary for user confirmation.
---

# Distill Skill

Synthesize accumulated reflections into a coherent growth narrative, identify cross-event patterns, and propose self-model updates — all gated by user confirmation.

**Protocol reference**: `references/reflection-protocol.md` — distill report template, DNA diff format.

## When to Use

- User types `/distill` explicitly
- Asks for "growth report", "阶段性复盘", "蒸馏"
- Auto-suggested after `/reflect` (cumulative impact >= threshold)
- "上次到现在有什么变化", "总结一下最近的复盘"

## Runtime

### Step 0: Gather Input

1. **Read `state/reflections.jsonl`** — parse all lines
2. **Identify unprocessed** — all entries where `distilled_at` is null
3. **Read `state/records.jsonl`** — RAL records from same time range for context
4. **Read `state/user_dna.json`** — current self-model for comparison
5. **Read `references/reflection-protocol.md`** — distill report template

If ZERO unprocessed reflections:

> "没有新的复盘记录需要合成。你最近一次蒸馏是在 [last distill date]，处理了 [N] 条记录。"

### Step 1: Tension + Resolution Analysis

Analyze reflections through the Tension + Resolution lens:

**Identify central tension(s):**
- Recurring dilemmas across reflections (e.g., "depth vs breadth", "creation vs adoption")
- Emotional spikes clustering around the same value
- Cross-domain connections — tensions spanning work, learning, relationships
- Patterns where user says one thing but does another

**Identify resolution(s):**
- Moments where tension was explicitly resolved (decision, realization)
- Value shifts indicating resolution (e.g., "optimization" overtakes "exploration")
- Abstraction layers that climbed from case → principle
- Action experiments with positive outcomes

**Synthesize narrative arc:**
- **起点**: state at start of this batch
- **挑战**: what complicated it
- **落地**: where it landed
- **未解**: what's still unresolved

### Step 2: Compute Proposed DNA Diffs

Based on ALL unprocessed reflections, compute consolidated changes:

**Values:**
- Same key shifted in multiple reflections → stronger signal → higher confidence
- Values shifted in opposite directions → unresolved tension, don't propose single diff
- Weight by emotional intensity

**Beliefs:**
- New beliefs that appeared across reflections → propose adding
- Beliefs contradicted by recent behavior → propose modifying or removing
- Beliefs that created blind spots → propose adding nuance

**Cognitive Patterns (cognitive_patterns):**
- Emergent strengths visible across multiple reflections
- Recurring biases or default strategies
- Meta-cognitive patterns — how the user learns and adapts

### Step 3: Write Report

Write `state/distill_reports/YYYY-MM-DD_distill.md` using the template from `references/reflection-protocol.md`.

### Step 4: Present & Confirm

Present conversational summary:

> "从 [start] 到 [end]，[N] 次复盘的核心洞察——"
>
> **核心矛盾**: [tension summary]
> **进展**: [what resolved]
> **未解**: [what's still open]
> **浮现的模式**: [key patterns]
>
> [present proposed DNA diffs one section at a time]
> "请逐条确认——接受、拒绝、还是修改？"

### Step 5: Apply & Close

1. Apply accepted diffs to `state/user_dna.json`
2. Mark all processed reflections: `distilled_at: "<ISO>"`
3. Mark report as confirmed

> "已保存。报告: state/distill_reports/[date]_distill.md"
> "自我模型已更新 [N] 项。"

## Edge Cases

| Scenario | Action |
|----------|--------|
| No reflections | "还没有复盘记录。先运行 /reflect 积累数据。" |
| All reflections already distilled | Show last report. Offer to regenerate. |
| user_dna.json missing | Proceed but note: "建议先运行 value-discovery。" |
| Single reflection only | Lighter analysis. Fewer cross-event patterns. Still valid. |
| User rejects all | "没有应用任何更新。当前 user_dna.json 保持不变。" |
| Contradictory signals | Surface honestly: "不同时间的信号指向不同方向——可能是正常波动，也可能意味着你的某些价值在过渡期。" |

## Key Files

| File | Purpose |
|------|---------|
| `references/reflection-protocol.md` | Distill report template, DNA diff format |
| `state/reflections.jsonl` | Source — all reflection events |
| `state/user_dna.json` | Target — updated by accepted diffs |
| `state/distill_reports/` | Output — markdown growth reports |
| `state/records.jsonl` | Context — RAL records from same timeframe |
