---
name: visualize
description: >
  Generate interactive HTML visualizations from PiForge trace data. Use when the user
  wants to visually explore agent execution history, decision debates, tool call traces,
  or get a comprehensive dashboard. Triggers on: "/visualize", "/viz", "visualize",
  "可视化", "生成可视化", "show me the pipeline map", "visualize the execution",
  "生成流程地图", "工作流可视化", "可视化地图", "execution map", "trace map",
  "dashboard", "see the pipeline", "view execution history", "看看管道",
  "可视化管道", "生成仪表盘", "流程图".
---

# Visualize Skill

Generate self-contained, interactive HTML visualizations from PiForge trace data. Turns
Markdown trace files and JSONL tool-call logs into human-friendly maps, timelines, and
dashboards that open in any browser — zero dependencies, single file.

## When to Use

- User asks to visualize, map, or chart any trace data
- After a pipeline run completes — offer to visualize the result
- User wants to review historical runs or spot trends
- User types `/visualize` or `/viz`

Do NOT use for:
- Live/running pipelines (trace files must be written first)
- Non-trace data (logs, configs, etc.)

## Modes

| Mode | Data Source | Output |
|------|-------------|--------|
| `pipeline` | `output/traces/index.md` + `output/traces/todo-*.md` | Run history timeline + per-run node status flow chart |
| `arena` | `output/traces/arena-*.md` + `output/traces/index.md` | Decision debate maps — proposals, scores, critiques, verdict |
| `trace` | `.pi/state/traces.jsonl` | Tool-call waterfall chart + cost breakdown + session stats |
| `full` | All of the above | Unified dashboard — three panels in one page |

Default mode is `full` if the user doesn't specify.

## Workflow

### Step 1: Confirm Mode

If the user didn't specify a mode and there's ambiguity, ask briefly. Otherwise default to `full`.
If the user passes a specific pipeline ID (e.g., `/visualize pipeline abc123`), scope to that run.

### Step 2: Read Data

Read the relevant source files. For each file that doesn't exist, skip that panel in the output
and note the missing data in a small info card — never fail the whole visualization because one
source is missing.

### Step 3: Generate HTML

Build a self-contained HTML file according to the templates in the "HTML Generation Reference"
section below. Write it to `output/visualizations/{mode}-{timestamp}.html`.

### Step 4: Open

After writing, tell the user the file path and offer to open it:
- macOS: run `open <path>`
- Other platforms: provide the path and let the user open it

## HTML Generation Reference

### Global Constraints

Every generated HTML file must:

1. **Be self-contained** — all CSS and JS inline in `<style>` and `<script>` tags. No external
   fonts, CDN scripts, or image URLs. Use system font stack.
2. **Support dark/light themes** — use the CSS pattern below. Define light palette on `:root`,
   dark palette under `@media (prefers-color-scheme: dark)` guarded by
   `:root:not([data-theme="light"])`, and explicit `[data-theme="dark"]` overrides. Add a small
   theme toggle button (sun/moon icons as text: ☀ / ☾) in the top-right corner.
3. **Stay under 1MB** — keep HTML under 1MB total. If data is too large, aggregate or show
   top-N items with a note.
4. **Be responsive** — use CSS Grid and Flexbox. Mobile should stack panels vertically; desktop
   shows side-by-side where appropriate.

### CSS Theme Variables

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;
  --bg-card: #ffffff;
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --border: #e5e5e7;
  --accent: #0071e3;
  --accent-dim: rgba(0, 113, 227, 0.1);
  --success: #34c759;
  --warning: #ff9500;
  --danger: #ff3b30;
  --persona-speed: #0071e3;
  --persona-maintain: #5856d6;
  --persona-minimal: #ff9500;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  --radius: 10px;
}

:root:not([data-theme="light"]) {
  @media (prefers-color-scheme: dark) {
    --bg-primary: #1c1c1e;
    --bg-secondary: #2c2c2e;
    --bg-card: #2c2c2e;
    --text-primary: #f5f5f7;
    --text-secondary: #98989d;
    --border: #3a3a3c;
    --accent: #0a84ff;
    --accent-dim: rgba(10, 132, 255, 0.15);
    --success: #30d158;
    --warning: #ff9f0a;
    --danger: #ff453a;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
}

:root[data-theme="dark"] {
  --bg-primary: #1c1c1e;
  --bg-secondary: #2c2c2e;
  --bg-card: #2c2c2e;
  --text-primary: #f5f5f7;
  --text-secondary: #98989d;
  --border: #3a3a3c;
  --accent: #0a84ff;
  --accent-dim: rgba(10, 132, 255, 0.15);
  --success: #30d158;
  --warning: #ff9f0a;
  --danger: #ff453a;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 24px;
  line-height: 1.5;
}

.theme-toggle {
  position: fixed; top: 16px; right: 16px;
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-primary); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.theme-toggle:hover { background: var(--accent-dim); }

h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }

.card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px;
  box-shadow: var(--shadow-sm);
}
```

### Layout Shell

```html
<button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">☀</button>

<h1>PiForge Visualization — {mode}</h1>
<p style="color:var(--text-secondary);margin-bottom:24px">
  Generated {timestamp} from {data sources}
</p>

<div class="dashboard" style="display:flex;flex-direction:column;gap:20px">
  <!-- panels go here -->
</div>

<script>
function toggleTheme() {
  const root = document.documentElement;
  const btn = document.querySelector('.theme-toggle');
  if (root.dataset.theme === 'dark') {
    delete root.dataset.theme;
    btn.textContent = '☀';
  } else {
    root.dataset.theme = 'dark';
    btn.textContent = '☾';
  }
}
</script>
```

### Panel 1: Pipeline History (pipeline mode / full mode)

**Data source:** `output/traces/index.md`

Parse the markdown table rows. If `index.md` doesn't exist, show an empty-state card:

```
"&#128450; No pipeline runs found. Run a pipeline with trace enabled to populate index.md."
```

If data exists, render TWO sections:

#### 1a. Run History Timeline

A vertical timeline of pipeline runs. Each entry is a horizontal bar showing:

```
[timestamp] ── [pipelineId link] ── [plan name] ── decisions: N ── todo: C/T
```

Use CSS for the timeline — a left border line with dots/circles at each entry.

#### 1b. Run Summary Stats

A stats row above the timeline with KPI cards:

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Total Runs  │ │  Decisions   │ │  Todo Rate   │ │  Last Run    │
│     12       │ │     47       │ │    91%       │ │  2 hours ago │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### Panel 2: TODO Execution Graph (pipeline mode / full mode)

**Data source:** `output/traces/todo-{id}.md` for the most recent run.

Read the node summary table (Status | Count). Render:

#### 2a. Node Status Doughnut

A CSS-only donut chart showing completed/failed/skipped ratio. Use a conic-gradient
on a circular element. Label the center with the completion rate (e.g. "6/7").

#### 2b. Node Flow Chart (SVG)

Render the TODO execution graph as an SVG flow diagram. Parse groups from the
todo.md Concurrent Groups section. Each group is a labeled box containing its nodes.
Groups are connected by arrows showing sequential flow. Within each group, nodes
are placed side-by-side.

**Node color coding:**
- completed → `var(--success)` (green)
- failed → `var(--danger)` (red)
- skipped → `var(--warning)` (orange)
- pending → `var(--text-secondary)` (grey)
- in_progress → `var(--accent)` (blue) with animated pulse
- escalated → `var(--persona-maintain)` (purple)
- degraded → `var(--persona-minimal)` (amber)

**SVG template for a node:**
```svg
<g class="node" data-status="completed">
  <rect x="X" y="Y" width="120" height="48" rx="8"
        fill="COLOR" stroke="var(--border)" stroke-width="1"/>
  <text x="X+60" y="Y+20" text-anchor="middle" fill="white"
        font-size="12" font-weight="600">Node Name</text>
  <text x="X+60" y="Y+36" text-anchor="middle" fill="rgba(255,255,255,0.8)"
        font-size="10">ID: 1  •  files: 2</text>
</g>
```

**Group labels:**
```svg
<text x="X" y="Y-6" fill="var(--text-secondary)" font-size="11"
      font-weight="600">G1</text>
```

**Inter-group arrows:** Draw SVG `<path>` elements with `marker-end` arrows from
the output edge of one group box to the input edge of the next group box.

### Panel 3: Arena Decision Map (arena mode / full mode)

**Data source:** `output/traces/arena-{id}.md` for the most recent run.

For each decision section, render:

#### 3a. Decision Header
```
## Decision N: {problemTitle}
**Chosen:** {chosenApproach}  |  **Decision:** {decision}
```

#### 3b. Alternatives Comparison Table

A horizontal bar-chart-style comparison. Each row is one persona's proposal.
Show the top 5 scoring dimensions as horizontal bars, plus the critique summary.

```
┌─────────────────────────────────────────────────────────┐
│ speed          │ ████████████░░░░░░░░░░░░  decoupling:50│
│                │ ██████████████░░░░░░░░░░  maintain:60  │
│ ⚠ major: violates spec — arena and todo are coupled     │
├─────────────────────────────────────────────────────────┤
│ maintain (CHOSEN)│ ██████████████████████░  decoupling:88│
│                  │ █████████████████████░░  maintain:85  │
│ ⚡ minor: over-engineered — no current use case          │
├─────────────────────────────────────────────────────────┤
│ minimal         │ ████████████████░░░░░░░░  decoupling:65│
│                 │ ██████████████████░░░░░░  maintain:70  │
│ ⚠ major: mixes arena with execution — unwieldy at scale │
└─────────────────────────────────────────────────────────┘
```

**Score bars:** Each dimension gets a colored bar proportional to its score (0-100).
Width = score%. Color: >=80 green, >=60 blue, >=40 orange, <40 red.
The chosen approach's row should have a subtle highlight border (accent color).

#### 3c. Reasoning Block

Show the decision reasoning text in a styled blockquote with a light accent background.

### Panel 4: Tool Call Trace (trace mode / full mode)

**Data source:** `.pi/state/traces.jsonl`

Parse JSONL lines. If the file doesn't exist, show empty state:

```
"&#128269; No tool trace data found. Run a pipeline or agent session to populate traces.jsonl."
```

If data exists, render:

#### 4a. Stats Row
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Tool Calls  │ │  Total Time  │ │  Total Tokens│ │  Error Rate  │
│     247      │ │   3m 42s     │ │   124,500    │ │    1.2%      │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

#### 4b. Tool Call Waterfall (SVG Gantt-style)

Render tool calls as horizontal bars on a time axis. X-axis = time (ms from first call).
Each bar's width = duration. Color by tool name (assign a palette of ~8 distinct colors).

```svg
<svg viewBox="0 0 WIDTH HEIGHT" style="width:100%; font-size:11px">
  <!-- Time axis -->
  <line x1="80" y1="30" x2="WIDTH-20" y2="30" stroke="var(--border)"/>
  <!-- Bars -->
  <rect x="80+offset" y="45" width="durationScaled" height="20" rx="3" fill="COLOR">
    <title>toolName: argsSnippet — durationMs — status</title>
  </rect>
  <!-- Labels -->
  <text x="75" y="59" text-anchor="end" fill="var(--text-secondary)">toolName</text>
</svg>
```

#### 4c. Per-Tool Breakdown Table

```
| Tool | Calls | Avg Duration | Total Tokens | Errors | % of Total |
|------|-------|-------------|-------------|--------|-----------|
| bash | 87 | 1.2s | 45,200 | 2 | 35% |
| read | 64 | 0.3s | 12,100 | 0 | 26% |
| ... | ... | ... | ... | ... | ... |
```

### Panel 5: Cost Breakdown (trace mode / full mode)

**Data source:** `.pi/state/traces.jsonl`

Compute token costs using standard model pricing. At the top of the panel, note which model
was used for pricing. Aggregate tokens by tool and show:

```
┌─────────────────────────────────────────┐
│  Estimated Session Cost                  │
│                                          │
│  Input:  89,200 tokens  →  $0.267       │
│  Output: 35,300 tokens  →  $0.530       │
│  ─────────────────────────────────       │
│  Total:                 →  $0.797       │
│                                          │
│  Model: claude-sonnet-4-20250514        │
│  Pricing: $3/M input, $15/M output      │
└─────────────────────────────────────────┘
```

Below it, a horizontal bar chart showing cost by tool category.

## Full Mode Layout

When mode is `full`, arrange panels in this order:

```
┌─────────────────────────────────────────────────────┐
│  Row 1: Pipeline KPIs (4 stat cards)                │
├──────────────────────┬──────────────────────────────┤
│  Row 2 Left (60%):   │  Row 2 Right (40%):          │
│  Run History Timeline│  Arena Decision Summary      │
│                      │  (most recent run)           │
├──────────────────────┴──────────────────────────────┤
│  Row 3: TODO Execution Graph (SVG flow chart)       │
├─────────────────────────────────────────────────────┤
│  Row 4: Tool Call Waterfall + Per-Tool Table        │
├─────────────────────────────────────────────────────┤
│  Row 5: Cost Breakdown                              │
└─────────────────────────────────────────────────────┘
```

On mobile (<768px), every row stacks vertically full-width.

## Edge Cases

| Situation | Response |
|-----------|----------|
| No trace data at all (no `output/traces/` dir) | Generate a single-card page explaining how to enable tracing. Include a code snippet: `{ trace: { enabled: true, outputDir: "output/traces" } }` |
| No `.pi/state/traces.jsonl` | Skip trace and cost panels. Note "No tool trace data yet" in the header. |
| Only index.md exists but no detailed files | Show run history timeline only. Skip arena/todo panels with a note linking to pipeline IDs. |
| Trace data is huge (>500 tool calls) | Show the most recent 200 calls and add a note: "Showing 200 of N calls." |
| `traces.jsonl` has running entries (no endTime) | Mark them with a dashed border and "running" label in the waterfall. |
| Arena file has zero decisions | Show "No design decisions were debated in this run." |
| Multiple pipeline runs | Show all in timeline. For detailed panels (arena, todo), default to the most recent run. Let the user click a run in the timeline to switch the detailed panels. |
| User asks for a specific pipeline ID | Filter all panels to that pipeline run only. |
| Traces data is from a different directory | Support the user specifying a custom path: `/visualize full --dir custom/output/traces` |

## Key Files

| File | Purpose |
|------|---------|
| `output/traces/index.md` | Run registry — parsed for pipeline history timeline |
| `output/traces/pipeline-{id}.md` | Per-run pipeline index |
| `output/traces/arena-{id}.md` | Per-run arena debate record |
| `output/traces/todo-{id}.md` | Per-run todo execution record |
| `.pi/state/traces.jsonl` | Tool-call trace log (JSONL) |
| `output/visualizations/` | Output directory for generated HTML files |
