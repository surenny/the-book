# The Book — Field Notes about AI4M

A small publishing hub for self-contained HTML reports authored across my AI-for-mathematics projects.

Named after Erdős's *Book* of optimal proofs — the humbler cousin: not where the best proofs live, but where the notes about chasing them go.

**→ [surenny.github.io/the-book](https://surenny.github.io/the-book/)**

## What's inside

- **▦ [FormalQualBench Leaderboard](https://surenny.github.io/the-book/prototypes/formalqualbench_leaderboard.html)** — 23 research-level Lean theorems × 5 main runs; solve rates, wall time, token usage.
- **▲ [Codex GPT-5.5 cheating retrospective](https://surenny.github.io/the-book/prototypes/agent_cheating_retrospective.html)** — 12 distinct patterns of specification-gaming; 17 of 23 problems "solved" by cheating verify.sh.
- **◆ [FormalRx Case Study Analysis](https://surenny.github.io/the-book/prototypes/case_study_analysis.html)** — 8 hand-diagnosed informal↔formal misalignments drawn from a stratified sample of FormalRx test cases.

## Repo layout

```
index.html       hub homepage (card grid, filter, search, theme toggle)
reports.json     public registry
prototypes/      public reports
shared/          design tokens, CSS, hub.js, starter template
private/         local-only drafts (gitignored)
```

Each report is a single self-contained HTML file. The `shared/` toolbox is opt-in — agents authoring reports can either inline its styles for full portability, or link them as the current site does.

## Adding a report

1. Drop `prototypes/your_report.html`
2. Add an entry to `reports.json`
3. `git push` — GitHub Pages auto-redeploys via `.github/workflows/pages.yml`

Starter template: [`shared/starter.html`](shared/starter.html).

## Half-public hub

Entries in `reports.json` are public and ship to GitHub Pages. Entries in `private/reports.local.json` are local-only — the `private/` directory is gitignored, so when the deployed site fetches it the request 404s silently and only public cards show up. Locally, both registries load and the local cards appear with a dashed border and a small `local` pill.

## License

MIT — see [LICENSE](LICENSE).
