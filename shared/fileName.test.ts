import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeCardFileName } from './fileName.ts';

test('plain ASCII names are unchanged', () => {
  assert.equal(safeCardFileName('biscuit-jr-excuse-note.png'), 'biscuit-jr-excuse-note.png');
  assert.equal(safeCardFileName('who-knows-fido.png'), 'who-knows-fido.png');
});

test('accents are transliterated, not dropped to "download"', () => {
  assert.equal(safeCardFileName('josé-roast.png'), 'jose-roast.png');
  assert.equal(safeCardFileName('zoë-🏳️‍🌈-mc-flurry-excuse-note.png'), 'zoe-mc-flurry-excuse-note.png');
});

test('names with no ASCII letters fall back to the suffix or a default', () => {
  assert.equal(safeCardFileName('مرحبا-dogtype.png'), 'dogtype.png');
  assert.equal(safeCardFileName('🏳️‍🌈-dogtype.png'), 'dogtype.png');
  assert.equal(safeCardFileName('-.png'), 'godoggydate-card.png');
  assert.equal(safeCardFileName('.png'), 'godoggydate-card.png');
});

test('path separators, markup and whitespace are flattened', () => {
  assert.equal(safeCardFileName('a/b:c*d-note.png'), 'a-b-c-d-note.png');
  assert.equal(safeCardFileName('<script>alert(1)</script>-note.png'), 'script-alert-1-script-note.png');
  assert.equal(safeCardFileName('  spaced   name  -x.png'), 'spaced-name-x.png');
});

test('long names are capped and a missing extension becomes .png', () => {
  const out = safeCardFileName('x'.repeat(300) + '-y.png');
  assert.ok(out.length <= 84, out);
  assert.ok(out.endsWith('.png'));
  assert.equal(safeCardFileName('noext'), 'noext.png');
});
