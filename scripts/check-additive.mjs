#!/usr/bin/env node
// Fails if any existing token was removed or now resolves to a different value, compared with a git ref.
// CI runs it on PRs that are linked to a product PR, which may only add tokens.
// Usage: node scripts/check-additive.mjs <base-ref>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { changedExisting, resolve } from './tokens.mjs';

const base = process.argv[2];
if (!base) {
  console.error('usage: check-additive.mjs <base-ref>');
  process.exit(2);
}

const atBase = (file) => {
  try {
    return execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });
  } catch {
    return ''; // the file didn't exist at base
  }
};

const changes = changedExisting(
  resolve(atBase('core.css'), atBase('semantic.css')),
  resolve(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8')),
);

if (changes.length) {
  console.error('This PR is linked to a product PR, so it may only add tokens. These existing tokens changed:');
  for (const c of changes) console.error(`  ${c.key}: ${c.before} -> ${c.after ?? '(removed)'}`);
  console.error('\nAdd a new token for the feature instead, or remove the link and ship this as a standalone change.');
  process.exit(1);
}
console.log('Only additions: no existing token was removed or changed.');
