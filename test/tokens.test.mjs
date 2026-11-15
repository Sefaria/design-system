import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { changedExisting, check, resolve } from '../scripts/tokens.mjs';

const core = `:root,
:host {
  --core-white: #FFFFFF;
  --core-navy-700: #18345D;
}
`;
const block = (body, selector = ':root,\n:host') => `${selector} {\n${body}\n}\n`;

test('the repo files pass', () => {
  const { errors } = check(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8'));
  assert.deepEqual(errors, []);
});

test('semantic pointing at core passes', () => {
  assert.deepEqual(check(core, block('  --semantic-text-link: var(--core-navy-700);')).errors, []);
});

test('raw value in semantic fails unless marked unmapped', () => {
  assert.equal(check(core, block('  --semantic-text-link: #18345D;')).errors.length, 1);
  const marked = check(core, block('  --semantic-text-link: #18345D; /* unmapped */'));
  assert.deepEqual(marked.errors, []);
  assert.equal(marked.unmapped.length, 1);
});

test('reference to an undefined core token fails', () => {
  const { errors } = check(core, block('  --semantic-text-link: var(--core-missing);'));
  assert.match(errors[0], /doesn't define/);
});

test('semantic pointing at another semantic token fails', () => {
  const { errors } = check(
    core,
    block('  --semantic-a: var(--core-white);\n  --semantic-b: var(--semantic-a);'),
  );
  assert.equal(errors.length, 1);
});

test('core with a reference fails', () => {
  const { errors } = check(block('  --core-a: #fff;\n  --core-b: var(--core-a);'), '');
  assert.match(errors[0], /raw value/);
});

test('wrong selector fails', () => {
  assert.equal(check(block('  --core-a: #fff;', ':root'), '').errors.length, 1);
});

test('dark mode may override existing semantic tokens only', () => {
  const light = block('  --semantic-bg: var(--core-white);');
  const darkSel = ':root[data-theme="dark"],\n:host([data-theme="dark"])';
  assert.deepEqual(check(core, light + block('  --semantic-bg: var(--core-navy-700);', darkSel)).errors, []);
  assert.equal(check(core, light + block('  --semantic-new: var(--core-white);', darkSel)).errors.length, 1);
});

test('additions are not changes; value changes and removals are', () => {
  const before = resolve(core, block('  --semantic-text-link: #18345D; /* unmapped */'));
  // Mapping to a core token with the same value, plus a new token: no change.
  const mapped = resolve(
    core,
    block('  --semantic-text-link: var(--core-navy-700);\n  --semantic-new: var(--core-white);'),
  );
  assert.deepEqual(changedExisting(before, mapped), []);
  // A different value is a change; a missing token is a removal.
  assert.equal(changedExisting(before, resolve(core, block('  --semantic-text-link: var(--core-white);'))).length, 1);
  assert.equal(changedExisting(before, resolve(core, '')).length, 1);
});
