import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOUNDING_FREE_SPOTS,
  FOUNDING_PAID_SPOTS,
  FOUNDING_TOTAL,
  foundingPhase,
  foundingSpotsLeft,
  foundingBadgeLabel,
} from './founding.ts';

test('the ladder is 50 free spots, then 100 paid, 150 in total', () => {
  assert.equal(FOUNDING_FREE_SPOTS, 50);
  assert.equal(FOUNDING_PAID_SPOTS, 100);
  assert.equal(FOUNDING_TOTAL, 150);
});

test('free until #50 is taken, paid from then until #150, then closed', () => {
  assert.equal(foundingPhase(0), 'free');
  assert.equal(foundingPhase(49), 'free');
  assert.equal(foundingPhase(50), 'paid');
  assert.equal(foundingPhase(149), 'paid');
  assert.equal(foundingPhase(150), 'closed');
  assert.equal(foundingPhase(173), 'closed');
});

test('spots left counts down within the current phase', () => {
  assert.equal(foundingSpotsLeft(0), 50);
  assert.equal(foundingSpotsLeft(12), 38);
  assert.equal(foundingSpotsLeft(49), 1);
  assert.equal(foundingSpotsLeft(50), 100);
  assert.equal(foundingSpotsLeft(149), 1);
  assert.equal(foundingSpotsLeft(150), 0);
  assert.equal(foundingSpotsLeft(400), 0);
});

test('a bad counter value reads as an empty ladder, never as paid or closed', () => {
  assert.equal(foundingPhase(-3), 'free');
  assert.equal(foundingPhase(Number.NaN), 'free');
  assert.equal(foundingSpotsLeft(Number.NaN), 50);
  assert.equal(foundingPhase(49.9), 'free');
});

test('one badge, with the number when there is one', () => {
  assert.equal(foundingBadgeLabel(7), '⭐ Founding Member #7');
  assert.equal(foundingBadgeLabel(120), '⭐ Founding Member #120');
  assert.equal(foundingBadgeLabel(undefined), '⭐ Founding Member');
  assert.equal(foundingBadgeLabel(null), '⭐ Founding Member');
});
