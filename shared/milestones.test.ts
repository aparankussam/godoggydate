// shared/milestones.test.ts
// Run: node --experimental-strip-types --no-warnings --test shared/milestones.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMilestones } from './milestones.ts';

const NOW = new Date(2026, 10, 20, 15, 0).getTime(); // 20 Nov 2026, afternoon

test('a birthday that has not happened yet produces no celebration or countdown', () => {
  // Older builds let 12/25 be typed in November; it read
  // "It's Rex's birthday! · in 35 days".
  for (const birth of [
    { birthYear: 2026, birthMonth: 12, birthDay: 25 },
    { birthYear: 2026, birthMonth: 11, birthDay: 21 },
    { birthYear: 2026, birthMonth: 12, birthDay: null },
    { birthYear: 2027, birthMonth: 1, birthDay: 1 },
  ]) {
    const r = computeMilestones({ name: 'Rex', ...birth }, NOW);
    assert.deepEqual(r, { active: [], next: null }, JSON.stringify(birth));
  }
});

test('born today, or this month, still celebrates', () => {
  const today = computeMilestones({ name: 'Rex', birthYear: 2026, birthMonth: 11, birthDay: 20 }, NOW);
  assert.equal(today.active.length, 1);
  assert.equal(today.active[0].kind, 'birthday');
  const month = computeMilestones({ name: 'Rex', birthYear: 2026, birthMonth: 11, birthDay: null }, NOW);
  assert.equal(month.active.length, 1);
  assert.equal(month.active[0].title, "Rex's birthday month");
});

test('past birthdays count down to the next one', () => {
  const r = computeMilestones({ name: 'Rex', birthYear: 2021, birthMonth: 6, birthDay: 14 }, NOW);
  assert.equal(r.active.length, 0);
  assert.equal(r.next?.title, "Rex's birthday");
  assert.equal(r.next?.subtitle, 'Turning 6');
  assert.equal(r.next?.daysUntil, 206);
});

test('Gotcha Day waits for a full year and fires on the day / the month', () => {
  const exact = computeMilestones({ name: 'Rex', adoptionDate: '2025-11-20' }, NOW);
  assert.equal(exact.active[0]?.kind, 'gotcha');
  assert.equal(exact.active[0]?.subtitle, '1 year since Rex came home');
  const monthOnly = computeMilestones({ name: 'Rex', adoptionDate: '2025-11' }, NOW);
  assert.equal(monthOnly.active[0]?.title, "Rex's Gotcha month");
  const tooRecent = computeMilestones({ name: 'Rex', adoptionDate: '2026-11-20' }, NOW);
  assert.deepEqual(tooRecent, { active: [], next: null });
});
