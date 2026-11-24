import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// matchingEngine.ts imports its siblings without an extension; same shim as shared/matchingEngine.test.ts.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(specifier)) {
      for (const suffix of ['.ts', '/index.ts']) {
        try { return await nextResolve(specifier + suffix, context); } catch {}
      }
    }
    throw err;
  }
}`),
);

const { dogMixLine, dogMixSummary, packGroupScheduleLabel } = await import('./packGroup.ts');
// The server's schedule math (the functions package can't import shared/).
const { isRealDate, nextOccurrenceDate, ordinalOf, weekdayOf, wallClockToUtcMs, isValidTimeZone } =
  await import('../firebase/functions/src/packGroupSchedule.ts');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dog(over: Record<string, any> = {}): any {
  return { id: 'd', name: 'Dog', size: 'M', age: 'adult', notGoodWith: [], behaviorFlags: [], playStyles: [], energyLevel: 50, ...over };
}

test('dogMixLine counts sizes and puppies', () => {
  const dogs = [
    ...Array(4).fill(dog({ size: 'S' })), dog({ size: 'L' }), dog({ size: 'XL' }), dog({ size: 'S', age: 'puppy' }),
  ];
  assert.equal(dogMixLine(dogs), '5 small, 2 large, 1 puppy');
  assert.equal(dogMixLine([dog({ size: 'M' }), dog({ size: 'M', age: 'puppy' }), dog({ age: 'puppy' })]), '3 medium, 2 puppies');
  assert.equal(dogMixLine([]), '');
});

test('dogMixSummary adds a careful-intro note when a stated limit is tripped', () => {
  const picky = dog({ notGoodWith: ['small dogs'] });
  assert.equal(dogMixSummary([picky, dog({ size: 'L' })]), '1 medium, 1 large');
  assert.equal(dogMixSummary([picky, dog({ size: 'S' })]), '1 small, 1 medium · 1 owner asks for a careful intro');
});

test('weekly, biweekly and monthly next dates', () => {
  assert.equal(nextOccurrenceDate('weekly', '2026-11-29', 5), '2026-12-06');
  assert.equal(nextOccurrenceDate('biweekly', '2026-12-20', 3), '2027-01-03');
  // 1st Sunday of Dec 2026 is the 6th; 1st Sunday of Jan 2027 is the 3rd.
  assert.equal(weekdayOf('2026-12-06'), 0);
  assert.equal(ordinalOf('2026-12-06'), 1);
  assert.equal(nextOccurrenceDate('monthly', '2026-12-06', 1), '2027-01-03');
  // A 5th weekday is held to the 4th so every month has one.
  assert.equal(ordinalOf('2026-11-29'), 4);
  assert.equal(nextOccurrenceDate('monthly', '2026-11-29', 4), '2026-12-27');
  // Year rollover.
  assert.equal(nextOccurrenceDate('monthly', '2026-12-27', 4), '2027-01-24');
});

test('isRealDate and isValidTimeZone', () => {
  assert.equal(isRealDate('2026-11-30'), true);
  assert.equal(isRealDate('2026-11-31'), false);
  assert.equal(isRealDate('nope'), false);
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('Mars/Base'), false);
});

test('wallClockToUtcMs follows daylight saving', () => {
  // 9:00 AM in New York: EST (UTC-5) in winter, EDT (UTC-4) in summer.
  assert.equal(new Date(wallClockToUtcMs('2026-12-06', '09:00', 'America/New_York')).toISOString(), '2026-12-06T14:00:00.000Z');
  assert.equal(new Date(wallClockToUtcMs('2026-07-05', '09:00', 'America/New_York')).toISOString(), '2026-07-05T13:00:00.000Z');
  // The Sunday after the spring-forward change keeps 9:00 local.
  assert.equal(new Date(wallClockToUtcMs('2027-03-14', '09:00', 'America/New_York')).toISOString(), '2027-03-14T13:00:00.000Z');
  assert.equal(new Date(wallClockToUtcMs('2026-12-06', '09:00', 'UTC')).toISOString(), '2026-12-06T09:00:00.000Z');
});

test('packGroupScheduleLabel', () => {
  assert.equal(packGroupScheduleLabel({ frequency: 'weekly', weekday: 0, localTime: '09:00' }), 'Every Sunday · 9:00 AM');
  assert.equal(packGroupScheduleLabel({ frequency: 'biweekly', weekday: 6, localTime: '17:30' }), 'Every other Saturday · 5:30 PM');
  assert.equal(packGroupScheduleLabel({ frequency: 'monthly', weekday: 2, localTime: '12:00' }), 'Monthly on Tuesdays · 12:00 PM');
});
