---
name: smart-commit
description: >
  Smart git commit workflow — auto-classify changed files into "commit" vs
  "ignore" buckets, present for user confirmation, generate a proper commit
  message, then commit and push. Use when the user says "commit", "提交",
  "push", "commit and push", or wants to save their work to git.
  This skill reads git status, applies project conventions (.gitignore,
  CLAUDE.md rules), classifies every changed file, and stages only explicit
  paths. Never stages build artifacts, personal data, or system files.
  User must confirm the file list and message before anything is committed.
---

# Smart Commit Skill

Auto-classify changes → confirm → commit → push.

## Workflow (mandatory order)

1. **Scan** — run `git status`, read `.gitignore`
2. **Classify** — sort every changed file into commit / skip / ask
3. **Present** — show the user exactly what will be committed
4. **Confirm** — wait for user approval
5. **Commit** — stage explicit paths, generate message, commit
6. **Push** — push to origin

Never skip the confirmation step. Never use `git add -A` or `git add .`.

## Step 1: Scan

```bash
git status
```

Read the output. Also read `.gitignore` to understand existing rules. Track:
- Modified tracked files (Changes not staged)
- New untracked files (Untracked files)

## Step 2: Classify

### Always COMMIT

Files that are clearly project source or config meant to be shared:

| Pattern | Reason |
|---------|--------|
| `*.ts`, `*.js`, `*.py`, `*.rs`, `*.go` | Source code |
| `*.md` (docs, not personal) | Documentation |
| `*.json` (config files, not personal data) | Project config |
| `.pi/extensions/*` | Pi extensions |
| `.pi/skills/*/SKILL.md` | Shared skills |
| `.pi/permissions.example.json` | Example/template configs |
| `references/*` | Reference docs |
| `.gitignore`, `.claude/`, `CLAUDE.md` | Project setup files |
| `package.json`, `pyproject.toml`, `Cargo.toml` | Build config |

### Always SKIP

Files that should never be committed:

| Pattern | Reason |
|---------|--------|
| `node_modules/` | Dependencies |
| `dist/`, `output/`, `*.tsbuildinfo` | Build output |
| `.env`, `.env.*` | Secrets |
| `.DS_Store`, `Thumbs.db` | OS files |
| `*.log`, `*.tmp`, `coverage/` | Temp/generated |
| `__pycache__/`, `*.pyc` | Python cache |
| Anything in `.gitignore` | Already excluded |
| `state/*` | Personal data (records, reflections, cognitive model, config) |
| `*.log`, `*.tmp` | Temp files |

### ASK the user

Files that need human judgment:

| Pattern | Why ask |
|---------|---------|
| `.pi/permissions.json` | May contain personal security rules |
| `package-lock.json` | Large diff, may be intentional or noise |
| `*.lock` files | Lockfile changes |

## Step 3: Present

Show the classification results clearly:

```
## 准备提交

### 将提交 (N files)
  .pi/extensions/permission-guard.ts        (modified)
  .pi/skills/smart-commit/SKILL.md           (new)
  references/reflection-protocol.md          (new)

### 将跳过 (M files)
  state/records.jsonl                        (personal data — auto-skipped)
  node_modules/                              (dependencies)
  .DS_Store                                  (OS file)

### 需要确认
  .pi/permissions.json                       (security config)
```

For ASK files, include a one-line reason. Default to SKIP if the user doesn't respond.

### Commit message proposal

Generate a message following the project convention:

```
{feat,fix,docs}[(scope)]: <message>
```

Scan the file list and diff to determine the type:
- New files/features → `feat`
- Bug fixes → `fix`
- Documentation only → `docs`

Scope from the affected paths: `skills`, `extensions`, `references`, `cli`, etc.

Examples:
- `feat(skills): add smart-commit, note, reflect, distill skills`
- `feat(extensions): add permission guard with auto mode and LLM judge`
- `docs(references): add reflection protocol reference`

## Step 4: Confirm

Show the commit message and ask:

> "提交以上 [N] 个文件？"
> "Commit message: [message]"
>
> "(y)es / (e)dit message / (a)dd files to commit / (r)emove files / (c)ancel"

Wait for explicit confirmation. Do NOT proceed on silence.

## Step 5: Commit

Stage explicit paths only:

```bash
git add .pi/extensions/permission-guard.ts .pi/skills/smart-commit/SKILL.md ...
git commit -m "feat(skills): add smart-commit skill"
```

Verify the commit succeeded. Show the SHA.

## Step 6: Push

```bash
git push origin main
```

Verify the push succeeded. Show the remote URL and branch.

### If push fails (not up to date)

```bash
git pull --rebase origin main
```

If rebase conflicts: abort, tell user, let them resolve manually.

If rebase succeeds: retry push.

### Force push safety

Never use `--force`. If the user asks: explain why it's dangerous and suggest alternatives.

## Commit message rules

From CLAUDE.md:
- Format: `{feat,fix,docs}[(scope)]: <message>`
- Scope examples: `ai`, `agent`, `skills`, `tui`, `cli`
- No emojis in commits

Additional guidelines:
- Keep the subject line under 72 characters
- Use the body for details when needed (multi-file, significant changes)
- Reference issue numbers if applicable

## Multi-line commit messages

For significant changes spanning multiple areas, use a subject + body:

```
feat(skills): add memory system with note, reflect, distill

- note: RAL recording layer (capture/amplify/daily/weekly review)
- reflect: multi-pass adversarial extraction (3-lens + adversary)
- distill: cross-reflection synthesis into growth reports
- references/reflection-protocol.md: shared schemas and lens prompts
```

## Edge Cases

| Situation | Response |
|-----------|----------|
| Nothing to commit | "Working tree clean — nothing to commit." |
| Only files in SKIP | "只有个人数据或构建产物的变更。没有需要提交的项目文件。" |
| Merge conflicts | Abort. "有未解决的合并冲突。先解决冲突再提交。" |
| Detached HEAD | Warn. "当前在 detached HEAD 状态。要创建分支来保存这些更改吗？" |
| Not on main | Show current branch. "当前在 [branch]。要 push 到 origin/[branch] 吗？" |
| Unstaged changes in ASK files | Include in ASK section. Don't auto-stage. |
| Large files (>1MB) | Warn. "文件 [name] 超过 1MB —— 确定要提交吗？" |
| User cancels | "已取消。没有提交任何内容。" |

## Key Files

| File | Purpose |
|------|---------|
| `.gitignore` | Read for existing ignore rules |
| `CLAUDE.md` | Commit message format and git conventions |
