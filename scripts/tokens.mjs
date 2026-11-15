// Parsing and rule checks for core.css and semantic.css.
// Deliberately strict and small: one declaration per line, no nesting, no at-rules.

export const BASE_SELECTOR = ':root, :host';
export const DARK_SELECTOR = ':root[data-theme="dark"], :host([data-theme="dark"])';

// Semantic tokens copied from the Library Assistant that still hold a raw value. No new ones:
// a new semantic token points at a core token. Remove a name here once it points at one.
export const LEGACY_UNMAPPED = new Set([
  '--semantic-action-primary',
  '--semantic-text-primary',
  '--semantic-text-secondary',
  '--semantic-text-muted',
  '--semantic-text-link',
  '--functional-icon-icon-primary',
  '--semantic-icon-muted',
]);

const DECL = /^(--[a-z0-9-]+)\s*:\s*([^;]+?)\s*;$/i;
const VAR_REF = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i;
// Values products may receive: colors, lengths, numbers, var(), calc(), rgb() and font names.
// Products insert this CSS as text, but a value still shouldn't be able to carry markup, nested
// rules, at-rules, url() or !important.
const SAFE_VALUE = /^[A-Za-z0-9#.,%()\s+\-*/_"']+$/;
const UNSAFE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|important/i;

// Whitespace doesn't matter in a selector; everything else must match exactly.
const normalizeSelector = (s) => s.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');

// Replaces comments with spaces, keeping line breaks so line numbers stay right.
function stripComments(text, file, errors) {
  return text.replace(/\/\*[\s\S]*?(\*\/|$)/g, (comment, end) => {
    if (!end) errors.push(`${file}: a comment is never closed`);
    return comment.replace(/[^\n]/g, ' ');
  });
}

// Returns { blocks: [{ selector, decls: [{ name, value, line }], line }], errors: [string] }
export function parse(text, file) {
  const blocks = [];
  const errors = [];
  let current = null;
  let pending = ''; // selector text collected across lines

  stripComments(text, file, errors)
    .split('\n')
    .forEach((raw, i) => {
      const line = i + 1;
      const s = raw.trim();
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
      const [, name, value] = m;
      if (!SAFE_VALUE.test(value) || UNSAFE_VALUE.test(value)) {
        errors.push(`${file}:${line}: ${name} has a value that isn't allowed: ${value}`);
        return;
      }
      current.decls.push({ name, value, line });
    });

  if (current) errors.push(`${file}: block opened at line ${current.line} is never closed`);
  if (pending.trim()) errors.push(`${file}: stray text outside a block: ${pending.trim()}`);
  return { blocks, errors };
}

// A name declared twice for the same selector, in any blocks of the file: the later one would win silently.
function checkDuplicates(blocks, file, errors) {
  const seen = new Set();
  for (const block of blocks) {
    for (const d of block.decls) {
      const key = `${block.selector} ${d.name}`;
      if (seen.has(key)) errors.push(`${file}:${d.line}: ${d.name} is defined twice for "${block.selector}"`);
      seen.add(key);
    }
  }
}

// Checks both files together. Returns { errors, unmapped: [decl & {file}] }.
export function check(coreText, semanticText) {
  const core = parse(coreText, 'core.css');
  const semantic = parse(semanticText, 'semantic.css');
  const errors = [...core.errors, ...semantic.errors];
  const unmapped = [];
  checkDuplicates(core.blocks, 'core.css', errors);
  checkDuplicates(semantic.blocks, 'semantic.css', errors);

  const coreNames = new Map();
  for (const block of core.blocks) {
    if (block.selector !== BASE_SELECTOR) {
      errors.push(`core.css:${block.line}: selector must be "${BASE_SELECTOR}", got "${block.selector}"`);
    }
    for (const d of block.decls) {
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
    for (const d of block.decls) {
      if (coreNames.has(d.name)) errors.push(`semantic.css:${d.line}: ${d.name} is already a core token`);
      if (isBase) baseSemantic.add(d.name);
      else darkSemantic.push(d);

      const ref = d.value.match(VAR_REF);
      if (ref) {
        if (!coreNames.has(ref[1])) {
          errors.push(`semantic.css:${d.line}: ${d.name} points at ${ref[1]}, which core.css doesn't define`);
        }
      } else if (LEGACY_UNMAPPED.has(d.name)) {
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

// Lifecycle scripts run when a product installs this package (npm runs a git dependency's
// prepare and install scripts). The package is CSS only, so it must have none.
const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'preprepare', 'prepare', 'postprepare', 'prepack', 'postpack'];
export function checkPackage(packageJsonText) {
  const scripts = JSON.parse(packageJsonText).scripts || {};
  return LIFECYCLE_SCRIPTS.filter((name) => name in scripts).map(
    (name) => `package.json: "${name}" would run in every product that installs the design system; remove it`,
  );
}

// Every token as "selector name". Used to find removed tokens.
export function tokenKeys(coreText, semanticText) {
  const keys = new Set();
  for (const [text, file] of [
    [coreText, 'core.css'],
    [semanticText, 'semantic.css'],
  ]) {
    for (const block of parse(text, file).blocks) {
      for (const d of block.decls) keys.add(`${block.selector} ${d.name}`);
    }
  }
  return keys;
}

// Tokens in `before` that are gone from `after`. Changing a value isn't a removal.
export function removedTokens(before, after) {
  return [...before].filter((key) => !after.has(key));
}
