#!/usr/bin/env node
// Prints what releasing HEAD after <last-release-tag> needs: none, minor or major (see releaseKind
// in tokens.mjs). Compares tokens, not file text, so comments and formatting never cut a release.
// Any failure (unknown tag, unreadable file) exits non-zero and prints nothing on stdout, so the
// release job fails instead of guessing.
// Usage: node scripts/release-plan.mjs <last-release-tag>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { releaseKind, tokenValues } from './tokens.mjs';

const last = process.argv[2];
if (!last) {
  console.error('usage: release-plan.mjs <last-release-tag>');
  process.exit(2);
}
const atLast = (file) =>
  execFileSync('git', ['show', `${last}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let kind;
try {
  kind = releaseKind(
    tokenValues(atLast('core.css'), atLast('semantic.css')),
    tokenValues(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8')),
  );
} catch (e) {
  console.error(`Couldn't compare with ${last}: ${e.message}`);
  process.exit(2);
}
console.log(kind);
