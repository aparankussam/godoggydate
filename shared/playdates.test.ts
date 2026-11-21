import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePlaydateDate,
  parsePlaydateTime,
  playdateDateBounds,
  playdateDraftProblem,
  formatPlaydateWhen,
  formatMessageTime,
  MAX_PLAYDATE_PLACE_LENGTH,
  buildPlaydateIcs,
  playdateIcsFileName,
  otherUserIdFromMatchId,
} from './playdates.ts';

// Fixed "now": Thursday 2026-11-19, 15:30 local.
const NOW = new Date(2026, 10, 19, 15, 30);

test('parsePlaydateDate accepts only real YYYY-MM-DD dates', () => {
  assert.ok(parsePlaydateDate('2026-11-25'));
  assert.ok(parsePlaydateDate('2028-02-29')); // leap
  assert.equal(parsePlaydateDate('2027-02-29'), null);
  assert.equal(parsePlaydateDate('2026-02-30'), null);
  assert.equal(parsePlaydateDate('2026-04-31'), null);
  assert.equal(parsePlaydateDate('2026-13-01'), null);
  assert.equal(parsePlaydateDate('2026-00-10'), null);
  assert.equal(parsePlaydateDate('99999-12-31'), null); // 5-digit year from a date input
  assert.equal(parsePlaydateDate('11/25/2026'), null);
  assert.equal(parsePlaydateDate('Sat, July 12'), null);
  assert.equal(parsePlaydateDate(''), null);
  assert.equal(parsePlaydateDate(null), null);
});

test('parsePlaydateTime accepts only 24-hour HH:MM', () => {
  assert.equal(parsePlaydateTime('00:00'), 0);
  assert.equal(parsePlaydateTime('15:30'), 15 * 60 + 30);
  assert.equal(parsePlaydateTime('24:00'), null);
  assert.equal(parsePlaydateTime('12:60'), null);
  assert.equal(parsePlaydateTime('3pm'), null);
  assert.equal(parsePlaydateTime(''), null);
});

test('a draft in the past, or a time already gone today, is refused', () => {
  assert.equal(playdateDraftProblem({ date: '2020-01-01', time: '10:00', place: 'Park' }, NOW)?.field, 'date');
  assert.equal(playdateDraftProblem({ date: '2026-11-18', time: '', place: 'Park' }, NOW)?.field, 'date');
  assert.equal(playdateDraftProblem({ date: '0001-01-01', time: '', place: 'Park' }, NOW)?.field, 'date');
  assert.equal(playdateDraftProblem({ date: '2026-11-19', time: '09:00', place: 'Park' }, NOW)?.field, 'time');
});

test('today is fine with no time, or a time still ahead', () => {
  assert.equal(playdateDraftProblem({ date: '2026-11-19', time: '', place: 'Park' }, NOW), null);
  assert.equal(playdateDraftProblem({ date: '2026-11-19', time: '15:30', place: 'Park' }, NOW), null);
  assert.equal(playdateDraftProblem({ date: '2026-11-19', time: '18:00', place: 'Park' }, NOW), null);
});

test('a date beyond a year, or an impossible one, is refused', () => {
  const { min, max } = playdateDateBounds(NOW);
  assert.equal(min, '2026-11-19');
  assert.equal(max, '2027-11-19');
  assert.equal(playdateDraftProblem({ date: max, time: '', place: 'Park' }, NOW), null);
  assert.equal(playdateDraftProblem({ date: '2027-11-20', time: '', place: 'Park' }, NOW)?.field, 'date');
  assert.equal(playdateDraftProblem({ date: '99999-12-31', time: '', place: 'Park' }, NOW)?.field, 'date');
  assert.equal(playdateDraftProblem({ date: '2026-02-30', time: '', place: 'Park' }, NOW)?.field, 'date');
  assert.equal(playdateDraftProblem({ date: '', time: '', place: 'Park' }, NOW)?.field, 'date');
});

test('the place is required and capped', () => {
  assert.equal(playdateDraftProblem({ date: '2026-11-25', time: '', place: '   ' }, NOW)?.field, 'place');
  assert.equal(playdateDraftProblem({ date: '2026-11-25', time: '', place: 'P'.repeat(MAX_PLAYDATE_PLACE_LENGTH) }, NOW), null);
  assert.equal(playdateDraftProblem({ date: '2026-11-25', time: '', place: 'P'.repeat(MAX_PLAYDATE_PLACE_LENGTH + 1) }, NOW)?.field, 'place');
});

test('a malformed time is refused', () => {
  assert.equal(playdateDraftProblem({ date: '2026-11-25', time: '25:00', place: 'Park' }, NOW)?.field, 'time');
});

test('formatPlaydateWhen reads like a person wrote it, and leaves old free text alone', () => {
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '15:30' }, NOW), 'Sun, Nov 22 at 3:30 PM');
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '00:05' }, NOW), 'Sun, Nov 22 at 12:05 AM');
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '12:00' }, NOW), 'Sun, Nov 22 at 12:00 PM');
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '' }, NOW), 'Sun, Nov 22');
  assert.equal(formatPlaydateWhen({ date: '2027-01-02', time: '' }, NOW), 'Sat, Jan 2, 2027');
  assert.equal(formatPlaydateWhen({ date: 'Sat, July 12', time: '10:00 AM' }, NOW), 'Sat, July 12 at 10:00 AM');
  assert.equal(formatPlaydateWhen({ date: 'Sat, July 12' }, NOW), 'Sat, July 12');
});

test('formatMessageTime says when, not just the clock time', () => {
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).getTime();
  const now = at(2026, 11, 19, 15, 30).valueOf();
  assert.equal(formatMessageTime(at(2026, 11, 19, 9, 5), now), '9:05 AM');
  assert.equal(formatMessageTime(at(2026, 11, 19, 23, 59), now), '11:59 PM'); // later today (clock skew) is still "today"
  assert.equal(formatMessageTime(at(2026, 11, 18, 23, 59), now), 'Yesterday 11:59 PM');
  assert.equal(formatMessageTime(at(2026, 11, 16, 8, 0), now), 'Mon 8:00 AM');
  assert.equal(formatMessageTime(at(2026, 11, 12, 8, 0), now), 'Nov 12, 8:00 AM');
  assert.equal(formatMessageTime(at(2025, 11, 12, 8, 0), now), 'Nov 12, 2025');
  assert.equal(formatMessageTime(Number.NaN, now), '');
});

// ── .ics ─────────────────────────────────────────────────────────────────────

const ICS_NOW = new Date(Date.UTC(2026, 10, 19, 20, 30, 0));

test('buildPlaydateIcs makes a one-hour floating-time event with CRLF lines', () => {
  const ics = buildPlaydateIcs(
    { date: '2026-11-22', time: '15:30', place: 'Maple Dog Park, Ann Arbor' },
    { dogName: 'Moose', uidSeed: 'matchABC', now: ICS_NOW },
  );
  assert.ok(ics);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261122T153000\r\n/);
  assert.match(ics, /DTEND:20261122T163000\r\n/);
  assert.match(ics, /SUMMARY:Playdate with Moose\r\n/);
  assert.match(ics, /LOCATION:Maple Dog Park\\, Ann Arbor\r\n/); // comma escaped
  assert.match(ics, /DTSTAMP:20261119T203000Z\r\n/);
  assert.match(ics, /UID:playdate-matchABC-2026-11-22-1530@godoggydate.com/);
  assert.ok(!/\r\n\r\n/.test(ics.trimEnd()));
});

test('buildPlaydateIcs rolls a late-evening end into the next day and handles no time as all-day', () => {
  const late = buildPlaydateIcs({ date: '2026-12-31', time: '23:30', place: 'Park' }, { dogName: 'Moose', uidSeed: 'm', now: ICS_NOW });
  assert.match(late!, /DTSTART:20261231T233000/);
  assert.match(late!, /DTEND:20270101T003000/);
  const allDay = buildPlaydateIcs({ date: '2026-12-31', place: 'Park' }, { dogName: 'Moose', uidSeed: 'm', now: ICS_NOW });
  assert.match(allDay!, /DTSTART;VALUE=DATE:20261231/);
  assert.match(allDay!, /DTEND;VALUE=DATE:20270101/);
});

test('buildPlaydateIcs refuses a date that is not a real ISO date', () => {
  assert.equal(buildPlaydateIcs({ date: 'Sat, July 12', time: '10:00', place: 'x' }, { dogName: 'M', uidSeed: 'm' }), null);
  assert.equal(buildPlaydateIcs({ date: '2026-02-30', place: 'x' }, { dogName: 'M', uidSeed: 'm' }), null);
});

test('buildPlaydateIcs escapes and folds hostile text so it cannot inject calendar lines', () => {
  const place = 'Park\r\nEND:VEVENT\r\nBEGIN:VEVENT; ' + 'x'.repeat(200) + ' 🐕🐕🐕';
  const ics = buildPlaydateIcs({ date: '2026-11-22', time: '10:00', place }, { dogName: 'Zoë; DROP', uidSeed: '../../etc', now: ICS_NOW })!;
  const lines = ics.split('\r\n');
  assert.equal(lines.filter((l) => l === 'END:VEVENT').length, 1);
  assert.equal(lines.filter((l) => l === 'BEGIN:VEVENT').length, 1);
  for (const line of lines) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line}`);
  assert.match(ics, /UID:playdate-etc-/);
  assert.match(ics, /SUMMARY:Playdate with Zoë\; DROP/);
});

test('playdateIcsFileName is a safe slug', () => {
  assert.equal(playdateIcsFileName('Moose', '2026-11-22'), 'playdate-moose-2026-11-22.ics');
  assert.equal(playdateIcsFileName('Zoë & Co!', '2026-11-22'), 'playdate-zoe-co-2026-11-22.ics');
  assert.equal(playdateIcsFileName('../../x', 'Sat'), 'playdate-x.ics');
  assert.equal(playdateIcsFileName('🐕', 'bad'), 'playdate-with-gdd.ics');
});

test('otherUserIdFromMatchId reads the other half of a {uid1}_{uid2} match id', () => {
  assert.equal(otherUserIdFromMatchId('aaa_bbb', 'aaa'), 'bbb');
  assert.equal(otherUserIdFromMatchId('aaa_bbb', 'bbb'), 'aaa');
  assert.equal(otherUserIdFromMatchId('aaa_bbb', 'ccc'), null);
  assert.equal(otherUserIdFromMatchId('aaa_bbb', 'aa'), null);   // a prefix is not the id
  assert.equal(otherUserIdFromMatchId('aaa_bbb', ''), null);
  assert.equal(otherUserIdFromMatchId('', 'aaa'), null);
  assert.equal(otherUserIdFromMatchId('aaa_', 'aaa'), null);      // nothing on the other side
});
