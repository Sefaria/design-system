#!/usr/bin/env node
// Checks the layer rules of core.css and semantic.css, and that the package runs nothing on install.
// Exits 1 on any error.
import { readFileSync } from 'node:fs';
import { check, checkPackage } from './tokens.mjs';

const { errors } = check(readFileSync('core.css', 'utf8'), readFileSync('semantic.css', 'utf8'));
errors.push(...checkPackage(readFileSync('package.json', 'utf8')));

if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('core.css and semantic.css follow the rules.');
