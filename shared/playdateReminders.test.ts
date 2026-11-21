import test from 'node:test';
import assert from 'node:assert/strict';

// The decision logic of the playdate reminder function. The file under test is
// the one the Cloud Function runs (it has no imports, so there is no mirror
// copy to fall out of step): firebase/functions/src/playdates.ts only adds
// Firestore and push around it.
import {
  HOUR_MS,
  MINUTE_MS,
  afterQuietHours,
  buildReminderPush,
  computePlaydateStart,
  confirmedAtMs,
  dueReminders,
  isValidTimeZone,
  latestConfirmedPlaydate,
  localParts,
  parseClock,
  parseIsoDate,
  playdateKey,
  reminderSchedule,
  wallTimeToUtcMs,
  zoneForState,
} from '../firebase/functions/src/playdateReminders.ts';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

// Saturday 2026-11-21, 3:00 PM in New York (EST, UTC-5) = 20:00Z.
const SAT_3PM = Date.UTC(2026, 10, 21, 20, 0);
const SAT = { date: '2026-11-21', time: '15:00', place: 'Cedar Park' };
const CONFIRMED_LONG_AGO = Date.UTC(2026, 10, 10, 12, 0);

test('strict parsing: only real ISO dates and 24-hour clocks', () => {
  assert.deepEqual(parseIsoDate('2026-11-21'), { y: 2026, m: 11, d: 21 });
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('2027-02-29'), null);
  assert.ok(parseIsoDate('2028-02-29'));
  assert.equal(parseIsoDate('Sat, July 12'), null); // free text from an older iPhone build
  assert.equal(parseIsoDate('11/21/2026'), null);
  assert.equal(parseIsoDate('99999-12-31'), null);
  assert.equal(parseIsoDate(''), null);
  assert.equal(parseIsoDate(undefined), null);
  assert.deepEqual(parseClock('09:05'), { h: 9, min: 5 });
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('3pm'), null);
  assert.equal(parseClock(''), null);
});

test('wall clock to instant, in the person\'s own zone, across both DST changes', () => {
  assert.equal(wallTimeToUtcMs(2026, 11, 21, 15, 0, NY), SAT_3PM); // EST
  assert.equal(wallTimeToUtcMs(2026, 7, 4, 15, 0, NY), Date.UTC(2026, 6, 4, 19, 0)); // EDT
  assert.equal(wallTimeToUtcMs(2026, 11, 21, 15, 0, LA), Date.UTC(2026, 10, 21, 23, 0)); // PST
  // Fall back (Nov 1 2026): 1:30 AM happens twice; the first one wins.
  assert.equal(wallTimeToUtcMs(2026, 11, 1, 1, 30, NY), Date.UTC(2026, 10, 1, 5, 30));
  // Spring forward (Mar 8 2026): 2:30 AM does not exist, it lands an hour later.
  assert.equal(wallTimeToUtcMs(2026, 3, 8, 2, 30, NY), Date.UTC(2026, 2, 8, 7, 30));
  // Day overflow rolls into the next month.
  assert.equal(wallTimeToUtcMs(2026, 11, 31, 8, 0, NY), wallTimeToUtcMs(2026, 12, 1, 8, 0, NY));
  const p = localParts(SAT_3PM, NY);
  assert.deepEqual([p.y, p.m, p.d, p.hour, p.minute, p.weekday], [2026, 11, 21, 15, 0, 6]);
});

test('time zones: device zone validated, state as a fallback', () => {
  assert.equal(isValidTimeZone('America/Detroit'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone(42), false);
  assert.equal(zoneForState('MI'), 'America/Detroit');
  assert.equal(zoneForState(' ca '), 'America/Los_Angeles');
  assert.equal(zoneForState('ZZ'), null);
  assert.equal(zoneForState(undefined), null);
});

test('a normal playdate: 24 h before, 2 h before, then how did it go at +2.5 h', () => {
  const schedule = reminderSchedule(SAT, NY, CONFIRMED_LONG_AGO);
  const by = Object.fromEntries(schedule.map((r) => [r.kind, r]));
  assert.equal(by.day_before.fromMs, SAT_3PM - 24 * HOUR_MS); // Fri 3 PM, awake hours
  assert.equal(by.two_hours.fromMs, SAT_3PM - 2 * HOUR_MS);
  assert.equal(by.how_did_it_go.fromMs, SAT_3PM + 2.5 * HOUR_MS); // 5:30 PM
  assert.equal(by.how_did_it_go.untilMs, wallTimeToUtcMs(2026, 11, 21, 22, 0, NY)); // not into the night
});

test('what is due at each moment: nothing early, one thing in its window, nothing late', () => {
  const at = (ms: number) => dueReminders(SAT, NY, CONFIRMED_LONG_AGO, ms);
  assert.deepEqual(at(SAT_3PM - 25 * HOUR_MS), []);
  assert.deepEqual(at(SAT_3PM - 24 * HOUR_MS), ['day_before']);
  assert.deepEqual(at(SAT_3PM - 24 * HOUR_MS + 89 * MINUTE_MS), ['day_before']);
  assert.deepEqual(at(SAT_3PM - 24 * HOUR_MS + 91 * MINUTE_MS), []); // too late to say "tomorrow"
  assert.deepEqual(at(SAT_3PM - 5 * HOUR_MS), []);
  assert.deepEqual(at(SAT_3PM - 2 * HOUR_MS), ['two_hours']);
  assert.deepEqual(at(SAT_3PM - 2 * HOUR_MS + 59 * MINUTE_MS), ['two_hours']);
  assert.deepEqual(at(SAT_3PM - HOUR_MS), []);
  assert.deepEqual(at(SAT_3PM + HOUR_MS), []); // the playdate itself: nothing
  assert.deepEqual(at(SAT_3PM + 2 * HOUR_MS), []); // not before 2.5 h
  assert.deepEqual(at(SAT_3PM + 2.5 * HOUR_MS), ['how_did_it_go']);
  assert.deepEqual(at(SAT_3PM + 3 * HOUR_MS), ['how_did_it_go']);
  assert.deepEqual(at(SAT_3PM + 8 * HOUR_MS), []); // 11 PM: quiet hours, and past the window
  assert.deepEqual(at(SAT_3PM + 3 * 24 * HOUR_MS), []);
});

test('the rating prompt never comes before the playdate has happened, whatever the zone', () => {
  // 3 PM on the West Coast is 6 PM in New York. A person in LA must not be
  // prompted at 5:30 PM Eastern, which is only 2:30 PM their time.
  const startLa = wallTimeToUtcMs(2026, 11, 21, 15, 0, LA);
  const prompt = reminderSchedule(SAT, LA, CONFIRMED_LONG_AGO).find((r) => r.kind === 'how_did_it_go')!;
  assert.ok(prompt.fromMs >= startLa + 2 * HOUR_MS);
  assert.deepEqual(dueReminders(SAT, LA, CONFIRMED_LONG_AGO, SAT_3PM + 2.5 * HOUR_MS), []);
});

test('a playdate confirmed late skips the reminders whose moment had passed', () => {
  const confirmed10hBefore = SAT_3PM - 10 * HOUR_MS;
  const kinds = reminderSchedule(SAT, NY, confirmed10hBefore).map((r) => r.kind);
  assert.deepEqual(kinds, ['two_hours', 'how_did_it_go']); // no "tomorrow" ten hours out
  const confirmed1hBefore = SAT_3PM - HOUR_MS;
  assert.deepEqual(reminderSchedule(SAT, NY, confirmed1hBefore).map((r) => r.kind), ['how_did_it_go']);
  // Confirmed after the playdate: nothing to remind, nothing to ask yet.
  assert.deepEqual(reminderSchedule(SAT, NY, SAT_3PM + 5 * HOUR_MS), []);
});

test('quiet hours: day-before and how-did-it-go wait for 8 AM, the 2-hour reminder does not', () => {
  // A 6 AM playdate: 24 h before is 6 AM the day before, which waits until 8.
  const early = { date: '2026-11-21', time: '06:00', place: 'Dog Beach' };
  const earlyStart = wallTimeToUtcMs(2026, 11, 21, 6, 0, NY);
  const s = Object.fromEntries(reminderSchedule(early, NY, CONFIRMED_LONG_AGO).map((r) => [r.kind, r]));
  assert.equal(s.day_before.fromMs, wallTimeToUtcMs(2026, 11, 20, 8, 0, NY));
  assert.equal(s.two_hours.fromMs, earlyStart - 2 * HOUR_MS); // 4 AM, as asked for
  // An 8 PM playdate: +2.5 h is 10:30 PM, so the prompt waits for the next morning.
  const late = { date: '2026-11-21', time: '20:00', place: 'Cedar Park' };
  const p = reminderSchedule(late, NY, CONFIRMED_LONG_AGO).find((r) => r.kind === 'how_did_it_go')!;
  assert.equal(p.fromMs, wallTimeToUtcMs(2026, 11, 22, 8, 0, NY));
  assert.equal(afterQuietHours(wallTimeToUtcMs(2026, 11, 21, 12, 0, NY), NY), wallTimeToUtcMs(2026, 11, 21, 12, 0, NY));
  assert.equal(afterQuietHours(wallTimeToUtcMs(2026, 11, 21, 23, 30, NY), NY), wallTimeToUtcMs(2026, 11, 22, 8, 0, NY));
  assert.equal(afterQuietHours(wallTimeToUtcMs(2026, 11, 21, 3, 0, NY), NY), wallTimeToUtcMs(2026, 11, 21, 8, 0, NY));
});

test('a date with no time: a day-before and an evening prompt, never a countdown', () => {
  const dateOnly = { date: '2026-11-21', time: '', place: 'Cedar Park' };
  const kinds = reminderSchedule(dateOnly, NY, CONFIRMED_LONG_AGO).map((r) => r.kind);
  assert.deepEqual(kinds, ['day_before', 'how_did_it_go']);
  const start = computePlaydateStart(dateOnly, NY)!;
  assert.equal(start.hasTime, false);
  assert.equal(start.promptMs, wallTimeToUtcMs(2026, 11, 21, 20, 0, NY));
  // Free text where the time goes counts as no time.
  assert.deepEqual(reminderSchedule({ ...dateOnly, time: 'around 3pm' }, NY, CONFIRMED_LONG_AGO).map((r) => r.kind), ['day_before', 'how_did_it_go']);
});

test('a legacy free-text date produces nothing, in particular no rating prompt', () => {
  for (const date of ['Sat, July 12', 'tomorrow', '7/12', '', '2026-13-45']) {
    assert.deepEqual(reminderSchedule({ date, time: '15:00', place: 'Park' }, NY, CONFIRMED_LONG_AGO), []);
    assert.deepEqual(dueReminders({ date, time: '15:00' }, NY, CONFIRMED_LONG_AGO, SAT_3PM + 3 * HOUR_MS), []);
  }
});

test('only the latest confirmed playdate counts', () => {
  const m = (id: string, date: string, createdAtMs: number, extra: object = {}) =>
    ({ id, date, time: '15:00', place: 'Park', createdAtMs, ...extra });
  const older = m('a', '2026-11-21', 1000);
  const newer = m('b', '2026-11-28', 2000); // a reschedule
  assert.equal(latestConfirmedPlaydate([older, newer])?.id, 'b');
  assert.equal(latestConfirmedPlaydate([newer, older])?.id, 'b');
  assert.equal(latestConfirmedPlaydate([])?.id, undefined);
  // Moderated and free-text confirmations don't count.
  assert.equal(latestConfirmedPlaydate([older, m('c', '2026-12-05', 3000, { moderated: true })])?.id, 'a');
  assert.equal(latestConfirmedPlaydate([older, m('d', 'Sat, July 12', 4000)])?.id, 'a');
  assert.equal(latestConfirmedPlaydate([m('d', 'Sat, July 12', 4000)]), null);
  // Created in the same millisecond: the message's own createdAt decides, in any order.
  const early = m('e', '2026-11-21', 7000, { claimedAtMs: 100 });
  const late = m('f', '2026-11-28', 7000, { claimedAtMs: 200 });
  assert.equal(latestConfirmedPlaydate([early, late])?.id, 'f');
  assert.equal(latestConfirmedPlaydate([late, early])?.id, 'f');
  // Equal timestamps: the same pick whatever the order.
  const x = m('x', '2026-11-21', 5000);
  const y = m('y', '2026-11-21', 5000);
  assert.equal(latestConfirmedPlaydate([x, y])?.id, latestConfirmedPlaydate([y, x])?.id);
  // Two people accepting the same proposal = one playdate (same key).
  assert.equal(playdateKey(x), playdateKey(y));
  assert.notEqual(playdateKey(x), playdateKey(newer));
});

test('the notification names the other dog and the place, nothing about people', () => {
  const nowMs = SAT_3PM - 24 * HOUR_MS; // Friday 3 PM
  const day = buildReminderPush('day_before', { dogName: 'Waffles', playdate: SAT, timeZone: NY, nowMs });
  assert.equal(day.title, 'Playdate with Waffles tomorrow 🐾');
  assert.equal(day.body, 'Sat, Nov 21 at 3:00 PM · Cedar Park');

  const two = buildReminderPush('two_hours', { dogName: 'Waffles', playdate: SAT, timeZone: NY, nowMs: SAT_3PM - 2 * HOUR_MS });
  assert.equal(two.title, 'Playdate with Waffles in about 2 hours 🐾');
  assert.equal(two.body, '3:00 PM · Cedar Park');

  const after = buildReminderPush('how_did_it_go', { dogName: 'Waffles', playdate: SAT, timeZone: NY, nowMs: SAT_3PM + 3 * HOUR_MS });
  assert.equal(after.title, 'How did it go with Waffles? 🐾');
  assert.ok(!/cedar|3:00/i.test(after.body)); // nothing to leak on a lock screen after the fact

  // "tomorrow" only when it is; a prompt shifted by quiet hours says the weekday.
  const dayLater = buildReminderPush('day_before', { dogName: 'Waffles', playdate: SAT, timeZone: NY, nowMs: SAT_3PM - 8 * HOUR_MS }); // Saturday 7 AM
  assert.equal(dayLater.title, 'Playdate with Waffles today 🐾');
  const week = buildReminderPush('day_before', { dogName: 'Waffles', playdate: SAT, timeZone: NY, nowMs: SAT_3PM - 3 * 24 * HOUR_MS });
  assert.equal(week.title, 'Playdate with Waffles on Saturday 🐾');

  // Date only, no place, no name.
  const bare = buildReminderPush('day_before', { dogName: '  ', playdate: { date: '2026-11-21' }, timeZone: NY, nowMs });
  assert.equal(bare.title, 'Playdate with your match tomorrow 🐾');
  assert.equal(bare.body, 'Sat, Nov 21');

  // A long place is cut; control characters and newlines can't break the push.
  const long = buildReminderPush('two_hours', { dogName: 'A\nB', playdate: { date: '2026-11-21', time: '15:00', place: `${'x'.repeat(200)}\n` }, timeZone: NY, nowMs });
  assert.ok(long.body.length <= 80);
  assert.ok(!/\n/.test(long.title + long.body));
});

test('confirmedAtMs: the server create time, or an EARLIER createdAt, never a later one', () => {
  assert.equal(confirmedAtMs({ createdAtMs: 5000 }), 5000);
  assert.equal(confirmedAtMs({ createdAtMs: 5000, claimedAtMs: 3000 }), 3000);
  assert.equal(confirmedAtMs({ createdAtMs: 5000, claimedAtMs: 9000 }), 5000); // a client can't push it later
  assert.equal(confirmedAtMs({ createdAtMs: 5000, claimedAtMs: Number.NaN }), 5000);
});
