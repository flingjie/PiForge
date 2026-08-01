---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# Verification Before Completion

## Overview

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
   → If exit ≠ 0: RUN DIAGNOSIS (see Failure Diagnosis section below)
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Failure Diagnosis

When a verify command fails (exit ≠ 0), diagnose the root cause BEFORE
reporting. Do not just report "command failed" — explain why and provide
a concrete fix.

### Diagnosis Pipeline

```
Command fails (exit ≠ 0)
  │
  ├── Step 1: Parse the command — identify tool name, flags, chain operators
  ├── Step 2: Match against tool-specific diagnosis rules below
  ├── Step 3: Scan conversation history for same-pattern failures (aggregation)
  ├── Step 4: Classify severity (false-positive / tool-usage / code-error / unknown)
  └── Step 5: Compose report with root cause + concrete fix + confirmation prompt
```

### Step 1: Parse the Command

| Signal | Example | Meaning |
|--------|---------|---------|
| Tool name | `grep`, `npm`, `npx`, `tsc`, `vitest`, `curl` | Which rules table to consult |
| Flags | `-c`, `-v`, `-E`, `-n`, `--noEmit` | Refine diagnosis |
| Chain operators | `&&`, `;`, `|`, `$()` | Cannot isolate which sub-command failed |
| Regex metacharacters | `\|`, `.*`, `[`, `{` | Possible regex syntax issue |

If the command uses `&&` chaining: the failure is at the FIRST non-zero exit
code. All subsequent commands in the chain are skipped — their exit codes are
unknown. Always split `&&` chains or use `;` when checking multiple conditions
independently.

### Step 2: Tool-Specific Rules

#### grep

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| `-c` flag, exit=1 | **False positive.** `grep -c` returns exit 1 when count=0. If verifying absence, exit 1 = correct result (0 matches). | Replace `grep -c 'p' file &&` with `(grep -c 'p' file \|\| echo 0) &&` to tolerate zero matches |
| `\|` in pattern, no `-E` | **Tool usage error.** Basic regex does not support alternation. `\|` is treated as literal pipe characters, not OR operator. | Use `grep -E 'pattern1\|pattern2'` or `grep -e pattern1 -e pattern2` |
| `.*`, `[`, `{` in pattern, no `-E` | **Tool usage error.** These may need escaping in basic regex. | Use `grep -E` for extended regex |
| exit=2 | File not found, permission denied, or grep syntax error. | Check the file path exists; check for unescaped special characters in the pattern |
| `&&` chain with multiple `grep -c` | **False positive risk.** An intermediate `grep -c` returning 0 with exit 1 breaks the chain — you cannot tell which grep succeeded. | Split into separate commands or use `;` instead of `&&`, evaluating each result individually |

#### npm / npx

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit≠0, stderr present | Extract last 3 lines of stderr — these are usually the actionable error. | Present the stderr snippet as diagnosis |
| `npm install` fails | Dependency resolution, network, or package not found. | Show stderr; common fixes: `--ignore-scripts`, `--legacy-peer-deps` |
| `npx` command not found | Package not installed or wrong name. | Show stderr; suggest `npm ls <pkg>` or `which <cmd>` |

#### tsc

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit=2, output contains `error TS` | TypeScript compilation errors. | Extract error lines with file:line:col: message. List specific errors. |
| `--noEmit` present | Type-check only — verify this was the intent. | List the specific type errors found; suggest fixes if patterns are recognizable |

#### vitest / test runner

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit=1, "N failed" in output | Test failures, not a command error. | Extract the failure count and list the first 3 failing test names |
| exit≠0, no test output | Runner did not execute (config error, missing file). | Check the test path; suggest `--reporter=verbose` for more detail |

#### curl

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit=7 | Failed to connect (network, wrong host, port closed). | Check URL, check if service is running |
| exit=6 | DNS resolution failed. | Check hostname |
| exit=28 | Timeout. | Increase `--connect-timeout` or `--max-time` |

#### Unknown / unlisted tool

Present exit code and any stderr output. Say: "No diagnosis rules for `<name>`. Raw output: `<stderr>`."

### Step 3: Cross-Attempt Aggregation

Before reporting, scan the current conversation for previous verification
failures. Count occurrences of the same tool+pattern combination:

| Count | Action |
|-------|--------|
| 1 | Normal diagnosis — present root cause + fix |
| 2 | Note "2nd occurrence of same pattern" in report |
| 3-4 | **Escalate.** "Nth consecutive `<tool>` failure with same pattern — this is a systematic tool usage issue, not a code problem. Fix the approach, don't retry with the same command." |
| ≥5 | **Block.** "5th consecutive failure. Stop. The current approach to verification is broken. Before retrying: fix the usage pattern. No further attempts will succeed with the same approach." |

If failures span different tools or patterns, still note the accumulation:
"N verification failures this session — consider whether the verification
commands themselves need review."

### Step 4: Classify Severity

| Classification | Criteria |
|----------------|----------|
| **False positive** | Desired state (e.g., `grep -c` returning 0). Exit code ≠0 is correct but command structure is wrong. |
| **Tool usage error** | Command has a syntax/flag issue. Fixing the command will fix the verification. |
| **Code/state error** | Command is correct but code/test/config is broken. |
| **Unknown** | Cannot classify — fall through. |

### Step 5: Report Format

Every report must include: root cause, concrete fix, and a confirmation prompt.

**For tool usage errors:**
```
## Verification Failed

**Severity:** Tool usage error
**Root cause:** grep basic regex — `\|` alternation requires `-E` flag
**Pattern:** 3rd consecutive grep failure with `\|`
**Fix:** Replace `grep 'A\|B'` with `grep -E 'A|B'`

Apply this fix? (y/n)
```

**For false positives:**
```
## Verification — False Positive

**Root cause:** `grep -c` returned exit 1 on zero matches — this is the desired result (verifying absence works correctly)
**Fix:** Replace `grep -c 'old' file && grep -c 'new' file` with separate commands using `|| echo 0` to tolerate zero-match exit codes

Apply this fix? (y/n)
```

**At block threshold (≥5 same pattern):**
```
## Verification Failed — Blocked (5th consecutive grep failure)

**Pattern:** All 5 failures are grep regex syntax issues
**Action:** Stop. Fix the grep approach before retrying.
**Options:**
1. Use `grep -E` for all alternation patterns
2. Use `grep -e p1 -e p2` instead of `\|`
3. Split `&&` chains into separate verification commands

Which approach?
```

### When to Skip Diagnosis

Fall back to current generic report when:
- The tool is not in the rules table AND stderr is empty or unhelpful
- The failure is clearly a transient one-off (network timeout, rate limit)

Even for unknown tools, always extract and present any stderr output — never
show "(no output)" when data is available.

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness
