#!/usr/bin/env node
// Render a markdown source file (with YAML-ish frontmatter) into a Book report
// HTML, and upsert its registry entry.
//
// Zero deps. Mini-YAML, mini-Markdown — covers the subset observed in our
// insight notes (headings, paragraphs, ul/ol, tables, fenced code, blockquote,
// hr, hard breaks, inline bold/italic/code/links). Pandoc-style `:::callout`
// fenced div blocks are supported for emphasized boxes.
//
// Usage:
//   node scripts/render.mjs <source.md> [--out path] [--inline] [--dry-run]
//
// Frontmatter schema (all required unless marked optional):
//   id:           foo_bar         (kebab-or-snake, [a-z0-9_]+)
//   title:        "Human title"
//   project:      ProjectName
//   type:         Postmortem      (free-form; common: Postmortem, Essay, Case Study, Dashboard, Tech Report, Design Note)
//   type_icon:    "▲"             (optional if `type` is in DEFAULT_TYPE_ICONS; required otherwise)
//   date:         2026-05-14      (ISO-8601)
//   deck:         "One-sentence lede."
//   tags:         [a, b, c]
//   highlights:   [a, b, c]
//   visibility:   public          (optional; public | private; default public)
//   metrics:                      (optional; renders a grid under the deck)
//     - label: "best solve rate"
//       value: "35"
//       suffix: "%"               (optional)
//       style: good               (optional; featured|good|warn|alert)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import {
  REPO_ROOT, PUBLIC_REGISTRY, PRIVATE_REGISTRY,
  PROTOTYPES_DIR, PRIVATE_DIR,
  DEFAULT_TYPE_ICONS, ID_RE, DATE_RE,
  readJSON, stringifyRegistry,
} from './_shared.mjs';

// ───────────────────────────────────────────────────────────── CLI ──

function parseArgs(argv) {
  const out = { positional: [], inline: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === '--out')     out.out = argv[++i];
    else if (a === '--inline')  out.inline = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else out.positional.push(a);
  }
  return out;
}

const USAGE = `Usage: node scripts/render.mjs <source.md> [--out path] [--inline] [--dry-run]

Renders a markdown source with frontmatter into a Book report HTML and
upserts the registry entry. See AGENTS.md "From-MD authoring" for the schema.`;

// ───────────────────────────────────────────── Mini-YAML frontmatter ──

function parseFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    throw new Error('source must begin with `---` frontmatter block');
  }
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('unterminated frontmatter (need closing `---`)');
  const head = text.slice(4, end);
  const body = text.slice(end + 5);
  return { meta: parseYamlSubset(head), body };
}

// Supports: scalar `k: v` (quoted or bare), arrays `k: [a, b]`, nested
// objects via 2-space indent (one level), and list-of-objects via `- ` items.
// Not real YAML — just enough for our schema.
function parseYamlSubset(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) throw new Error(`bad frontmatter line: ${JSON.stringify(line)}`);
    const [, key, rest] = m;
    if (rest === '') {
      // Block value: either a list (next lines start with `  - `) or a map (next lines indented 2 spaces).
      const block = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
        block.push(lines[i]);
        i++;
      }
      out[key] = parseYamlBlock(block);
    } else {
      out[key] = parseYamlScalar(rest.trim());
      i++;
    }
  }
  return out;
}

function parseYamlBlock(lines) {
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length === 0) return null;
  // List-of-objects: each item starts with `  - `
  if (nonEmpty[0].startsWith('  - ')) {
    const items = [];
    let cur = null;
    for (const l of nonEmpty) {
      if (l.startsWith('  - ')) {
        if (cur) items.push(cur);
        cur = {};
        const rest = l.slice(4);
        const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
        if (m) cur[m[1]] = parseYamlScalar(m[2].trim());
        else throw new Error(`bad list item: ${l}`);
      } else if (l.startsWith('    ')) {
        const rest = l.slice(4);
        const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
        if (!m) throw new Error(`bad map continuation: ${l}`);
        cur[m[1]] = parseYamlScalar(m[2].trim());
      } else {
        throw new Error(`bad indented line: ${l}`);
      }
    }
    if (cur) items.push(cur);
    return items;
  }
  // Plain map (indented 2 spaces)
  const obj = {};
  for (const l of nonEmpty) {
    const m = l.slice(2).match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) throw new Error(`bad map line: ${l}`);
    obj[m[1]] = parseYamlScalar(m[2].trim());
  }
  return obj;
}

function parseYamlScalar(s) {
  if (s === '') return '';
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner, ',').map(x => parseYamlScalar(x.trim()));
  }
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0, q = null, buf = '';
  for (const c of s) {
    if (q) { buf += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; buf += c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === sep && depth === 0) { out.push(buf); buf = ''; }
    else buf += c;
  }
  if (buf) out.push(buf);
  return out;
}

// ─────────────────────────────────────────────────── Mini-Markdown ──

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Inline: bold **x**, italic *x*, code `x`, link [t](u). Order matters —
// code first (so its content isn't parsed for other inlines).
function renderInline(s) {
  // Tokenize code spans first
  const parts = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i) {
        parts.push({ kind: 'code', text: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    let j = i;
    while (j < s.length && s[j] !== '`') j++;
    parts.push({ kind: 'text', text: s.slice(i, j) });
    i = j;
  }
  return parts.map(p => {
    if (p.kind === 'code') return `<code>${escHtml(p.text)}</code>`;
    let t = escHtml(p.text);
    t = t.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      `<a href="${escHtml(url)}">${label}</a>`);
    return t;
  }).join('');
}

// Block-level parser. Returns HTML for the body (sections wrapped around H2s).
function renderBlocks(md) {
  const lines = md.split(/\r?\n/);
  // Strip a leading H1 (title comes from frontmatter).
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^# [^\n]+/.test(lines[i])) i++;

  const out = [];
  let secIdx = 0;       // 0 = pre-section content lives at top level
  let inSec = false;
  const openSec = () => { if (inSec) out.push('  </section>'); };

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip
    if (!line.trim()) { i++; continue; }

    // H2 → start a new .sec
    let m = line.match(/^## +(.*)$/);
    if (m) {
      openSec();
      secIdx++;
      const num = String(secIdx).padStart(2, '0');
      out.push(`  <section class="sec">`);
      out.push(`    <div class="sec-head"><h2><span class="num">${num}</span>${renderInline(m[1])}</h2></div>`);
      inSec = true;
      i++;
      continue;
    }

    // H3 → h3 (no special class)
    m = line.match(/^### +(.*)$/);
    if (m) {
      out.push(`    <h3>${renderInline(m[1])}</h3>`);
      i++;
      continue;
    }

    // hr
    if (/^---+\s*$/.test(line)) {
      out.push('    <hr>');
      i++;
      continue;
    }

    // ::: callout … :::
    if (line.trim() === ':::callout' || line.trim().startsWith(':::callout ')) {
      const buf = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { buf.push(lines[i]); i++; }
      i++; // skip closing
      out.push(`    <div class="callout">${renderInline(buf.join('\n').trim())}</div>`);
      continue;
    }

    // Fenced code block ```lang
    m = line.match(/^```(\S*)\s*$/);
    if (m) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing
      out.push(`    <pre class="code-block">${escHtml(buf.join('\n'))}</pre>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) { buf.push(lines[i].slice(2)); i++; }
      out.push(`    <blockquote>${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // Table (pipe-style, requires header + separator)
    if (line.includes('|') && i + 1 < lines.length && /^[\s\|:\-]+$/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push('    <div class="tbl-wrap"><table class="embed">');
      out.push('      <thead><tr>' + header.map(h => `<th>${renderInline(h)}</th>`).join('') + '</tr></thead>');
      out.push('      <tbody>');
      for (const r of rows) {
        out.push('        <tr>' + r.map(c => `<td>${renderInline(c)}</td>`).join('') + '</tr>');
      }
      out.push('      </tbody></table></div>');
      continue;
    }

    // Lists (- … or 1. …) — flat, no nesting
    if (/^[-*] +/.test(line) || /^\d+\. +/.test(line)) {
      const ordered = /^\d+\. +/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const re = ordered ? /^\d+\. +(.*)$/ : /^[-*] +(.*)$/;
      out.push(`    <${tag}>`);
      while (i < lines.length && re.test(lines[i])) {
        out.push(`      <li>${renderInline(lines[i].match(re)[1])}</li>`);
        i++;
      }
      out.push(`    </${tag}>`);
      continue;
    }

    // Paragraph — consume until blank or new block trigger
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !blockTrigger(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`    <p>${renderInline(buf.join(' '))}</p>`);
  }
  openSec();
  return out.join('\n');
}

function blockTrigger(l) {
  return /^#{1,6} /.test(l)
      || /^---+\s*$/.test(l)
      || /^```/.test(l)
      || /^> /.test(l)
      || /^[-*] /.test(l)
      || /^\d+\. /.test(l)
      || l.trim().startsWith(':::');
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|'))   s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

// ──────────────────────────────────────────────────── HTML template ──

function renderTemplate({ entry, bodyHtml, metrics, inline }) {
  const links = inline
    ? embedShared()
    : `
<link rel="stylesheet" href="../shared/tokens.css">
<link rel="stylesheet" href="../shared/base.css">
<link rel="stylesheet" href="../shared/components.css">`;
  const script = inline
    ? `<script>\n${readFileSync(resolve(REPO_ROOT, 'shared/hub.js'), 'utf8')}\n</script>`
    : `<script src="../shared/hub.js"></script>`;
  const metricsHtml = metrics?.length ? renderMetrics(metrics) : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(entry.title)} — The Book</title>${links}
<style>
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin: 2rem 0 3rem; }
</style>
</head>
<body>
<div class="page">

  <div class="hdr-bar">
    <a href="../index.html">← The Book</a>
    <span>${escHtml(entry.project)} / ${escHtml(entry.type.toLowerCase())} / ${escHtml(entry.id)}</span>
    <button class="theme-toggle" id="themeToggle">auto</button>
  </div>

  <header class="hero">
    <div class="eyebrow">${escHtml(entry.project)} · ${escHtml(entry.date)}</div>
    <h1>${escHtml(entry.title)}</h1>
    <p class="deck">${escHtml(entry.deck)}</p>
  </header>
${metricsHtml}
${bodyHtml}

  <footer class="footer">
    <span>Source · <code>${escHtml(entry.source_path)}</code></span>
    <span><a href="mailto:surenny233@sjtu.edu.cn">surenny233@sjtu.edu.cn</a></span>
  </footer>

</div>

${script}
<script>
  setupTheme('themeToggle', 'report-hub:${entry.id}');
</script>
</body>
</html>
`;
}

function renderMetrics(metrics) {
  const cards = metrics.map(m => {
    const cls = m.style ? ` ${m.style}` : '';
    const sub = m.suffix ? `<span class="sub">${escHtml(m.suffix)}</span>` : '';
    return `    <div class="metric${cls}"><div class="l">${escHtml(m.label)}</div><div class="v">${escHtml(m.value)}${sub}</div></div>`;
  }).join('\n');
  return `\n  <div class="metrics-grid">\n${cards}\n  </div>\n`;
}

function embedShared() {
  const t = readFileSync(resolve(REPO_ROOT, 'shared/tokens.css'),     'utf8');
  const b = readFileSync(resolve(REPO_ROOT, 'shared/base.css'),       'utf8');
  const c = readFileSync(resolve(REPO_ROOT, 'shared/components.css'), 'utf8');
  return `\n<style>\n${t}\n${b}\n${c}\n</style>`;
}

// ──────────────────────────────────────────────── Registry upsert ──

function upsertRegistry(entry, isPrivate) {
  const path = isPrivate ? PRIVATE_REGISTRY : PUBLIC_REGISTRY;
  const reg = existsSync(path) ? readJSON(path) : { reports: [] };
  const idx = reg.reports.findIndex(r => r.id === entry.id);
  if (idx >= 0) reg.reports[idx] = entry;
  else          reg.reports.push(entry);
  return { path, contents: stringifyRegistry(reg), updated: idx >= 0 };
}

// ─────────────────────────────────────────────────────────── main ──

function die(msg) { console.error(`render: ${msg}`); process.exit(1); }

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help)                 { console.log(USAGE); return; }
  if (args.positional.length !== 1) die('exactly one positional <source.md> required\n\n' + USAGE);

  const srcAbs = resolve(args.positional[0]);
  if (!existsSync(srcAbs)) die(`source not found: ${srcAbs}`);
  const raw = readFileSync(srcAbs, 'utf8');

  const { meta, body } = parseFrontmatter(raw);

  // Validate frontmatter.
  for (const f of ['id', 'title', 'project', 'type', 'date', 'deck', 'tags', 'highlights']) {
    if (!(f in meta)) die(`frontmatter missing required field: ${f}`);
  }
  if (!ID_RE.test(meta.id))                die(`id must match ${ID_RE}`);
  if (!DATE_RE.test(meta.date))            die(`date must be YYYY-MM-DD`);
  const typeIcon = meta.type_icon || DEFAULT_TYPE_ICONS[meta.type];
  if (!typeIcon) die(`type "${meta.type}" has no default icon — add a \`type_icon: <glyph>\` line to the frontmatter. Known defaults: ${Object.keys(DEFAULT_TYPE_ICONS).join(', ')}`);
  if (!Array.isArray(meta.tags) || meta.tags.length === 0)             die('tags must be non-empty array');
  if (!Array.isArray(meta.highlights) || meta.highlights.length === 0) die('highlights must be non-empty array');
  const visibility = meta.visibility || 'public';
  if (!['public', 'private'].includes(visibility)) die(`visibility must be public|private`);

  const isPrivate = visibility === 'private';
  const sourcePathRel = relative(REPO_ROOT, srcAbs);    // best-effort; may be `../foo/bar.md`

  const entry = {
    id:          meta.id,
    path:        isPrivate ? `private/${meta.id}.html` : `prototypes/${meta.id}.html`,
    title:       meta.title,
    project:     meta.project,
    source_path: meta.source_path || sourcePathRel,
    date:        meta.date,
    type:        meta.type,
    type_icon:   typeIcon,
    tags:        meta.tags,
    deck:        meta.deck,
    highlights:  meta.highlights,
  };

  const bodyHtml = renderBlocks(body);
  const html = renderTemplate({ entry, bodyHtml, metrics: meta.metrics, inline: args.inline });

  // --out implies "preview to this path, don't touch the registry."
  const previewMode = !!args.out;
  const outDir = isPrivate ? PRIVATE_DIR : PROTOTYPES_DIR;
  const outAbs = previewMode ? resolve(args.out) : resolve(outDir, `${meta.id}.html`);
  const reg = previewMode ? null : upsertRegistry(entry, isPrivate);

  if (args.dryRun) {
    console.log('--- dry run, no writes ---');
    console.log(`would write HTML:    ${relative(REPO_ROOT, outAbs)}  (${html.length} bytes)`);
    if (reg) console.log(`would ${reg.updated ? 'update' : 'append'} registry: ${relative(REPO_ROOT, reg.path)}`);
    else     console.log('would skip registry (preview mode, --out given)');
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  // Write registry first; if it fails we won't have left a stale HTML behind.
  if (reg) {
    mkdirSync(dirname(reg.path), { recursive: true });
    writeFileSync(reg.path, reg.contents);
  }
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, html);
  console.log(`wrote ${relative(REPO_ROOT, outAbs)}`);
  if (reg) console.log(`${reg.updated ? 'updated' : 'appended'} ${relative(REPO_ROOT, reg.path)}`);
  else     console.log('preview mode — registry untouched');
  console.log('next: open in a browser, then `node scripts/validate.mjs`.');
}

try { main(); }
catch (e) { die(e.message); }
