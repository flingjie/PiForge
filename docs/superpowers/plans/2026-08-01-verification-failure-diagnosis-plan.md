# Verification Failure Diagnosis Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Add failure diagnosis to verification-before-completion: when a verify command fails, diagnose the root cause, provide a concrete fix, and aggregate repeated failures across the session.

**Architecture:** Single-file change — add Failure Diagnosis section to verification-before-completion/SKILL.md, update Gate Function step 3 to route through diagnosis on failure.

**Tech Stack:** Markdown documentation only.

## Global Constraints

- `contractSuite` is the exported contract test name (from parent spec, not used here)
- No emojis in committed content
- Keep the verification skill's existing tone (direct, no fluff, evidence-before-claims)

## Dependency Graph

```
[1]
```

## Concurrent Groups

```
G1: [1]
```

---

### Node 1: Add Failure Diagnosis section

**Files:**
- Modify: `.pi/skills/superpowers/skills/verification-before-completion/SKILL.md`

**Interfaces:**
- Consumes: nothing
- Produces: Failure Diagnosis section with diagnosis pipeline (5 steps), tool-specific rules table, aggregation thresholds, report format

**Exit Criteria:**
- Gate Function step 3 updated: `→ If exit ≠ 0: RUN DIAGNOSIS (see Failure Diagnosis section)`
- New `## Failure Diagnosis` section added after `## The Gate Function`, containing:
  - Overview: diagnosis pipeline description (parse → match rules → aggregate → classify → report)
  - Tool-specific rules for grep, npm/npx, tsc, vitest, curl, unknown tools
  - Cross-attempt aggregation: count thresholds at 2 (note), 3-4 (escalate), ≥5 (block)
  - Severity classification: false positive, tool usage error, code/state error, unknown
  - Report format: root cause + fix + confirm prompt
  - When to skip diagnosis

**Contract Test:** Not applicable.

**Verify:**
```bash
# Check that Failure Diagnosis section exists
grep -c 'Failure Diagnosis' .pi/skills/superpowers/skills/verification-before-completion/SKILL.md
# Expected: >= 1

# Check that gate function was updated
grep -c 'RUN DIAGNOSIS' .pi/skills/superpowers/skills/verification-before-completion/SKILL.md
# Expected: >= 1

# Check tool rules exist
grep -c 'grep -c.*exit=1' .pi/skills/superpowers/skills/verification-before-completion/SKILL.md
# Expected: >= 1

# Check aggregation exists
grep -c '5th consecutive\|5 consecutive' .pi/skills/superpowers/skills/verification-before-completion/SKILL.md
# Expected: >= 1
```

**DependsOn:** []
