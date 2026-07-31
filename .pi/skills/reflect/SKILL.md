---
name: reflect
description: >
  Use when the user wants to reflect on a conversation or experience to extract
  personal insights — values, abilities, and patterns. Triggers: "/reflect",
  "reflect on this", "analyze this conversation", "what did I learn here",
  "extract insights from this", "复盘".
  Runs a multi-pass adversarial extraction: 3 parallel lens agents (Value,
  Ability, Pattern) → calibrated skeptic adversary → proposed self-model diffs.
  Output is saved to state/reflections.jsonl. The user confirms/rejects each
  proposed diff inline before any file is written. Also loads unprocessed
  RAL records from state/records.jsonl as additional signal sources.
---

# Reflect Skill

Multi-pass adversarial extraction of personal insights from conversations.

**Protocol reference**: `references/reflection-protocol.md` — schemas, lens prompts, adversary rules, and storage conventions.

## When to Use

- User types `/reflect` explicitly
- Asks to "reflect on this conversation", "复盘", "what did I learn"

## Runtime

### Step 0: Load Context

1. **user_dna.json** — `Read state/user_dna.json`. If missing: "没有现有的自我模型做对比，建议先运行 value-discovery。"
2. **reflections.jsonl** — `Read state/reflections.jsonl`. Parse each line as JSON. Run integrity checks. Report: "reflections.jsonl: [N] 条, [M] 条损坏已跳过".
3. **protocol** — `Read references/reflection-protocol.md` for lens prompts and schemas.
4. **RAL records** — `Read state/records.jsonl`. Filter for `processed_at: null`. Include as additional signal sources alongside the conversation transcript. If a record has `value_tags`, pass them as "user self-tagged" signals — higher confidence.
5. **Pending experiments** — Check most recent reflection for `action_experiments` with `status: "active"`. Determine age:

| Age | Action |
|-----|--------|
| 0-4 days | "上次复盘你选了 [N] 个行动实验。试了一下吗？" |
| 5-13 days | Gentle nudge |
| 14+ days | Auto-expire → `status: "expired"` |

### Step 0.5: Preprocessing (long conversations)

- **Short** (<40 turns or <5k words): pass full transcript to all Lens agents
- **Long** (40+ turns or 5k+ words): extract 5-8 most signal-rich excerpts first

For long conversations, extract:
> Moments with emotional weight, decisions, trade-offs, unprompted initiations, flow states. For each excerpt, include a one-line label and the verbatim exchange.

Lens agents receive: condensed signal map (primary) + full transcript (reference).

### Step 1: Pass 1 — Parallel 3-Lens Extraction

Announce: "正在通过三个视角分析这次对话..."

Spawn three subagents in parallel using the `Agent` tool. Each receives the full conversation transcript (or condensed map from Step 0.5) + current user_dna.json + lens-specific prompt from `references/reflection-protocol.md`.

All three follow the same workflow: **Segment → Focus → Extract**.

1. **Value Lens** (label: "reflect:value-lens")
   - Extract what the user is pursuing — direction, attraction, energy
   - Schema: segments, focus_segments, candidate_values, attraction_signals, emotional_spikes, summary

2. **Ability Lens** (label: "reflect:ability-lens")
   - Extract demonstrated and emerging capabilities
   - Schema: segments, focus_segments, demonstrated_abilities, emerging_edges, new_connections, summary

3. **Pattern Lens** (label: "reflect:pattern-lens")
   - Identify recurring patterns, cross-domain connections, energy signature, abstraction layers
   - Schema: segments, focus_segments, identified_patterns, abstraction_layers, cross_domain_connections, energy_signature, recurring_dilemmas, decision_heuristics, summary

### Step 1.5: Validation Gate

1. Parse JSON — each agent output must be valid JSON
2. Check required fields — `segments` (non-empty), `focus_segments` (non-empty), `summary` (non-empty)
3. Sanity check — do segment labels match actual conversation topics?
4. Classify each lens: `passed` | `degraded` | `failed`

**Degraded mode:**

| Survivors | Action |
|-----------|--------|
| 3/3 | Proceed normally |
| 2/3 | Proceed, relax cross-corroboration |
| 1/3 | Proceed with heavy caveat |
| 0/3 | Abort. "本轮复盘无法完成。" Save minimal event with `status: "aborted"`. |

### Step 2: Pass 2 — Adversary Agent

Spawn adversary using the `Agent` tool (label: "reflect:adversary").

Receives all three lens outputs. Uses the adversary prompt from `references/reflection-protocol.md`. Three roles:
1. **Truth calibration** — verify claims have evidence
2. **Meaning expansion** — alternative framings for each finding
3. **Action concretization** — generate testable "If [trigger], then [action]" experiments

### Step 3: Synthesize & Present

Present findings conversationally:

> "这次对话中我注意到——"
>
> **情绪层面**: [emotional highlights]
> **能力层面**: [demonstrated abilities + emerging edges]
> **模式层面**: [patterns + abstraction layers]
> **能量地图**: [energizing vs. draining]
> **信号质量**: [score] / 1.0

Present proposed **user_dna.json diffs**:

> "基于以上信号，我建议对你的自我模型做以下调整："
> - 价值观: [key] [from → to] — 证据: [evidence]
> - 信念: [add/modify/remove]
> - 决策准则: [context]: [rule]
> - 偏好: [field]: [from → to]

Present **action experiments**:

> "以下是基于本轮发现的行动实验："
> | 洞察 | 行动规则 | 验证方式 |

**Confirm**: "请逐条确认——接受、拒绝、还是修改？"

### Step 4: Persist

1. **Apply accepted diffs to user_dna.json** — merge changes, keep existing fields
2. **Mark records processed** — set `processed_at` + `linked_reflection_id`
3. **Save experiments** — selected: `status: "active"`, unselected: `status: "skipped"`
4. **Write reflection event** to `state/reflections.jsonl` — full schema from protocol
5. **Confirm**: "已保存。复盘 ID: [id]。状态更新: user_dna.json 已更新 [N] 项 / reflections.jsonl 累计 [N] 条。"

### Step 5: Auto-Suggest `/distill`

Calculate cumulative impact of unprocessed reflections. If impact >= threshold:

> "你的复盘记录中累计影响分数为 [score]，建议运行 `/distill` 进行一次阶段性合成。现在跑还是稍后？"

## Cold Start

First `/reflect` (no reflections.jsonl or empty):
- Run FULL 3-agent protocol. Don't simplify.
- Pattern Lens: "First reflection — cross-referencing user_dna.json only."
- Adversary: "No historical data available — calibrate against user_dna.json and cross-lens corroboration only."
- Output: "这是你的第一次复盘——历史模式会随着更多复盘数据而浮现。"

## Edge Cases

| Scenario | Action |
|----------|--------|
| user_dna.json missing | Run without. Note: "建议先运行 value-discovery。" |
| Lens agent fails | Validation gate → degraded mode |
| All three lenses fail | Abort with minimal event |
| All signals filtered | No diffs proposed. Still save. |
| User rejects all | No DNA update. Rejection IS signal — record it. |
| JSONL corrupt lines | Skip. Report count. >50% → recommend manual recovery. |
| Short conversation | Full protocol. Confidence naturally lower. |

## Key Files

| File | Purpose |
|------|---------|
| `references/reflection-protocol.md` | Lens prompts, schemas, adversary rules |
| `state/user_dna.json` | Read as context, write accepted diffs |
| `state/reflections.jsonl` | Append full reflection event |
| `state/records.jsonl` | RAL records loaded as extra signal sources |
