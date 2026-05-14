# AGENTS.md — instructions for agents authoring reports in The Book

> One-page spec. Read this end-to-end before touching anything.

## What this repo is

`The Book` is a static publishing hub for self-contained HTML reports. Homepage (`index.html`) loads two JSON registries and renders a card grid:

- `reports.json` — public, deployed to GitHub Pages.
- `private/reports.local.json` — local-only (the entire `private/` directory is gitignored). Renders with a dashed border and a `local` pill when the site runs locally; 404s silently in production.

Each report is **one HTML file**. Reports either link to `shared/*.css + hub.js` or inline those assets — see *Inline vs linked* below.

## The 3-step workflow

```bash
# 1. Scaffold a new report from the starter template + append a registry entry.
node scripts/new-report.mjs \
  --id   my_report_id \
  --title "Short human title" \
  --project "ProjectName" \
  --type Postmortem \
  --source "ProjectName/insight/2026-xx-yy.md" \
  --deck "One-sentence lede." \
  --tags benchmark,lean4 \
  --highlights "6/23 solved,12 patterns"
# add --private to scaffold into private/ and write to reports.local.json instead.

# 2. Edit prototypes/my_report_id.html. Translate the source markdown into
#    sections using the component catalog below.

# 3. Validate, preview, commit.
node scripts/validate.mjs                   # must exit 0
python3 -m http.server 8000                 # open http://localhost:8000/
```

Push when satisfied. GitHub Pages redeploys via `.github/workflows/pages.yml`.

## `reports.json` entry — schema

Every registry entry has these fields. `new-report.mjs` writes them for you; this is the reference for hand-edits and for `validate.mjs`.

| field           | required | example                                          | notes                                                                 |
| --------------- | -------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `id`            | yes      | `formalqualbench_leaderboard`                    | unique across both registries; `[a-z0-9_]+`; matches HTML filename    |
| `path`          | yes      | `prototypes/foo.html` or `private/foo.html`      | relative from repo root                                               |
| `title`         | yes      | `FormalQualBench Leaderboard`                    | shown on hub card and in `<title>`                                    |
| `project`       | yes      | `FormalQualBench`                                | groups reports in the project filter                                  |
| `source_path`   | yes      | `FormalQualBench/runs/LEADERBOARD.md`            | path to the source markdown/notes; shown in footer + card             |
| `date`          | yes      | `2026-05-11`                                     | ISO-8601 `YYYY-MM-DD`; cards sort by this                             |
| `type`          | yes      | `Postmortem`                                     | one of the table below                                                |
| `type_icon`     | yes      | `▲`                                              | must pair with `type` per the table below                             |
| `tags`          | yes      | `["benchmark","lean4"]`                          | string array; lowercased; shown as chips                              |
| `deck`          | yes      | `One- or two-sentence lede.`                     | the card subtitle and the in-report `.deck`                           |
| `highlights`    | yes      | `["6/23 solved","12 patterns"]`                  | 1–3 short bullets shown under the deck on the card                    |

### type ↔ type_icon

Add a new pair here if you need to extend.

| type                    | icon |
| ----------------------- | ---- |
| `Dashboard`             | `▦`  |
| `Postmortem`            | `▲`  |
| `Case Study`            | `◆`  |
| `Essay`                 | `✎`  |
| `Tech Report`           | `●`  |
| `Tech Report (reference)` | `●` |

`validate.mjs` rejects unknown type/icon pairs.

## Inline vs linked

Two valid modes; pick one per report and stick to it.

| mode    | when to use                                                            | how                                                                  |
| ------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| inline  | report will be emailed, pasted into a message, or hosted elsewhere    | paste `tokens.css + base.css + components.css` into `<style>`, paste `hub.js` into `<script>` |
| linked  | report only ever lives in this hub                                     | `<link rel="stylesheet" href="../shared/tokens.css">` (× 3 files) + `<script src="../shared/hub.js"></script>` |

**Default to inline** for `prototypes/*` (all four current public reports use inline mode — they're meant to be distributable). Use linked for quick local drafts in `private/`.

`new-report.mjs` scaffolds in **linked mode** so you can prototype fast; before publishing, run `node scripts/new-report.mjs --inline-existing prototypes/foo.html` to inline the shared assets (TODO: this flag is not yet implemented — for now, copy from another `prototypes/*.html`).

## Component catalog

All utility classes live in `shared/components.css` and the file's inline comments are authoritative — read them. Quick cheatsheet so you know what exists:

| component         | class                                | use case                                       |
| ----------------- | ------------------------------------ | ---------------------------------------------- |
| Header bar        | `.hdr-bar` + `.theme-toggle`         | sticky breadcrumb + auto/light/dark toggle     |
| Hero              | `.hero` + `.eyebrow` + `h1` + `.deck`/`.lede` | title block at top of report          |
| Section           | `.sec` + `.sec-head` + `h2.num`      | numbered section heading                       |
| Callout           | `.callout`                           | accent-bordered info box for key insights      |
| Code block        | `.code-block` + `.kw .str .lit .comment .label .err` | dark "screenshot" of code           |
| Inline code       | bare `<code>` in prose, or `.inline-code` | mono pill                                  |
| Data table        | `.tbl-wrap > table.embed`            | inline tabular data                            |
| KPI / metric      | `.metric` + `.l` (label) + `.v` (value) | numeric stat card                           |
| Metric variants   | `.metric.featured \| .good \| .warn \| .alert` | colored emphasis                       |
| Chip filter       | `.chip[aria-pressed]`                | toggle button (rare in reports; used in hub)   |
| Footer            | `.footer`                            | source path + contact line at bottom           |

`shared/tokens.css` defines all colors, spacing, fonts, shadows as CSS variables. Use them; never hard-code hex.

`shared/hub.js` exports: `setupTheme(btnId, storageKey)`, `persistState`, `loadState`, `escapeHtml`, `setupAnchorNav`, `setupReadingProgress`.

## Half-public rule

- `prototypes/*.html` + entries in `reports.json` → public, push to git.
- `private/*.html` + entries in `private/reports.local.json` → local-only. The `/private/` line in `.gitignore` ensures it never gets committed.
- To promote a private draft to public: move the HTML from `private/` to `prototypes/`, move the entry from `reports.local.json` to `reports.json`, fix up the `path` field.

## Self-check before commit

```bash
node scripts/validate.mjs
```

Validator checks every entry in both registries:
- JSON parses
- `id` unique across both files
- required fields present, `date` is ISO-8601, `tags`/`highlights` are arrays
- `type` and `type_icon` are a known pair
- `path` exists on disk and matches the registry (public entries must be under `prototypes/`, private under `private/`)
- `id` matches the HTML filename basename

The validator is also expected to run in CI eventually; keep it green.

## Don't

- Don't hand-edit `reports.json` if you can call `new-report.mjs` instead — JSON commas are easy to break.
- Don't put a public report in `private/` or vice versa — the path/registry must match.
- Don't add a new `type` without updating the table here and in `validate.mjs`.
- Don't introduce new colors/spacing; use the tokens.
