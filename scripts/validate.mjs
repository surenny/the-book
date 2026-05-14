#!/usr/bin/env node
// Validate report registries. Exit 0 on success; non-zero on any error.
//
// Checks per entry:
//   - required fields present
//   - id is unique across both registries and matches [a-z0-9_]+
//   - date is YYYY-MM-DD
//   - tags / highlights are non-empty arrays
//   - type and type_icon are both present (open vocabulary — any string accepted)
//   - path exists on disk and matches registry side (public → prototypes/, private → private/)
//   - HTML filename basename matches id
//
// Usage:  node scripts/validate.mjs

import { existsSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import {
  REPO_ROOT, PUBLIC_REGISTRY, PRIVATE_REGISTRY,
  DEFAULT_TYPE_ICONS, REQUIRED_FIELDS, ID_RE, DATE_RE,
  readJSON,
} from './_shared.mjs';

const errors = [];
const warnings = [];

function check(reg, side) {
  if (!existsSync(reg)) {
    if (side === 'public') errors.push(`missing public registry: ${reg}`);
    return [];
  }
  let data;
  try { data = readJSON(reg); }
  catch (e) { errors.push(`${reg}: invalid JSON — ${e.message}`); return []; }
  if (!data || !Array.isArray(data.reports)) {
    errors.push(`${reg}: top-level must be { "reports": [...] }`);
    return [];
  }
  return data.reports.map((r, i) => ({ r, i, side, reg }));
}

const entries = [
  ...check(PUBLIC_REGISTRY,  'public'),
  ...check(PRIVATE_REGISTRY, 'private'),
];

// Per-entry checks.
const seenIds = new Map();
for (const { r, i, side, reg } of entries) {
  const tag = `[${side} #${i} ${r.id ?? '<no id>'}]`;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in r)) errors.push(`${tag} missing required field: ${f}`);
  }
  if (r.id) {
    if (!ID_RE.test(r.id)) errors.push(`${tag} id must match ${ID_RE}`);
    if (seenIds.has(r.id)) {
      errors.push(`${tag} duplicate id (also in ${seenIds.get(r.id)})`);
    } else {
      seenIds.set(r.id, `${side} registry`);
    }
  }
  if (r.date && !DATE_RE.test(r.date)) errors.push(`${tag} date must be YYYY-MM-DD (got: ${r.date})`);
  if (r.tags && (!Array.isArray(r.tags) || r.tags.length === 0))
    errors.push(`${tag} tags must be a non-empty array`);
  if (r.highlights && (!Array.isArray(r.highlights) || r.highlights.length === 0))
    errors.push(`${tag} highlights must be a non-empty array`);

  // Type is open vocabulary; both fields must be present but any string is fine.
  // Soft hint: if `type` is a known default but the icon differs, warn (don't reject).
  if (r.type && r.type_icon && (r.type in DEFAULT_TYPE_ICONS) && DEFAULT_TYPE_ICONS[r.type] !== r.type_icon) {
    warnings.push(`${tag} type "${r.type}" usually pairs with "${DEFAULT_TYPE_ICONS[r.type]}", got "${r.type_icon}" (fine if intentional)`);
  }

  if (r.path) {
    const abs = resolve(REPO_ROOT, r.path);
    if (!existsSync(abs)) {
      errors.push(`${tag} path not found on disk: ${r.path}`);
    }
    if (side === 'public'  && !r.path.startsWith('prototypes/'))
      errors.push(`${tag} public entry path must start with prototypes/ (got: ${r.path})`);
    if (side === 'private' && !r.path.startsWith('private/'))
      errors.push(`${tag} private entry path must start with private/ (got: ${r.path})`);
    if (r.id) {
      const base = basename(r.path, extname(r.path));
      if (base !== r.id)
        warnings.push(`${tag} filename basename "${base}" does not match id "${r.id}"`);
    }
  }
}

// Report.
if (warnings.length) {
  console.warn(`validate: ${warnings.length} warning(s)`);
  for (const w of warnings) console.warn(`  ! ${w}`);
}
if (errors.length) {
  console.error(`validate: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`validate: ok — ${entries.length} entries across ${[PUBLIC_REGISTRY, PRIVATE_REGISTRY].filter(existsSync).length} registries`);
