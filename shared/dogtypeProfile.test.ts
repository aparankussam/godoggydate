import test from 'node:test';
import assert from 'node:assert/strict';
import { DOGTYPE_CODES, computeDogtype, describeTypeChange, profileHintsForCode } from './dogtype.ts';

test('profile hints round-trip: the type computed from the hints is the type asked for, for all 16', () => {
  for (const code of DOGTYPE_CODES) {
    const hints = profileHintsForCode(code);
    assert.ok(hints, code);
    assert.equal(computeDogtype(hints!)?.code, code, code);
  }
});

test('profileHintsForCode rejects malformed codes', () => {
  assert.equal(profileHintsForCode('nope'), null);
  assert.equal(profileHintsForCode('EROX'), null);
});

test('describeTypeChange reports names only when the type really changes', () => {
  assert.deepEqual(describeTypeChange('EROB', 'EROB'), { changed: false });
  assert.deepEqual(describeTypeChange(null, 'EROB'), { changed: false });
  assert.deepEqual(describeTypeChange('EROB', null), { changed: false });
  const c = describeTypeChange('EROB', 'ZGSM');
  assert.equal(c.changed, true);
  assert.equal(c.from, 'The Zoomie Menace');
  assert.ok(c.to && c.to !== c.from);
  assert.ok(c.message!.includes('{name}') && c.message!.includes(c.from!) && c.message!.includes(c.to!));
});

test('describeTypeChange names no type while the owner has not revealed theirs', () => {
  const c = describeTypeChange('EROB', 'ZGSM', false);
  assert.equal(c.changed, true);
  assert.equal(c.from, undefined);
  assert.equal(c.to, undefined);
  assert.equal(c.message, "This changes {name}'s Dogtype.");
});
