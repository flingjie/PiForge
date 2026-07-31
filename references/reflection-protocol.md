# Reflection Protocol Reference

Shared protocol for `/reflect` and `/distill` skills. Single source of truth — both skills reference this file for schemas, lens definitions, adversary rules, and storage conventions.

---

## Architecture Overview

```
RAL Recording Layer (daily, passive)
  │
  ├─ /note capture  → state/records.jsonl  (events + feelings)
  ├─ /note amplify  → add meaning + tags
  └─ /note weekly   → find connections + direction arrows

/reflect (single conversation + unprocessed records → extraction)
  │
  ├─ Load: user_dna.json + reflections.jsonl + records.jsonl
  ├─ Pass 1: Parallel 3-Lens Extraction (Value, Ability, Pattern)
  ├─ Pass 2: Adversary Agent (calibrate + reframe + concretize)
  ├─ Pass 3: Synthesize & Present Diffs + Action Experiments
  └─ User confirms/rejects → write reflections.jsonl + update user_dna.json

/distill (cross-reflection synthesis → growth report)
  │
  ├─ Gather unprocessed reflections
  ├─ Produce Tension + Resolution narrative
  ├─ Propose user_dna.json diffs (including cognitive_patterns)
  ├─ Write markdown report to state/distill_reports/
  └─ User confirms/rejects → update user_dna.json
```

---

## Tag Catalog

### Value Tags (16 keys, closed set)

| Dimension | Keys |
|-----------|------|
| environment | `autonomy`, `collaboration`, `stability`, `competition` |
| activity | `creation`, `exploration`, `optimization`, `execution` |
| output | `devtools`, `end_user`, `infrastructure`, `knowledge` |
| reward | `growth`, `mastery`, `recognition`, `wealth` |

### Energy Tags (3 keys)

`energizing`, `draining`, `neutral`

### Feeling Tags (8 keys)

`excitement`, `frustration`, `pride`, `anxiety`, `curiosity`, `satisfaction`, `disappointment`, `neutral`

---

## The Three Lenses (Pass 1)

Run all three in parallel subagents. Each receives the conversation transcript plus current user_dna.json.

### Value Lens

**Prompt:**

> You are a Value Extraction Agent. Analyze the following conversation and extract what the user deeply cares about.
>
> **STEP 0 — Segment:** Break the conversation into 2-5 segments by topic or emotional register. Label each with dominant topic and emotional tone.
>
> **STEP 1 — Focus:** Identify segments with strongest signals — emotional spikes, unprompted initiation, flow states, trade-off moments. Devote depth to top 1-2 segments. Don't force findings from thin material.
>
> **STEP 2 — Extract:** What is the user pursuing? Look for direction, attraction, and energy — not just what they resist, but what they move toward.
>
> Value tags MUST come from the Tag Catalog: `autonomy|collaboration|stability|competition|creation|exploration|optimization|execution|devtools|end_user|infrastructure|knowledge|growth|mastery|recognition|wealth`.
>
> Focus on:
> - **Attraction signals** — topics they initiate or lean into unprompted
> - **Absorption** — moments of deep engagement, flow
> - **Energy shifts** — when do they light up?
> - **Revealed preferences** — actual choices under trade-offs
> - **Negative signals as navigation** — frustration points to violated values
>
> Output structured JSON:
> ```json
> {
>   "segments": [
>     {"label": "short label", "topic": "what it was about", "emotional_tone": "dominant emotion", "signal_strength": "high|medium|low"}
>   ],
>   "focus_segments": ["label1", "label2"],
>   "candidate_values": [
>     {"key": "creation", "score": 0.8, "evidence": "..."}
>   ],
>   "attraction_signals": [{"topic": "...", "confidence": 0.7}],
>   "emotional_spikes": [{"moment": "...", "emotion": "...", "trigger": "..."}],
>   "summary": "one paragraph synthesis"
> }
> ```

### Ability Lens

**Prompt:**

> You are an Ability Extraction Agent. Analyze this conversation for demonstrated and emerging capabilities.
>
> **STEP 0 — Segment:** Same segmentation workflow as Value Lens.
> **STEP 1 — Focus:** Focus on moments of demonstrated competence, learning edges, and new connections.
>
> **STEP 2 — Extract:**
> - **Demonstrated abilities** — what does the user clearly know or do well?
> - **Emerging edges** — what are they learning or stretching into?
> - **New connections** — what previously separate domains did they bridge?
> - **Self-correction moments** — where did they notice and fix their own error?
>
> Output structured JSON:
> ```json
> {
>   "segments": [...],
>   "focus_segments": [...],
>   "demonstrated_abilities": [{"ability": "...", "evidence": "..."}],
>   "emerging_edges": [{"edge": "...", "confidence": 0.6}],
>   "new_connections": [{"domains": ["A", "B"], "insight": "..."}],
>   "summary": "one paragraph synthesis"
> }
> ```

### Pattern Lens

**Prompt:**

> You are a Pattern Extraction Agent. Identify recurring patterns, cross-domain connections, and abstraction layers.
>
> **STEP 0 — Segment:** Same segmentation workflow.
> **STEP 1 — Focus:** Focus on themes that repeat, structures that generalize, and connections across domains.
>
> **STEP 2 — Extract:**
> - **Identified patterns** — recurring structures in behavior or thinking
> - **Abstraction layers** — case → pattern → principle (3 levels)
> - **Cross-domain connections** — patterns spanning work, learning, relationships
> - **Energy signature** — which activities energize vs. drain
> - **Recurring dilemmas** — tensions that surface repeatedly
> - **Decision heuristics** — shorthand rules the user applies
>
> Output structured JSON:
> ```json
> {
>   "segments": [...],
>   "focus_segments": [...],
>   "identified_patterns": [{"pattern": "...", "occurrences": 2}],
>   "abstraction_layers": [{"case": "...", "pattern": "...", "principle": "..."}],
>   "cross_domain_connections": [{"domains": ["A", "B"], "thread": "..."}],
>   "energy_signature": {"energizing": ["..."], "draining": ["..."]},
>   "recurring_dilemmas": ["..."],
>   "decision_heuristics": [{"context": "...", "rule": "..."}],
>   "summary": "one paragraph synthesis"
> }
> ```

---

## Adversary Agent (Pass 2)

**Prompt:**

> You are a Calibrated Skeptic. Review three lens outputs and apply:
>
> 1. **Truth calibration** — verify claims have evidence. Don't penalize emotional intensity. Question over-interpretation.
> 2. **Meaning expansion** — for each finding, offer an alternative framing or perspective switch.
> 3. **Action concretization** — convert surviving signals into testable "If [trigger], then [action]" experiments.
>
> Output:
> ```json
> {
>   "verdicts": [
>     {
>       "signal": "reference to original finding",
>       "verdict": "confirmed|uncertain|rejected",
>       "reasoning": "...",
>       "alternative_framing": "optional alternative perspective",
>       "perspective_switch": "optional reframe"
>     }
>   ],
>   "action_experiments": [
>     {"insight": "...", "rule": "If [trigger], then [action]", "verify": "how to check if it works"}
>   ],
>   "deep_dive_candidates": ["topics worth exploring further"],
>   "filtered_signals": ["signals removed and why"],
>   "overall_quality_score": 0.75,
>   "surviving_signals_summary": "one paragraph"
> }
> ```

---

## Reflect Event Schema

Appended to `state/reflections.jsonl` as a single JSON line:

```json
{
  "id": "uuid",
  "protocol_version": 1,
  "timestamp": "ISO 8601",
  "conversation_range": {"start": "ISO", "end": "ISO"},
  "records_loaded": 3,
  "lens_outputs": {
    "value": { },
    "ability": { },
    "pattern": { }
  },
  "adversary_verdict": {
    "confirmed_signals": 5,
    "rejected_signals": 2,
    "uncertain_signals": 1,
    "overall_quality_score": 0.75
  },
  "proposed_diffs": {
    "values": [],
    "beliefs": [],
    "criteria": [],
    "preferences": []
  },
  "accepted_diffs": [],
  "action_experiments": [
    {"insight": "...", "rule": "If [trigger], then [action]", "status": "active", "activated_at": "ISO", "expires_at": "ISO", "outcome": null}
  ],
  "lens_status": {"value": "passed", "ability": "passed", "pattern": "passed"},
  "degraded_mode": false,
  "distilled_at": null,
  "status": "complete"
}
```

---

## Distill Report Template

Written to `state/distill_reports/YYYY-MM-DD_distill.md`:

```markdown
# 阶段成长报告 — [date range]

## 处理范围
- 复盘记录: [N] 条
- 时间跨度: [start] → [end]
- 协议版本: [versions]

## 核心矛盾 (Tension)
[What was the central tension across this period?]

## 解决/进展 (Resolution)
[How did the tension evolve? What resolved? What's still open?]

## 叙事弧线 (Narrative Arc)
- **起点**: [state at start]
- **挑战**: [what complicated it]
- **落地**: [where it landed]
- **未解**: [what's still unresolved]

## 模式浮现
[Patterns that emerged across reflections]

## 行动实验回顾
[Previous experiments: outcomes. New experiments proposed.]

## 自我模型更新建议
### 价值观
[proposed value shifts]

### 信念
[proposed belief changes — add/modify/remove]

### 决策准则
[proposed criteria changes]

### 认知模式 (cognitive_patterns)
[emergent cognitive patterns — strengths, biases, default strategies]
```

---

## State Integrity Rules

When reading any `.jsonl` file:

1. Parse each line as JSON — skip unparseable lines, count as corrupt
2. Check required fields (`id`, `timestamp`) — repair if possible
3. Detect duplicate IDs — keep first occurrence
4. Report: "[filename]: [N] lines, [M] corrupt skipped"
5. If >50% corrupt, warn: "文件严重损坏，建议手动检查。"

When writing `.jsonl`:
1. Serialize to JSON
2. Verify JSON is valid
3. Append with trailing `\n`
4. Verify line count after write

---

## Validation Gate

Before passing lens outputs to the adversary:

| Check | Rule |
|-------|------|
| Parse JSON | Each agent output must be valid JSON. If malformed, extract substring between first `{` and last `}`. |
| Required fields | `segments` (non-empty), `focus_segments` (non-empty), `summary` (non-empty string) |
| Sanity check | Do segment labels correspond to actual conversation topics? |
| Classify | `passed` / `degraded` (partial) / `failed` |

**Degraded mode:**

| Survivors | Action |
|-----------|--------|
| 3/3 | Proceed normally |
| 2/3 | Proceed. Tell adversary which lens failed; relax cross-corroboration |
| 1/3 | Proceed with heavy caveat. Report to user. |
| 0/3 | Abort. Save minimal event with `status: "aborted"`. |

---

## Action Experiment Lifecycle

```
active (0-14 days)
  → user reports outcome → status: "completed", outcome: "..."
  → expires after 14 days → status: "expired"
  → user explicitly skips → status: "skipped"
```

At the start of each `/reflect`, check for active experiments. Prompt per the skill's age-based rules.

---

## Key Files

| File | Purpose |
|------|---------|
| `state/user_dna.json` | Cognitive model — read as context, updated by accepted diffs |
| `state/reflections.jsonl` | Reflection event log — append-only |
| `state/records.jsonl` | RAL daily records — from /note, loaded by /reflect |
| `state/distill_reports/` | Growth reports — markdown, one per /distill run |
| `references/reflection-protocol.md` | This file — schemas, lens prompts, adversary rules |
