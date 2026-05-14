#!/usr/bin/env node
// Scaffold a new report: copy starter.html → {prototypes,private}/{id}.html,
// then append a registry entry to reports.json or private/reports.local.json.
//
// Usage:
//   node scripts/new-report.mjs --id foo --title "Bar" --project "Baz" \
//     --type Postmortem --source path/to/source.md --date 2026-05-14 \
//     --deck "One-sentence lede." --tags benchmark,lean4 \
//     --highlights "6/23 solved,12 patterns" [--private]
//
// --dry-run prints what would change without touching disk.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import {
  REPO_ROOT, PUBLIC_REGISTRY, PRIVATE_REGISTRY,
  PROTOTYPES_DIR, PRIVATE_DIR, STARTER,
  DEFAULT_TYPE_ICONS, ID_RE, DATE_RE,
  readJSON, stringifyRegistry,
} from './_shared.mjs';

function parseArgs(argv) {
  const out = { tags: [], highlights: [], private: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => argv[++i];
    switch (a) {
      case '--id':         out.id = take(); break;
      case '--title':      out.title = take(); break;
      case '--project':    out.project = take(); break;
      case '--type':       out.type = take(); break;
      case '--type-icon':  out.type_icon = take(); break;
      case '--source':     out.source_path = take(); break;
      case '--date':       out.date = take(); break;
      case '--deck':       out.deck = take(); break;
      case '--tags':       out.tags = take().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--highlights': out.highlights = take().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--private':    out.private = true; break;
      case '--dry-run':    out.dryRun = true; break;
      case '-h':
      case '--help':       out.help = true; break;
      default: throw new Error(`unknown flag: ${a}`);
    }
  }
  return out;
}

const USAGE = `Usage: node scripts/new-report.mjs \\
  --id <slug>                  unique [a-z0-9_]+
  --title "<text>"             human title
  --project "<name>"           project grouping
  --type <Type>                free-form; common: ${Object.keys(DEFAULT_TYPE_ICONS).join(' | ')}
 [--type-icon <glyph>]         override icon (required if --type is not in the defaults table)
  --source <path>              source markdown/notes path
  --date <YYYY-MM-DD>          defaults to today
  --deck "<text>"              one-sentence lede
  --tags a,b,c                 comma-separated
  --highlights "a,b,c"         comma-separated (1-3 items recommended)
 [--private]                   write to private/ + reports.local.json
 [--dry-run]                   print plan, no writes`;

function die(msg) {
  console.error(`new-report: ${msg}\n`);
  console.error(USAGE);
  process.exit(1);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildEntry(args) {
  return {
    id: args.id,
    path: args.private ? `private/${args.id}.html` : `prototypes/${args.id}.html`,
    title: args.title,
    project: args.project,
    source_path: args.source_path,
    date: args.date,
    type: args.type,
    type_icon: args.type_icon,
    tags: args.tags,
    deck: args.deck,
    highlights: args.highlights,
  };
}

function customizeStarter(starter, entry) {
  // Minimal templating: title, breadcrumb, eyebrow, h1, deck, footer source, storage key.
  let out = starter;
  out = out.replace(/<title>[^<]*<\/title>/,
    `<title>${entry.title} — The Book</title>`);
  out = out.replace(/<span>project \/ path \/ report<\/span>/,
    `<span>${entry.project} / ${entry.type.toLowerCase()} / ${entry.id}</span>`);
  out = out.replace(/<div class="eyebrow">[^<]*<\/div>/,
    `<div class="eyebrow">${entry.project} · ${entry.date}</div>`);
  out = out.replace(/<h1>[^<]*<\/h1>/,
    `<h1>${entry.title}</h1>`);
  out = out.replace(/<p class="deck">[^<]*<\/p>/,
    `<p class="deck">${entry.deck}</p>`);
  out = out.replace(/<code>path\/to\/source\.md<\/code>/,
    `<code>${entry.source_path}</code>`);
  out = out.replace(/report-hub:your_report_id/g,
    `report-hub:${entry.id}`);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }

  if (!args.id)       die('--id is required');
  if (!ID_RE.test(args.id)) die(`--id must match ${ID_RE} (got: ${args.id})`);
  if (!args.title)    die('--title is required');
  if (!args.project)  die('--project is required');
  if (!args.type)     die('--type is required');
  args.type_icon ||= DEFAULT_TYPE_ICONS[args.type];
  if (!args.type_icon)
    die(`type "${args.type}" has no default icon — pass --type-icon <glyph>. Known defaults: ${Object.keys(DEFAULT_TYPE_ICONS).join(', ')}`);
  if (!args.source_path) die('--source is required');
  if (!args.deck)     die('--deck is required');
  args.date ||= todayISO();
  if (!DATE_RE.test(args.date)) die(`--date must be YYYY-MM-DD (got: ${args.date})`);
  if (args.tags.length === 0)       die('--tags must list at least one tag');
  if (args.highlights.length === 0) die('--highlights must list at least one item');

  const registryPath = args.private ? PRIVATE_REGISTRY : PUBLIC_REGISTRY;
  // Public registry must exist (tracked in git); private one we bootstrap on
  // demand since `private/` is gitignored and absent on a clean checkout.
  if (!args.private && !existsSync(registryPath)) die(`registry not found: ${registryPath}`);
  const registry = existsSync(registryPath) ? readJSON(registryPath) : { reports: [] };

  // Uniqueness check across BOTH registries (private may not exist on this checkout).
  const publicReg  = existsSync(PUBLIC_REGISTRY)  ? readJSON(PUBLIC_REGISTRY)  : { reports: [] };
  const privateReg = existsSync(PRIVATE_REGISTRY) ? readJSON(PRIVATE_REGISTRY) : { reports: [] };
  const allIds = new Set([...publicReg.reports, ...privateReg.reports].map(r => r.id));
  if (allIds.has(args.id)) die(`id "${args.id}" already exists in a registry`);

  const targetDir  = args.private ? PRIVATE_DIR : PROTOTYPES_DIR;
  const targetHtml = resolve(targetDir, `${args.id}.html`);
  if (existsSync(targetHtml)) die(`target file already exists: ${relative(REPO_ROOT, targetHtml)}`);

  const entry = buildEntry(args);
  const starter = readFileSync(STARTER, 'utf8');
  const html = customizeStarter(starter, entry);

  registry.reports.push(entry);
  const registryOut = stringifyRegistry(registry);

  if (args.dryRun) {
    console.log('--- dry run, no writes ---');
    console.log(`would create: ${relative(REPO_ROOT, targetHtml)}`);
    console.log(`would append entry to: ${relative(REPO_ROOT, registryPath)}`);
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, registryOut);
  mkdirSync(dirname(targetHtml), { recursive: true });
  writeFileSync(targetHtml, html);
  console.log(`created ${relative(REPO_ROOT, targetHtml)}`);
  console.log(`updated ${relative(REPO_ROOT, registryPath)}`);
  console.log('next: edit the HTML, then run `node scripts/validate.mjs`.');
}

try { main(); } catch (e) {
  console.error(`new-report: ${e.message}`);
  process.exit(1);
}
