// Shared helpers for new-report.mjs, render.mjs, validate.mjs.
// Registry paths and the open-vocabulary type-icon defaults.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_REGISTRY  = resolve(REPO_ROOT, 'reports.json');
export const PRIVATE_REGISTRY = resolve(REPO_ROOT, 'private/reports.local.json');
export const PROTOTYPES_DIR   = resolve(REPO_ROOT, 'prototypes');
export const PRIVATE_DIR      = resolve(REPO_ROOT, 'private');
export const STARTER          = resolve(REPO_ROOT, 'shared/starter.html');

// Default icon for common types. Open vocabulary — `type` may be any string;
// this map only saves you from passing --type-icon for the common cases.
// Authors can override with an explicit type_icon at any time.
export const DEFAULT_TYPE_ICONS = {
  'Dashboard':                 '▦',
  'Postmortem':                '▲',
  'Case Study':                '◆',
  'Essay':                     '✎',
  'Tech Report':               '●',
  'Tech Report (reference)':   '●',
  'Design Note':               '◇',
};

export const REQUIRED_FIELDS = [
  'id', 'path', 'title', 'project', 'source_path',
  'date', 'type', 'type_icon', 'tags', 'deck', 'highlights',
];

export const ID_RE   = /^[a-z0-9_]+$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Stringify with the same formatting the registry already uses: 2-space indent,
// trailing newline. Keeps diffs minimal when scripts append entries.
export function stringifyRegistry(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}
