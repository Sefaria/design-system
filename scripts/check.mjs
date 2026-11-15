#!/usr/bin/env node
// Checks the layer rules of core.css and semantic.css. Exits 1 on any error.
import { readFileSync } from 'node:fs';
import { check } from './tokens.mjs';

const { errors, unmapped } = check(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8'));

if (unmapped.length) {
  console.log(`${unmapped.length} semantic token(s) still hold a raw value instead of pointing at a core token:`);
  for (const d of unmapped) console.log(`  ${d.file}:${d.line}  ${d.name}: ${d.value}`);
  console.log('');
}

if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('core.css and semantic.css follow the rules.');
