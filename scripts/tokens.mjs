// Parsing and rule checks for core.css and semantic.css.
// Deliberately strict and small: one declaration per line, no nesting, no at-rules.

export const BASE_SELECTOR = ':root, :host';
export const DARK_SELECTOR = ':root[data-theme="dark"], :host([data-theme="dark"])';

const DECL = /^(--[a-z0-9-]+)\s*:\s*([^;]+?)\s*;\s*(?:\/\*\s*(.*?)\s*\*\/)?$/i;
const VAR_REF = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i;

const normalizeSelector = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((p) => p.trim()).filter(Boolean).join(', ');

// Returns { blocks: [{ selector, decls: [{ name, value, comment, line }] }], errors: [string] }
export function parse(text, file) {
  const blocks = [];
  const errors = [];
  let current = null;
  let pending = ''; // selector text collected across lines
  let inComment = false;

  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    let s = raw.trim();

    // Skip comment-only lines (including multi-line comments).
    if (inComment) {
      if (s.includes('*/')) inComment = false;
      return;
    }
    if (s.startsWith('/*')) {
      if (!s.includes('*/')) inComment = true;
      return;
    }
    if (!s) return;

    if (!current) {
      if (s.endsWith('{')) {
        current = { selector: normalizeSelector(pending + ' ' + s.slice(0, -1)), decls: [], line };
        pending = '';
      } else {
        pending += ' ' + s;
      }
      return;
    }

    if (s === '}') {
      blocks.push(current);
      current = null;
      return;
    }

    const m = s.match(DECL);
    if (!m) {
      errors.push(`${file}:${line}: expected one "--name: value;" declaration per line, got: ${s}`);
      return;
    }
    current.decls.push({ name: m[1], value: m[2], comment: m[3] || '', line });
  });

  if (current) errors.push(`${file}: block opened at line ${current.line} is never closed`);
  if (pending.trim()) errors.push(`${file}: stray text outside a block: ${pending.trim()}`);
  return { blocks, errors };
}

const isUnmapped = (decl) => /\bunmapped\b/i.test(decl.comment);

// Checks both files together. Returns { errors, unmapped: [decl & {file}] }.
export function check(coreText, semanticText) {
  const core = parse(coreText, 'core.css');
  const semantic = parse(semanticText, 'semantic.css');
  const errors = [...core.errors, ...semantic.errors];
  const unmapped = [];

  const coreNames = new Map();
  for (const block of core.blocks) {
    if (block.selector !== BASE_SELECTOR) {
      errors.push(`core.css:${block.line}: selector must be "${BASE_SELECTOR}", got "${block.selector}"`);
    }
    for (const d of block.decls) {
      if (coreNames.has(d.name)) errors.push(`core.css:${d.line}: ${d.name} is defined twice`);
      coreNames.set(d.name, d.value);
      if (/var\(/i.test(d.value)) {
        errors.push(`core.css:${d.line}: ${d.name} must be a raw value, not a reference (${d.value})`);
      }
    }
  }

  const baseSemantic = new Set();
  const darkSemantic = [];
  for (const block of semantic.blocks) {
    const isBase = block.selector === BASE_SELECTOR;
    const isDark = block.selector === DARK_SELECTOR;
    if (!isBase && !isDark) {
      errors.push(
        `semantic.css:${block.line}: selector must be "${BASE_SELECTOR}" or "${DARK_SELECTOR}", got "${block.selector}"`,
      );
      continue;
    }
    const seen = new Set();
    for (const d of block.decls) {
      if (seen.has(d.name)) errors.push(`semantic.css:${d.line}: ${d.name} is defined twice in one block`);
      seen.add(d.name);
      if (coreNames.has(d.name)) errors.push(`semantic.css:${d.line}: ${d.name} is already a core token`);
      if (isBase) baseSemantic.add(d.name);
      else darkSemantic.push(d);

      const ref = d.value.match(VAR_REF);
      if (ref) {
        if (!coreNames.has(ref[1])) {
          errors.push(`semantic.css:${d.line}: ${d.name} points at ${ref[1]}, which core.css doesn't define`);
        }
      } else if (isUnmapped(d)) {
        unmapped.push({ ...d, file: 'semantic.css' });
      } else {
        errors.push(
          `semantic.css:${d.line}: ${d.name} must be var(--a-core-token), got "${d.value}". ` +
            'Add the value to core.css and point at it.',
        );
      }
    }
  }
  for (const d of darkSemantic) {
    if (!baseSemantic.has(d.name)) {
      errors.push(`semantic.css:${d.line}: dark mode overrides ${d.name}, which has no light value`);
    }
  }

  return { errors, unmapped };
}

// Every token as selector + name -> resolved raw value (semantic references resolved through core).
export function resolve(coreText, semanticText) {
  const core = parse(coreText, 'core.css');
  const semantic = parse(semanticText, 'semantic.css');
  const coreValues = new Map();
  const out = new Map();
  for (const block of core.blocks) {
    for (const d of block.decls) {
      coreValues.set(d.name, d.value);
      out.set(`${block.selector} ${d.name}`, d.value);
    }
  }
  for (const block of semantic.blocks) {
    for (const d of block.decls) {
      const ref = d.value.match(VAR_REF);
      const value = ref && coreValues.has(ref[1]) ? coreValues.get(ref[1]) : d.value;
      out.set(`${block.selector} ${d.name}`, value);
    }
  }
  return out;
}

// Tokens that exist in `before` and are gone or resolve to a different value in `after`.
// Adding tokens, or pointing a token at a core token with the same value, is not a change.
export function changedExisting(before, after) {
  const changes = [];
  for (const [key, value] of before) {
    if (!after.has(key)) changes.push({ key, before: value, after: null });
    else if (after.get(key).toLowerCase() !== value.toLowerCase()) {
      changes.push({ key, before: value, after: after.get(key) });
    }
  }
  return changes;
}
