// Shared helpers for new-report.mjs and validate.mjs.
// Single source of truth for type/icon pairs and registry locations.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_REGISTRY  = resolve(REPO_ROOT, 'reports.json');
export const PRIVATE_REGISTRY = resolve(REPO_ROOT, 'private/reports.local.json');
export const PROTOTYPES_DIR   = resolve(REPO_ROOT, 'prototypes');
export const PRIVATE_DIR      = resolve(REPO_ROOT, 'private');
export const STARTER          = resolve(REPO_ROOT, 'shared/starter.html');

// Authoritative type → icon mapping. Keep in sync with AGENTS.md.
export const TYPE_ICONS = {
  'Dashboard':                 '▦',
  'Postmortem':                '▲',
  'Case Study':                '◆',
  'Essay':                     '✎',
  'Tech Report':               '●',
  'Tech Report (reference)':   '●',
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
