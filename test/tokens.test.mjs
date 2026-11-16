import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { check, checkPackage, MAX_VALUE_LENGTH, releaseKind, removedTokens, tokenKeys, tokenValues } from '../scripts/tokens.mjs';

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

test('values the deny-list must catch fail (they pass the character allow-list)', () => {
  for (const value of ['url(x.png)', 'URL (x)', 'image-set(x)', 'expression(x)']) {
    assert.equal(errorsOf(block(`  --core-a: ${value};`), '').length, 1, value);
  }
});

test('unbalanced brackets or quotes, and very long values, fail', () => {
  // Either would make the browser's error recovery swallow the declarations after it.
  for (const value of ['rgb(1, 2', 'rgb(1, 2))', ')(', '"Roboto', "'Roboto\"", 'a'.repeat(MAX_VALUE_LENGTH + 1)]) {
    assert.equal(errorsOf(block(`  --core-a: ${value};`), '').length, 1, value);
  }
  assert.deepEqual(errorsOf(block(`  --core-a: "a(b", 'c)d';`), ''), []);
});

test('release kind: none for comments and formatting, minor for added or changed, major for removed', () => {
  const sem = (body) => block(body);
  const before = tokenValues(core, sem('  --text-link: var(--core-navy-700);'));
  const kind = (coreText, semanticText) => releaseKind(before, tokenValues(coreText, semanticText));
  assert.equal(kind(core, sem('  /* note */ --text-link:   var(--core-navy-700);  /* again */')), 'none');
  assert.equal(kind(core, sem('  --text-link: var(--core-white);')), 'minor');
  assert.equal(kind(core.replace('#18345D', '#18345E'), sem('  --text-link: var(--core-navy-700);')), 'minor');
  assert.equal(kind(core, sem('  --text-link: var(--core-navy-700);\n  --text-new: var(--core-white);')), 'minor');
  assert.equal(kind(core, sem('  --link: var(--core-navy-700);')), 'major');
});

// The scripts the release and CI run, against this repo's own history.
const run = (script, args, env = {}) => {
  try {
    return { code: 0, out: execFileSync('node', [script, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout) };
  }
};

test('release-plan prints a release kind against HEAD, and fails on an unknown ref', () => {
  const ok = run('scripts/release-plan.mjs', ['HEAD']); // 'none' unless the token files have uncommitted edits
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^(none|minor|major)\n$/);
  const bad = run('scripts/release-plan.mjs', ['no-such-ref']);
  assert.equal(bad.code, 2);
  assert.equal(bad.out, '');
});

test('check-removals passes against HEAD, and exits 2 (not 1) on an unknown ref', () => {
  assert.equal(run('scripts/check-removals.mjs', ['HEAD'], { BREAKING: 'false' }).code, 0);
  assert.equal(run('scripts/check-removals.mjs', ['no-such-ref'], { BREAKING: 'false' }).code, 2);
});
