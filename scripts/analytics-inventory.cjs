#!/usr/bin/env node
// Lists every analytics event the code fires, and on which platform, so
// ANALYTICS-EVENTS.md can be checked against reality instead of memory.
//
//   node scripts/analytics-inventory.cjs            # human-readable table
//   node scripts/analytics-inventory.cjs --json     # machine-readable
//   node scripts/analytics-inventory.cjs --check    # also exit 1 when an event the
//                                                   # code fires is missing from the doc
//
// It reads the FIRST argument of trackEvent(...), trackOncePerSession(key, name)
// and trackFirstTime(uid, key, name), collecting every quoted snake_case literal in
// it (so `cond ? 'a' : 'b'` yields both). Calls whose event name is not a literal
// (an object lookup, a field) are listed separately, with the names declared in
// that file's event:/click:/done: properties counted for them.

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const ROOTS = {
  web: ['web/app', 'web/components', 'web/lib'],
  mobile: ['mobile/app', 'mobile/components', 'mobile/lib'],
};
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'ios', 'android']);
// The wrappers themselves forward a `name` parameter; they are not call sites.
const WRAPPER_FILES = new Set(['web/lib/analytics.ts', 'mobile/lib/analytics.ts']);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(?:tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

/** The text of the n-th (0-based) top-level argument of the call opening at `open`. */
function argument(source, open, n) {
  let depth = 0;
  let index = 0;
  let start = open + 1;
  let quote = null;
  for (let i = open + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) {
      if (depth === 0) return index === n ? source.slice(start, i) : '';
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      if (index === n) return source.slice(start, i);
      index += 1;
      start = i + 1;
    }
  }
  return '';
}

const CALLS = [
  { re: /\btrackEvent\s*\(/g, arg: 0 },
  { re: /\btrackOncePerSession\s*\(/g, arg: 1 },
  { re: /\btrackFirstTime\s*\(/g, arg: 2 },
];

function inventory() {
  const events = new Map(); // name -> { web: Set(files), mobile: Set(files) }
  const dynamic = [];
  for (const [platform, roots] of Object.entries(ROOTS)) {
    const files = [];
    for (const root of roots) walk(path.join(repoRoot, root), files);
    for (const file of files) {
      const rel = path.relative(repoRoot, file);
      if (WRAPPER_FILES.has(rel)) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const { re, arg } of CALLS) {
        for (const match of source.matchAll(re)) {
          // Drop comparisons (`kind === 'type' ? 'a' : 'b'`): their literals are not event names.
          const text = argument(source, match.index + match[0].length - 1, arg).replace(/[!=]==?\s*['"`][^'"`]*['"`]/g, '');
          const names = [...text.matchAll(/['"`]([a-z][a-z0-9_]*)['"`]/g)].map((m) => m[1]);
          if (names.length === 0) {
            // Not a literal (`SHARE_EVENTS[kind].click`, `prompt.event`): take the names
            // from the `event:` / `click:` / `done:` properties declared in the same file.
            const declared = [...source.matchAll(/\b(?:event|click|done)\s*:\s*['"`]([a-z][a-z0-9_]*)['"`]/g)].map((m) => m[1]);
            dynamic.push({ platform, file: rel, call: text.trim().slice(0, 60), resolved: declared.length > 0 });
            for (const name of declared) {
              if (!events.has(name)) events.set(name, { web: new Set(), mobile: new Set() });
              events.get(name)[platform].add(rel);
            }
            continue;
          }
          for (const name of names) {
            if (!events.has(name)) events.set(name, { web: new Set(), mobile: new Set() });
            events.get(name)[platform].add(rel);
          }
        }
      }
    }
  }
  return { events, dynamic };
}

function documentedNames() {
  const doc = fs.readFileSync(path.join(repoRoot, 'ANALYTICS-EVENTS.md'), 'utf8');
  return new Set([...doc.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]));
}

const { events, dynamic } = inventory();
const rows = [...events.entries()]
  .map(([name, where]) => ({ name, web: where.web.size, mobile: where.mobile.size }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ events: rows, dynamic }, null, 2)}\n`);
} else {
  const platform = (row) => (row.web && row.mobile ? 'web+mobile' : row.web ? 'web only' : 'mobile only');
  for (const row of rows) process.stdout.write(`${row.name.padEnd(40)} ${platform(row)}\n`);
  process.stdout.write(`\n${rows.length} events. Calls whose event name is not a literal (names taken from the event:/click:/done: properties in the same file; check them by hand):\n`);
  for (const entry of dynamic) process.stdout.write(`  [${entry.platform}] ${entry.file}: ${entry.call}${entry.resolved ? '' : '  (UNRESOLVED)'}\n`);
}

if (process.argv.includes('--check')) {
  const documented = documentedNames();
  const missing = rows.filter((row) => !documented.has(row.name)).map((row) => row.name);
  if (missing.length > 0) {
    process.stderr.write(`\nFAIL: fired in code but not documented in ANALYTICS-EVENTS.md: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write('\nPASS: every event the code fires is documented in ANALYTICS-EVENTS.md\n');
}
