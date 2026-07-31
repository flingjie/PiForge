---
name: eval
description: Evaluate agent behavior changes after configuration updates. Trigger on "/eval", "evaluate", "benchmark", "run eval", "测试效果", "评估".
---

# Eval Skill

Evaluates agent behavior by running a fixed test suite and comparing output quality before and after configuration changes.

## Test Suite

Test cases live in `state/eval/tests.json` as a JSON array. Each test case:

| Field | Description |
|-------|-------------|
| `id` | Unique string identifier |
| `name` | Human-readable label |
| `prompt` | The message sent to the agent |
| `expected_tools` | Array of tool names the agent should use |
| `max_turns` | Maximum allowed turns |
| `success_criteria` | Short description of what good output looks like |

## Commands

| Command | Action |
|---------|--------|
| `/eval run [test_id]` | Run a specific test by id |
| `/eval run all` | Run the entire test suite |
| `/eval report` | Show the most recent run results |
| `/eval compare` | Compare last two runs (before/after config change) |

## Workflow

### 1. Load Tests

Read `state/eval/tests.json`. If missing or empty, report an error.

### 2. Run Each Test

For each test case:
1. Send the `prompt` to the agent via `pi.sendUserMessage`
2. Observe every tool call the agent makes
3. Track the total turn count
4. Capture the final response text

### 3. Score Each Test

Compute three sub-scores and combine them:

**Tool accuracy (0-1)**: `|expected_tools ∩ used_tools| / |expected_tools|`. Full credit when every expected tool was called at least once. Extra tools not in `expected_tools` do not penalise this score.

**Turn efficiency (0-1)**: `1.0` if `turns <= max_turns`, else `max_turns / turns`. Rewards completing the task within the turn budget.

**Output quality (0-0.5, manual)**: Heuristic or manual assessment against `success_criteria`. Check that the response addresses the prompt fully and the tools were used for their intended purpose. 0 = irrelevant/hallucinated, 0.25 = partially correct, 0.5 = fully correct.

**Total**: `min(tool_accuracy + turn_efficiency + output_quality, 1.0)`. Clamped to 1.0.

A test **passes** when its total score is >= 0.7.

### 4. Write Results

Save results to `state/eval/results_{timestamp}.json` with the format below. Also write a symlink or pointer at `state/eval/latest.json` so `/eval report` finds the most recent run quickly.

### 5. Compare Runs

`/eval compare` loads the two most recent result files and computes a delta:

```
read-file:    0.95 -> 0.88  ▼ -0.07
search-json:  0.80 -> 1.00  ▲ +0.20
web-search:   0.75 -> 0.75  = unchanged
```

Also print an overall summary:
```
Avg score: 0.83 -> 0.88  ▲ +0.05
Pass rate: 3/5 -> 4/5   ▲ +1
```

Highlight regressions (score drop >= 0.10) with a warning.

## Result Format

```json
{
  "run_id": "eval_20260731_140000",
  "timestamp": "2026-07-31T14:00:00Z",
  "config_snapshot": {
    "model": "claude-sonnet-4-20250514",
    "skills_loaded": ["eval"]
  },
  "tests": [
    {
      "id": "read-file",
      "passed": true,
      "tools_used": ["read"],
      "turns": 2,
      "score": 0.95,
      "sub_scores": {
        "tool_accuracy": 1.0,
        "turn_efficiency": 1.0,
        "output_quality": 0.5
      },
      "notes": "Correctly identified all sections of CLAUDE.md"
    }
  ],
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "avg_score": 0.82
  }
}
```
