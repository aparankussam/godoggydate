import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNationalDogDaySeason } from './seasons.ts';

// Local-time constructors on purpose: the helper reads the viewer's calendar.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);

test('inside the window: Aug 20 through Sep 5', () => {
  assert.equal(isNationalDogDaySeason(d(2026, 8, 20)), true);
  assert.equal(isNationalDogDaySeason(d(2026, 8, 26)), true); // National Dog Day itself
  assert.equal(isNationalDogDaySeason(d(2026, 8, 31)), true);
  assert.equal(isNationalDogDaySeason(d(2026, 9, 1)), true);
  assert.equal(isNationalDogDaySeason(d(2026, 9, 5)), true);
});

test('outside the window', () => {
  assert.equal(isNationalDogDaySeason(d(2026, 8, 19)), false);
  assert.equal(isNationalDogDaySeason(d(2026, 9, 6)), false);
  assert.equal(isNationalDogDaySeason(d(2026, 11, 21)), false); // the November it wrongly showed
  assert.equal(isNationalDogDaySeason(d(2027, 1, 1)), false);
  assert.equal(isNationalDogDaySeason(d(2026, 7, 31)), false);
});
