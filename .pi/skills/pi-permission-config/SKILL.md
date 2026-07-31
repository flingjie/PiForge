---
name: pi-permission-config
description: >
  Read and configure Pi's project-level permission rules (.pi/permissions.json).
  Use when the user asks about Pi permissions, wants to view/edit permission rules,
  block/allow specific tools or commands, toggle auto mode, configure the judge LLM,
  or set up security policies for the coding agent.
  Triggers on -- "pi permission", "permission config", "权限", "permission rule",
  "allow/deny tool", "auto mode", "judge model", "安全策略", "block bash",
  "protect file", and any request involving Pi tool access control.
---

# Pi Permission Config

Read and update the project-level permission configuration for the Pi coding agent (`.pi/permissions.json`).

## Workflow (mandatory order)

1. **Show** — read `.pi/permissions.json` and display the current state in a human-friendly format
2. **Understand** — ask the user what they want to change, and why
3. **Propose** — show the exact JSON diff or new config the changes would produce
4. **Confirm** — wait for explicit user approval before writing
5. **Apply** — write the file and run a quick validation with `npx pi -p "ok"` to confirm the extension loads without errors

Never skip the confirmation step. The user must see and approve changes before they are written.

## Config file location

Only manage the **project-level** file:

```
{cwd}/.pi/permissions.json
```

The global config at `~/.pi/agent/permissions.json` is out of scope. If the user needs global config, mention it but direct them to edit it manually.

## Schema reference

```jsonc
{
  "mode": "auto",           // "auto" | "default" — auto = LLM judge for unmatched ops
  "judge": {                // optional, only meaningful in auto mode
    "provider": "anthropic",  // provider slug (default: "anthropic")
    "model": "claude-haiku-4-5", // model ID for judge (default: "claude-haiku-4-5")
    "contextTokens": 2000,    // max tokens of conversation context for judge (default: 2000)
    "prompt": "..."           // custom judge system prompt (optional)
  },
  "fallback": "deny_writes", // "deny_writes" | "deny" | "allow" — what to do when judge fails
  "rules": [                 // ordered list, first-match-wins
    {
      "action": "allow",     // "allow" | "deny"
      "tool": "bash",        // tool name (omit to match all tools)
      "command": "git *",    // glob for bash commands (only for bash)
      "path": "./src/**",    // glob for file paths (read, write, edit, ls)
      "pattern": "*.test.*"  // glob for grep/find patterns (only for grep, find)
    }
  ]
}
```

## Rule matching

### Built-in tool → matching field

| Tool | Match field | Example |
|------|------------|---------|
| `bash` | `command` | `{ "action": "allow", "tool": "bash", "command": "npm *" }` |
| `read` | `path` | `{ "action": "deny", "tool": "read", "path": ".env" }` |
| `write` | `path` | `{ "action": "deny", "tool": "write", "path": "*.env" }` |
| `edit` | `path` | `{ "action": "deny", "tool": "edit", "path": "*.env" }` |
| `ls` | `path` | `{ "action": "allow", "tool": "ls", "path": "./src/**" }` |
| `grep` | `pattern` | `{ "action": "allow", "tool": "grep" }` |
| `find` | `pattern` | `{ "action": "allow", "tool": "find" }` |
| custom tools | none (tool name only) | `{ "action": "deny", "tool": "my_tool" }` |

### Glob patterns

Uses [minimatch](https://github.com/isaacs/minimatch). Key behaviors:

- `"*.ts"` matches `file.ts` but NOT `src/file.ts`
- `"**/*.ts"` matches `file.ts` AND `src/file.ts`
- `"./src/**"` matches everything under `./src/`
- `"git *"` matches `git status`, `git diff`, etc.
- `"*rm*"` matches any command containing "rm"
- For `path` rules, basename fallback is automatic: `"CLAUDE.md"` also matches `./CLAUDE.md` and `/absolute/path/CLAUDE.md`

### Tool-only rules (no params)

Omit `command`/`path`/`pattern` to match the tool by name only:

```json
{ "action": "allow", "tool": "read" }    // allow ALL read calls
{ "action": "deny", "tool": "write" }    // deny ALL write calls
```

### Match-all rules

Omit `tool` to match every tool:

```json
{ "action": "deny", "command": "rm *" }  // deny rm commands regardless of tool
```

## Common configuration patterns

### Pattern 1: Read-only mode for a project

```json
{
  "rules": [
    { "action": "allow", "tool": "read" },
    { "action": "allow", "tool": "grep" },
    { "action": "allow", "tool": "find" },
    { "action": "allow", "tool": "ls" },
    { "action": "allow", "tool": "bash", "command": "git *" },
    { "action": "allow", "tool": "bash", "command": "ls*" },
    { "action": "allow", "tool": "bash", "command": "cat*" },
    { "action": "deny", "tool": "bash" },
    { "action": "deny", "tool": "write" },
    { "action": "deny", "tool": "edit" }
  ]
}
```

### Pattern 2: Protect sensitive files

```json
{
  "rules": [
    { "action": "deny", "path": ".env" },
    { "action": "deny", "path": "*.env" },
    { "action": "deny", "path": ".git/**" }
  ]
}
```

### Pattern 3: Auto mode with allowlist

```json
{
  "mode": "auto",
  "judge": { "model": "claude-haiku-4-5" },
  "rules": [
    { "action": "allow", "tool": "read", "path": "./**" },
    { "action": "allow", "tool": "bash", "command": "npm *" },
    { "action": "allow", "tool": "bash", "command": "git *" },
    { "action": "allow", "tool": "grep" },
    { "action": "allow", "tool": "find" },
    { "action": "allow", "tool": "ls" }
  ]
}
```

### Pattern 4: Deny destructive bash, judge the rest

```json
{
  "mode": "auto",
  "rules": [
    { "action": "deny", "tool": "bash", "command": "rm *" },
    { "action": "deny", "tool": "bash", "command": "sudo *" },
    { "action": "deny", "tool": "bash", "command": "chmod *" },
    { "action": "deny", "tool": "write", "path": "*.env" },
    { "action": "deny", "tool": "write", "path": ".git/**" }
  ]
}
```

## Display format

When showing the current config, present it as:

```
## Pi Permission Config (.pi/permissions.json)

**Mode:** auto (LLM judge enabled)
**Judge:** anthropic/claude-haiku-4-5 (context: 2000 tokens)
**Fallback:** deny_writes

**Rules (first-match-wins):**
1. ALLOW  bash   command: "git *"
2. ALLOW  read   path:     "./src/**"
3. DENY   write  path:     "*.env"

(No rules configured — all operations pass through)
```

Use this structure consistently so users recognize it between invocations.

## Edge cases

- **File doesn't exist**: show "No permissions.json found — all operations pass through. Create one?" and offer to generate from a template
- **Malformed JSON**: show the parse error, offer to fix or regenerate
- **Empty rules array**: mention that all tools are unrestricted, offer to add rules
- **Mode is "default" without rules**: the extension is completely inert, explain that `--auto` CLI flag or setting `"mode": "auto"` activates it
- **Conflicting rules**: point out if an earlier rule shadows a later one (e.g., rule 1 allows all bash, rule 5 denies `rm *` — the deny will never fire)
- **Rule order matters**: remind users that rules are evaluated top-to-bottom; the most specific rules should come first

## Adding rules

When the user asks to add a rule, determine:
1. What tool it applies to (or all tools)
2. What action (allow/deny)
3. What condition (command glob, path glob, pattern glob, or none)
4. Where in the list it should go

"Where in the list" is critical. Ask the user, or recommend:
- **Deny rules first** (specific blocks before broad allows)
- **Specific rules before general rules** (e.g., allow `git *` before denying all bash)
- **New rules at the top** unless the user says otherwise

## Removing rules

When removing rules, understand that deleting a rule changes the behavior of all rules after it. Show the resulting rule list and explain any behavior changes caused by reordering.

## The judge LLM

Explain the judge briefly when relevant:
- Only used in auto mode
- Called for tool calls that don't match any rule
- Defaults to `anthropic/claude-haiku-4-5` via the proxy's Anthropic Messages API
- Configurable: provider, model, context window size, and custom system prompt
- Session-cached: same (tool, params) won't be re-judged within one session
- Falls back to `deny_writes` (block bash/write/edit, allow read/grep/find/ls) when the judge LLM is unavailable

## Differences from global config

The project config `.pi/permissions.json` overrides the global config `~/.pi/agent/permissions.json` at the top-level key level. The merge is NOT deep:

- `mode` — project overrides global
- `judge` — project's fields merge shallowly over global's
- `fallback` — project overrides global
- `rules` — project REPLACES global entirely (no merge)

Remind users that if they have important global rules, they should duplicate them in the project config if needed.
