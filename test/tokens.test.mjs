import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { check, checkPackage, removedTokens, tokenKeys } from '../scripts/tokens.mjs';

const core = `:root,
:host {
  --core-white: #FFFFFF;
  --core-navy-700: #18345D;
}
`;
const block = (body, selector = ':root,\n:host') => `${selector} {\n${body}\n}\n`;
const errorsOf = (coreText, semanticText) => check(coreText, semanticText).errors;

test('the repo files pass', () => {
  assert.deepEqual(errorsOf(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8')), []);
  assert.deepEqual(checkPackage(readFileSync('package.json', 'utf8')), []);
});

test('semantic pointing at core passes', () => {
  assert.deepEqual(errorsOf(core, block('  --semantic-text-link: var(--core-navy-700);')), []);
});

test('a raw semantic value fails, even marked unmapped', () => {
  assert.match(errorsOf(core, block('  --text-link: #18345D;'))[0], /must be var\(--a-core-token\)/);
  assert.equal(errorsOf(core, block('  --text-link: #18345D; /* unmapped */')).length, 1);
});

test('reference to an undefined core token fails', () => {
  assert.match(errorsOf(core, block('  --semantic-text-link: var(--core-missing);'))[0], /doesn't define/);
});

test('semantic pointing at another semantic token fails', () => {
  const errors = errorsOf(core, block('  --semantic-a: var(--core-white);\n  --semantic-b: var(--semantic-a);'));
  assert.equal(errors.length, 1);
});

test('core with a reference fails', () => {
  assert.match(errorsOf(block('  --core-a: #fff;\n  --core-b: var(--core-a);'), '')[0], /raw value/);
});

test('the selector must match exactly', () => {
  assert.equal(errorsOf(block('  --core-a: #fff;', ':root'), '').length, 1);
  // A browser drops a rule with an invalid selector list, and every token in it.
  assert.equal(errorsOf(block('  --core-a: #fff;', ':root,, :host'), '').length, 1);
  assert.deepEqual(errorsOf(block('  --core-a: #fff;', ':root,   :host'), ''), []);
});

test('dark mode may override existing semantic tokens only', () => {
  const light = block('  --semantic-text-link: var(--core-white);');
  const darkSel = ':root[data-theme="dark"],\n:host([data-theme="dark"])';
  assert.deepEqual(errorsOf(core, light + block('  --semantic-text-link: var(--core-navy-700);', darkSel)), []);
  assert.equal(errorsOf(core, light + block('  --semantic-new: var(--core-white);', darkSel)).length, 1);
});

test('values that could carry markup, rules, URLs or !important fail', () => {
  for (const value of [
    '</style><img src=x onerror=alert(1)>',
    'red} body { display: none',
    'url(https://example.com/x.png)',
    '#fff !important',
    '@import',
    '\\3c',
  ]) {
    assert.equal(errorsOf(block(`  --core-a: ${value};`), '').length, 1, value);
  }
  for (const value of ['#18345D', '12px', 'rgb(24, 52, 93)', 'calc(4px * 2)', '"Roboto", sans-serif', '0.5']) {
    assert.deepEqual(errorsOf(block(`  --core-a: ${value};`), ''), [], value);
  }
});

test('a declaration after a comment on the same line is still checked', () => {
  // The browser applies it, so the checker must see it.
  assert.equal(errorsOf(core, block('  /* hotfix */ --semantic-new: #000000;')).length, 1);
});

test('an unclosed comment fails', () => {
  assert.ok(errorsOf(block('  --core-a: #fff; /* oops'), '').length >= 1);
});

test('a name defined twice for the same selector fails, even in two blocks', () => {
  assert.equal(errorsOf(block('  --core-a: #fff;') + block('  --core-a: #000;'), '').length, 1);
});

test('install scripts in package.json fail', () => {
  assert.equal(checkPackage(JSON.stringify({ scripts: { postinstall: 'node x.js', test: 'node --test' } })).length, 1);
  assert.deepEqual(checkPackage(JSON.stringify({ scripts: { test: 'node --test' } })), []);
});

test('removing or renaming a token is a removal; changing its value is not', () => {
  const before = tokenKeys(core, block('  --semantic-text-link: var(--core-navy-700);'));
  assert.deepEqual(removedTokens(before, tokenKeys(core, block('  --semantic-text-link: var(--core-white);'))), []);
  assert.deepEqual(removedTokens(before, tokenKeys(core, block('  --semantic-link: var(--core-white);'))), [
    ':root, :host --semantic-text-link',
  ]);
});
