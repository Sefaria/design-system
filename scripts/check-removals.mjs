#!/usr/bin/env node
// Fails if a token that exists at <base-ref> is removed (or renamed), unless BREAKING=true.
// Products use tokens by name, so removing one breaks them; CI sets BREAKING from the PR's
// `breaking` label, which also makes the release a major version. Changing a value is fine.
// Usage: BREAKING=true|false node scripts/check-removals.mjs <base-ref>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { removedTokens, tokenKeys } from './tokens.mjs';

const base = process.argv[2];
if (!base) {
  console.error('usage: check-removals.mjs <base-ref>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  git('rev-parse', '--verify', '--quiet', `${base}^{commit}`);
} catch {
  console.error(`${base} isn't a commit here (not fetched?).`);
  process.exit(2);
}

// A file missing at base (the repo's first PR) has no tokens; any other git failure is an error.
const atBase = (file) => {
  try {
    git('cat-file', '-e', `${base}:${file}`);
  } catch {
    return '';
  }
  return git('show', `${base}:${file}`);
};

const removed = removedTokens(
  tokenKeys(atBase('core.css'), atBase('semantic.css')),
  tokenKeys(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8')),
);

if (!removed.length) {
  console.log('No token removed.');
} else if (process.env.BREAKING === 'true') {
  console.log(`Removed (the PR is labeled breaking, so this releases a new major version):\n  ${removed.join('\n  ')}`);
} else {
  console.error(`These tokens are removed or renamed, and products may still use them:\n  ${removed.join('\n  ')}`);
  console.error('\nAdd the `breaking` label to the PR, and make sure the products stop using them.');
  process.exit(1);
}
