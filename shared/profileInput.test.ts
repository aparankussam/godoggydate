// shared/profileInput.test.ts
// Run: node --experimental-strip-types --no-warnings --test shared/profileInput.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROFILE_TEXT_LIMITS,
  US_STATE_CODES,
  isUsStateCode,
  normalizeStateInput,
} from './profileInput.ts';

test('US_STATE_CODES is the 50 states plus DC, each unique and two capital letters', () => {
  assert.equal(US_STATE_CODES.length, 51);
  assert.equal(new Set(US_STATE_CODES).size, 51);
  for (const code of US_STATE_CODES) assert.match(code, /^[A-Z]{2}$/);
});

test('US_STATE_CODES matches the list the web profile form offers', () => {
  const web = readFileSync(new URL('../web/components/DogProfileForm.tsx', import.meta.url), 'utf8');
  const block = /const US_STATES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(web);
  assert.ok(block, 'could not find US_STATES in web/components/DogProfileForm.tsx');
  const webCodes = [...block[1].matchAll(/abbr:\s*'([A-Z]{2})'/g)].map((m) => m[1]);
  assert.deepEqual([...US_STATE_CODES].sort(), [...webCodes].sort());
});

test('isUsStateCode accepts real codes in any case and refuses everything else', () => {
  for (const ok of ['MI', 'mi', ' Mi ', 'DC', 'WY', 'AK']) assert.equal(isUsStateCode(ok), true, ok);
  for (const bad of ['ZZ', 'XX', 'M', 'MII', '', '  ', '12', 'M1', 'PR', 'ON', '🐶', null, undefined]) {
    assert.equal(isUsStateCode(bad as string | null | undefined), false, String(bad));
  }
});

test('normalizeStateInput keeps two upper-case letters and drops everything else', () => {
  assert.equal(normalizeStateInput('mi'), 'MI');
  assert.equal(normalizeStateInput('m'), 'M');
  assert.equal(normalizeStateInput('Mich'), 'MI');
  assert.equal(normalizeStateInput('m1i'), 'MI');
  assert.equal(normalizeStateInput(' m i '), 'MI');
  assert.equal(normalizeStateInput('12'), '');
  assert.equal(normalizeStateInput('🐶🐶'), '');
  assert.equal(normalizeStateInput('مرحبا'), '');
  assert.equal(normalizeStateInput('<script>'), 'SC');
  assert.equal(normalizeStateInput(''), '');
  assert.equal(normalizeStateInput(null), '');
  assert.equal(normalizeStateInput(undefined), '');
});

test('normalizeStateInput is idempotent', () => {
  for (const raw of ['mi', 'M1', 'zz9', '  ny', '🐶a', 'TEXAS']) {
    const once = normalizeStateInput(raw);
    assert.equal(normalizeStateInput(once), once, raw);
  }
});

test('PROFILE_TEXT_LIMITS are positive integers that fit real values', () => {
  for (const [key, value] of Object.entries(PROFILE_TEXT_LIMITS)) {
    assert.ok(Number.isInteger(value) && value > 0, key);
  }
  // The longest real-world values must fit comfortably.
  assert.ok('Chesapeake Bay Retriever x Portuguese Water Dog mix'.length <= PROFILE_TEXT_LIMITS.breed);
  assert.ok('Sir Barkington Woofington the Third, Esq.'.length <= PROFILE_TEXT_LIMITS.name);
  assert.ok('Truth or Consequences'.length <= PROFILE_TEXT_LIMITS.city);
  assert.ok('12345-6789'.length <= PROFILE_TEXT_LIMITS.zip);
});
