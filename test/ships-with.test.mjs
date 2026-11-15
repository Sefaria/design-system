import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const shipsWith = (body) => execFileSync('bash', ['scripts/ships-with.sh', body], { encoding: 'utf8' }).trim();
const template = readFileSync('.github/pull_request_template.md', 'utf8');

test('reads the link and normalizes the repo name', () => {
  assert.equal(shipsWith('Ships with: ai-chatbot#123'), 'ai-chatbot#123');
  assert.equal(shipsWith('Ships with: Sefaria/ai-chatbot#123'), 'ai-chatbot#123');
  assert.equal(shipsWith('  ships WITH:  sefaria-project#45 thanks'), 'Sefaria-Project#45');
});

test('handles the \\r\\n line endings of PR bodies written on github.com', () => {
  assert.equal(shipsWith('Hi\r\nShips with: Sefaria-Project#45\r\n'), 'Sefaria-Project#45');
});

test('a standalone PR has no link', () => {
  assert.equal(shipsWith(''), '');
  assert.equal(shipsWith('Ships with:\n'), '');
  assert.equal(shipsWith('Ships with: some-other-repo#1'), '');
});

test('ignores examples inside HTML comments', () => {
  assert.equal(shipsWith('<!--\n  Ships with: ai-chatbot#123\n-->\nShips with:'), '');
  assert.equal(shipsWith('<!-- note --> Ships with: ai-chatbot#5'), 'ai-chatbot#5');
});

test('the PR template is standalone until filled in', () => {
  assert.equal(shipsWith(template), '');
  assert.equal(shipsWith(template.replace(/^Ships with:$/m, 'Ships with: ai-chatbot#9')), 'ai-chatbot#9');
});
