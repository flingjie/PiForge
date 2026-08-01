# Verification Failure Diagnosis Layer

Date: 2026-08-01

## Context

The verification-before-completion skill currently acts as a binary exit-code checker. When a verify command fails, it reports "Command exited with code N" with no diagnosis of cause, no tool-specific guidance, and no aggregation across repeated failures. A session with 6 consecutive grep failures produces 6 identical "check the error output" messages — wasting turns and providing zero actionable information.

**Goal:** Insert a diagnosis step between command failure and error report, so the report includes root cause, concrete fix, and a confirmation prompt.

## Architecture

Single-file change: `verification-before-completion/SKILL.md`. Add a "Failure Diagnosis" section after "The Gate Function".

No external state, no code changes. The diagnosis is performed by the LLM controller following rules in the skill file.

## Diagnosis Pipeline

```
RUN command
  │
  ├── exit = 0 → VERIFY as usual (unchanged)
  │
  └── exit ≠ 0 → DIAGNOSE
                    │
                    ├── Step 1: Parse command (tool, flags, chain operators)
                    ├── Step 2: Match against tool-specific rules
                    ├── Step 3: Cross-reference with session failure history
                    ├── Step 4: Classify severity (false-positive / fixable / unknown)
                    └── Step 5: Compose report (root cause + fix + confirm prompt)
```

## Step 1: Parse Command

Extract from the failed command string:

| Signal | Example | Meaning |
|--------|---------|---------|
| Tool name | `grep`, `npm`, `npx`, `tsc`, `vitest`, `curl` | Which rules table to consult |
| Flags | `-c`, `-v`, `-E`, `-n`, `--noEmit` | Refine diagnosis |
| Chain operators | `&&`, `;`, `\|`, `$()` | Can't isolate which sub-command failed |
| Regex metacharacters | `\|`, `.*`, `[`, `{` | Possible regex syntax issue |
| File paths | `/path/to/file` | Check if file exists |

If the command uses `&&` chaining and fails: note that ALL subsequent commands in the chain are skipped. The failure is at the FIRST non-zero exit code. Individual exit codes of later commands are unknown.

## Step 2: Tool-Specific Rules

### grep

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| `-c` flag, exit=1 | Not an error. `grep -c` returns exit 1 when count=0. This is the desired state if verifying absence. | Replace `grep -c 'p' file &&` with `(grep -c 'p' file \|\| echo 0) &&` |
| `\|` in pattern, no `-E` flag | Basic regex does not support alternation. `\|` is treated as literal pipe characters. | Use `grep -E 'pattern1\|pattern2'` or `grep -e pattern1 -e pattern2` |
| `.*` `[` `{` in pattern, no `-E` | These may need escaping in basic regex. | Use `grep -E` for extended regex |
| exit=2 | File not found, permission denied, or syntax error in grep itself. | Check path exists; check for unescaped special chars in pattern |
| `&&` chain with multiple `grep -c` | Can't tell which grep returned 0 vs non-zero. Even if exit=0, an intermediate `grep -c` returning 0 with exit 1 would break the chain incorrectly. | Split into separate commands or use `;` instead of `&&`, checking each result individually |

### npm / npx

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit≠0, stderr contains error | Extract last 3 lines of stderr. These are usually the actionable error. | Present the stderr snippet as diagnosis |
| `npm install` fails | Dependency resolution, network, or package not found. | Show stderr; common fixes: `--ignore-scripts`, `--legacy-peer-deps` |
| `npx` command not found | Package not installed or wrong name. | Show stderr; suggest `npm ls <pkg>` or `which <cmd>` |

### tsc

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit=2, output contains error TS#### | TypeScript compilation errors. | Extract error lines with file:line:col: message. Present specific errors. |
| `--noEmit` present | Type-check only, not a build failure. | List the specific type errors found. |

### vitest / test runner

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit=1, "N failed" in output | Test failures, not a command error. | Extract the count and list the first 3 failing test names. |
| exit≠0, no test output | Runner didn't execute (config error, missing file). | Check the test path; suggest `--reporter=verbose` |

### curl

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| exit=7 | Failed to connect (network, wrong host, port closed). | Check URL, check if service is running |
| exit=6 | DNS resolution failed. | Check hostname |
| exit=28 | Timeout. | Increase `--connect-timeout` or `--max-time` |

### Unknown / unlisted tool

| Signal | Diagnosis | Fix |
|--------|-----------|-----|
| Any exit≠0 | Present exit code and any stderr output. | "Unknown tool `<name>` — no diagnosis rules available. Check the output manually." |

## Step 3: Cross-Attempt Aggregation

Before composing the report, scan the current conversation for previous verification failures. Maintain a mental tally:

```
{ tool: "grep", pattern: "\| without -E", count: N }
{ tool: "grep", pattern: "-c + &&", count: N }
```

Aggregation rules:

| Count | Action |
|-------|--------|
| 1 | Normal diagnosis — present root cause + fix |
| 2 | Note "2nd occurrence of same pattern" |
| 3-4 | **Escalate:** "3rd consecutive grep failure with same pattern — this is a systematic tool usage issue, not a code problem. Fix the approach, don't retry with same command." |
| ≥5 | **Block:** "5th consecutive failure. Stop. The current approach to verification is broken. Before retrying: fix the grep usage pattern. No further attempts will succeed with the same approach." |

If consecutive failures span different tools or patterns, still note the accumulation: "6 verification failures this session — consider whether the verification commands themselves need review."

## Step 4: Classify Severity

| Classification | Criteria | Report Tone |
|----------------|----------|-------------|
| **False positive** | Desired state (e.g., `grep -c` returning 0). Exit code ≠0 is correct behavior. | "Not actually a failure — `<reason>`. But the command structure needs fixing." |
| **Tool usage error** | Command has a syntax/flag issue (e.g., `\|` without `-E`). Fixing the command will fix the verification. | "Tool usage issue: `<diagnosis>`. Fix: `<concrete fix>`." |
| **Code/state error** | Command is correct but code/test/config is broken. | "Verification failed: `<evidence>`. `<potential fix direction>`." |
| **Unknown** | Can't classify — fall through. | "Exit code N. No matching diagnosis rule. Raw output: `<stderr>`." |

## Step 5: Report Format

```
## Verification Failed

**Severity:** [Tool usage error]
**Root cause:** grep basic regex — `\|` alternation requires `-E` flag
**Pattern:** 3rd consecutive grep failure with `\|`
**Fix:** Replace `grep 'A\|B'` with `grep -E 'A|B'`

Apply this fix? (y/n)
```

For false positives:
```
## Verification — False Positive

**Root cause:** `grep -c` returned exit 1 on zero matches — this is the desired result
**Fix:** Replace `grep -c 'old' file && grep -c 'new' file` with separate commands

Apply this fix? (y/n)
```

For cross-attempt aggregation at threshold:
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

## When to Skip Diagnosis

Skip and fall back to current generic report when:
- The tool is not in the rules table AND stderr is empty or unhelpful
- The failure is clearly a one-off (network timeout, transient error)

But even for unknown tools, always extract and present any stderr output — never show "(no output)" when there's data available.

## File Change

Single file: `.pi/skills/superpowers/skills/verification-before-completion/SKILL.md`

Add `## Failure Diagnosis` section after `## The Gate Function`. The gate function itself gets one extra step:

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
   → If exit ≠ 0: RUN DIAGNOSIS (see Failure Diagnosis section below)
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim
```

## Out of Scope

- Automated diff analysis after test failure (separate feature)
- Persistent failure database (stateless, conversation-scoped only)
- Integration with design-arena or other skills
- Diagnosis rules for tools not used in this project (extensible by adding rows to rules tables)

## Verification

Test: Run `grep -c 'missing' file && grep -c 'present' file` where file exists and contains 'present' but not 'missing'. Expected: diagnostic report identifies `-c + &&` false positive, suggests fix. Run `grep 'A\|B' file`. Expected: diagnostic report identifies `\|` without `-E`, suggests `grep -E`.
