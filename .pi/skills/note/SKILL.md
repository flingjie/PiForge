---
name: note
description: >
  Lightweight personal record keeper — capture moments that feel significant,
  amplify them with meaning, and let them feed into /reflect for pattern discovery.
  Triggers: "/note", "记一下", "take a note", "capture this", "weekly review",
  "周回顾", "展开记录", "amplify this", "看记录", "note list", "daily review",
  "日复盘".
  RAL model: Record (10s capture) → Amplify (2min meaning) → Layer (active|accumulating|archived).
  Records are stored in state/records.jsonl and loaded by /reflect as extra signal sources.
---

# Note Skill — RAL Recording Layer

Lightweight personal record keeper. Capture moments that feel significant, gradually add meaning — without turning it into a diary burden.

## RAL Model

```
Record (捕获) → Amplify (放大) → Layer (分层)
  10s              2min             ongoing
```

- **Record**: one-line event. Don't overthink. 10 seconds.
- **Amplify**: add feeling + what this reveals about you. 2 minutes max. Can be done later.
- **Layer**: active (current experiment) | accumulating (pattern forming) | archived (saved, not active)

## When to Use

| Trigger | Action |
|---------|--------|
| "/note capture", "记一下", "take a note" | Quick capture mode |
| "/note amplify", "展开记录" | Add meaning to unamplified records |
| "/note daily", "日复盘" | 30-second end-of-day pulse check |
| "/note weekly", "周回顾" | Weekly connection exercise |
| "/note list", "看记录" | Browse records |
| "/note" (no args) | Show status + suggest next action |

## Integrity on Every File Open

Before any read/write of `state/records.jsonl`, run integrity checks per `references/reflection-protocol.md` (State Integrity section):

1. Parse each line as JSON — skip unparseable, count corrupt
2. Check required fields (`id`, `timestamp`) — repair if possible
3. Detect duplicate IDs — keep first occurrence
4. Report: "records.jsonl: [N] records, [M] corrupt skipped"
5. If >50% corrupt, warn: "记录文件严重损坏，建议手动检查 state/records.jsonl。"

When writing: serialize first, verify JSON is valid, append with trailing `\n`. Verify line count after write.

## Record Schema

```json
{
  "id": "uuid",
  "timestamp": "ISO 8601",
  "layer": "active|accumulating|archived",
  "type": "event|daily_review|weekly_review",
  "event": "one-line description of what happened",
  "feeling": "excitement|frustration|pride|anxiety|curiosity|satisfaction|disappointment|neutral|null",
  "amplification": "what this reveals — null until amplify step",
  "value_tags": ["autonomy", "creation", ...],
  "domain_tags": ["coding", "design", ...],
  "energy": "energizing|draining|neutral|null",
  "linked_records": [],
  "linked_reflection_id": null,
  "processed_at": null
}
```

---

## Commands

### 1. Capture (`/note capture`)

When user says "记一下" or "take a note":

**Step 1: Ask for the event**

> "今天发生了什么让你有波动的事？一句话就行。"

If user provides context in the prompt (e.g., "take a note: just had a heated debate about API design"), use it directly.

**Step 2: Quick feeling (optional)**

> "什么感受？[兴奋/沮丧/好奇/焦虑/满足/无/跳过]"

**Step 3: Save**

Write the record to `state/records.jsonl`.

> "已记录。ID: [id] — 有空时可以 `/note amplify` 展开看看这条记录说明什么。"

**At most 3 exchanges. This is not an interview.**

### 2. Amplify (`/note amplify`)

When user says "展开记录" or "amplify":

**Step 1: List unamplified records**

> "你有 [N] 条未展开的记录："
>
> | # | 日期 | 事件 | 感受 |
> |---|------|------|------|
>
> "要展开哪一条？（输入编号，或 'all' 逐条来）"

**Step 2: Amplify the selected record**

> **事件**: [event]
>
> 1. "为什么这件事让你产生这种感受？"
> 2. "这说明了你的什么特点或在意什么？"

Also invite value and domain tags (see Tag Catalog in `references/reflection-protocol.md`).

**Step 3: Layer**

> "这条记录的状态？"
> - **活跃** (active) — 正在进行的实验/信号
> - **累积** (accumulating) — 留待以后联结（默认）
> - **归档** (archived) — 记下来就够了

> "已展开。ID: [id] — 下次 `/reflect` 会自动加载这条记录。"

### 3. Daily Review (`/note daily`)

30-second end-of-day pulse. ONE question. Not a mini-reflect.

**Pulse question:**

> "今天哪个瞬间让你觉得'这就是我'——让你感到能量、投入、或者对劲的瞬间？"

Optional shadow: "今天有什么让你感到消耗或不对劲的？（可选）"

Write a `type: "daily_review"` record with the pulse + shadow.

> "已记下。今天的方向信号: [pulse]."

### 4. Weekly Review (`/note weekly`)

Gather this week's records (last 7 days). If < 3: "本周只有 [N] 条，等至少 3 条再来。"

> "本周记录了 [N] 件事：[table]"
> "这些事件之间有什么关联吗？试着画个箭头——这些事件指向什么方向？"
> "用一句话总结——本周这些事件告诉你什么？"

Write a `type: "weekly_review"` record with connections + direction.

> "已保存。方向箭头：[one-line insight]。这些联结会在下次 `/reflect` 时一并分析。"

### 5. List (`/note list`)

Show compact table of all records, grouped by layer. Count active/accumulating/archived.

### 6. Default (`/note` with no args)

Show status + suggest next action based on time of day and record state.

---

## Integration with /reflect

Records are passive until `/reflect` runs. Reflect loads unprocessed records as additional signal sources for all three Lens agents. After processing, `processed_at` is set and `linked_reflection_id` points to the reflection.

## Key Files

| File | Purpose |
|------|---------|
| `state/records.jsonl` | All records — events, amplifications, reviews |
| `references/reflection-protocol.md` | Tag Catalog + state integrity rules |
| `state/reflections.jsonl` | Records link here via `linked_reflection_id` |
