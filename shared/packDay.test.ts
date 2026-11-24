import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PACK_DAY_LIMITS,
  CHECKIN_OPENS_BEFORE_MS,
  PACK_DAY_START_WINDOW_MESSAGE,
  checkedInDogCount,
  isCheckinOpen,
  sameCity,
  buildPackDayIcs,
  foldIcsLine,
  formatPackDayWhen,
  goingSummary,
  isPast,
  mapsSearchUrl,
  packDayStartTimeProblem,
  packDayStartTimes,
  spotsLeft,
  type PackDay,
} from './packDay.ts';
// The server's copy of the start window (the functions package can't import shared/).
import {
  EARLIEST_START_MINUTES,
  LATEST_START_MINUTES,
  START_WINDOW_MESSAGE,
  isStartTimeAllowed,
} from '../firebase/functions/src/packDayWindow.ts';

function event(over: Partial<PackDay> = {}): PackDay {
  return {
    id: 'abc123',
    hostUid: 'host',
    hostDogName: 'Waffles',
    title: 'Saturday loop',
    format: 'pack-walk',
    startsAtMs: Date.UTC(2026, 10, 21, 9, 0),
    durationMinutes: 90,
    localDate: '2026-11-21',
    localTime: '09:00',
    placeName: 'Cedar Park',
    city: 'Ann Arbor',
    state: 'MI',
    note: '',
    capacity: 8,
    attendeeUids: ['host'],
    status: 'open',
    official: false,
    ...over,
  };
}

const utf8Bytes = (s: string) => Buffer.byteLength(s, 'utf8');

test('formatPackDayWhen renders the host wall clock without timezone math', () => {
  assert.equal(formatPackDayWhen(event()), 'Sat 11/21 · 9:00 AM');
  assert.equal(formatPackDayWhen(event({ localTime: '00:05' })), 'Sat 11/21 · 12:05 AM');
  assert.equal(formatPackDayWhen(event({ localTime: '12:00' })), 'Sat 11/21 · 12:00 PM');
  assert.equal(formatPackDayWhen(event({ localTime: '21:45' })), 'Sat 11/21 · 9:45 PM');
  assert.equal(formatPackDayWhen(event({ localDate: '2027-03-14', localTime: '02:30' })), 'Sun 03/14 · 2:30 AM');
});

test('formatPackDayWhen is empty for malformed stored strings', () => {
  assert.equal(formatPackDayWhen(event({ localDate: '' })), '');
  assert.equal(formatPackDayWhen(event({ localDate: '2026-11-21T00:00' })), '');
  assert.equal(formatPackDayWhen(event({ localTime: '9:00' })), '');
});

test('spotsLeft never goes negative', () => {
  assert.equal(spotsLeft({ capacity: 4, attendeeUids: ['a'] }), 3);
  assert.equal(spotsLeft({ capacity: 4, attendeeUids: ['a', 'b', 'c', 'd'] }), 0);
  assert.equal(spotsLeft({ capacity: 4, attendeeUids: ['a', 'b', 'c', 'd', 'e'] }), 0);
});

test('isPast flips exactly when the event ends', () => {
  const e = { startsAtMs: 1_000_000, durationMinutes: 60 };
  const end = 1_000_000 + 60 * 60_000;
  assert.equal(isPast(e, end - 1), false);
  assert.equal(isPast(e, end), true);
});

test('mapsSearchUrl encodes hostile place names', () => {
  const url = mapsSearchUrl({ placeName: 'Dogs & "Bark" #1', city: 'Ann Arbor', state: '' });
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=Dogs%20%26%20%22Bark%22%20%231%2C%20Ann%20Arbor');
});

test('foldIcsLine leaves short lines alone and folds long ones at 75 octets', () => {
  const short = 'SUMMARY:' + 'a'.repeat(67); // exactly 75
  assert.equal(foldIcsLine(short), short);
  const folded = foldIcsLine('SUMMARY:' + 'a'.repeat(200));
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => utf8Bytes(l) <= 75), 'every physical line is at most 75 octets');
  assert.ok(lines.slice(1).every((l) => l.startsWith(' ')), 'continuations start with a space');
  // Unfolding (drop CRLF + one space) restores the original.
  assert.equal(folded.replace(/\r\n /g, ''), 'SUMMARY:' + 'a'.repeat(200));
});

test('foldIcsLine never splits a multi-byte character or emoji', () => {
  const text = 'SUMMARY:' + '🏳️‍🌈José日本مرحبا'.repeat(12);
  const folded = foldIcsLine(text);
  const lines = folded.split('\r\n');
  assert.ok(lines.every((l) => utf8Bytes(l) <= 75));
  assert.equal(folded.replace(/\r\n /g, ''), text);
  // No lone surrogates anywhere (a split code point would encode as U+FFFD).
  assert.ok(!Buffer.from(folded, 'utf8').toString('utf8').includes('�'));
});

test('buildPackDayIcs ends every line with CRLF and escapes text', () => {
  const ics = buildPackDayIcs(
    event({ title: 'Mix; of, stuff \\ back', placeName: 'A; B, C' }),
    'https://godoggydate.com/pack/abc123',
  );
  assert.ok(ics);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'), 'RFC 5545: the last line ends with CRLF too');
  assert.ok(!/[^\r]\n/.test(ics), 'no bare LF line endings');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Mix\\; of\\, stuff \\\\ back (Pack Day)'));
  assert.ok(unfolded.includes('LOCATION:A\\; B\\, C\\, Ann Arbor\\, MI'));
  assert.ok(unfolded.includes('DTSTART:20261121T090000'));
  assert.ok(unfolded.includes('DTEND:20261121T103000'));
});

test('buildPackDayIcs folds a maximum-length title and rolls DTEND past midnight', () => {
  const ics = buildPackDayIcs(
    event({ title: 'W'.repeat(PACK_DAY_LIMITS.maxTitleLength), localTime: '23:30', durationMinutes: 120 }),
    'https://godoggydate.com/pack/abc123',
  );
  assert.ok(ics);
  for (const line of ics.split('\r\n')) assert.ok(utf8Bytes(line) <= 75, line);
  assert.ok(ics.includes('DTSTART:20261121T233000'));
  assert.ok(ics.includes('DTEND:20261122T013000'));
});

test('buildPackDayIcs refuses malformed stored dates', () => {
  assert.equal(buildPackDayIcs(event({ localDate: 'nope' }), 'u'), null);
  assert.equal(buildPackDayIcs(event({ localTime: '' }), 'u'), null);
});

test('start times: 6:00 AM to 9:45 PM in 15-minute steps, same as the iPhone chips', () => {
  const times = packDayStartTimes();
  assert.equal(times.length, 64); // 16 hours x 4
  assert.deepEqual(times[0], { value: '06:00', label: '6:00 AM' });
  assert.deepEqual(times[times.length - 1], { value: '21:45', label: '9:45 PM' });
  assert.ok(times.some((t) => t.value === '12:00' && t.label === '12:00 PM'));
  assert.ok(times.some((t) => t.value === '09:15' && t.label === '9:15 AM'));
  assert.equal(new Set(times.map((t) => t.value)).size, times.length);
});

test('packDayStartTimeProblem refuses the small hours and late nights, and non-times', () => {
  assert.equal(packDayStartTimeProblem('06:00'), null);
  assert.equal(packDayStartTimeProblem('09:30'), null);
  assert.equal(packDayStartTimeProblem('21:45'), null);
  assert.equal(packDayStartTimeProblem('05:59'), PACK_DAY_START_WINDOW_MESSAGE);
  assert.equal(packDayStartTimeProblem('03:00'), PACK_DAY_START_WINDOW_MESSAGE); // a 3 AM event
  assert.equal(packDayStartTimeProblem('00:00'), PACK_DAY_START_WINDOW_MESSAGE);
  assert.equal(packDayStartTimeProblem('21:46'), PACK_DAY_START_WINDOW_MESSAGE);
  assert.equal(packDayStartTimeProblem('23:59'), PACK_DAY_START_WINDOW_MESSAGE);
  for (const bad of ['', '9:00', '24:00', '12:60', '9am', '09:00:00', ' 09:00', 'ab:cd']) {
    assert.equal(packDayStartTimeProblem(bad), 'Pick a start time.', JSON.stringify(bad));
  }
});

test('the server and the shared copy hold the same start window, minute for minute', () => {
  assert.equal(EARLIEST_START_MINUTES, PACK_DAY_LIMITS.earliestStartMinutes);
  assert.equal(LATEST_START_MINUTES, PACK_DAY_LIMITS.latestStartMinutes);
  assert.equal(START_WINDOW_MESSAGE, PACK_DAY_START_WINDOW_MESSAGE);
  for (let m = 0; m < 24 * 60; m += 1) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    assert.equal(isStartTimeAllowed(hhmm), packDayStartTimeProblem(hhmm) === null, hhmm);
  }
  assert.equal(isStartTimeAllowed(undefined), false);
  assert.equal(isStartTimeAllowed(900), false);
  assert.equal(isStartTimeAllowed('9:00'), false);
});

test('goingSummary: a cancelled event says Cancelled, not a head count', () => {
  const base = { capacity: 8, attendeeUids: ['a', 'b', 'c'] };
  assert.equal(goingSummary({ ...base, status: 'open' }), '3 of 8 dogs going');
  assert.equal(goingSummary({ ...base, status: 'cancelled' }), 'Cancelled');
  assert.equal(goingSummary({ capacity: 4, attendeeUids: ['a', 'b', 'c', 'd'], status: 'open' }), '4 of 4 dogs going · Full');
  assert.equal(goingSummary({ capacity: 4, attendeeUids: ['a', 'b', 'c', 'd'], status: 'cancelled' }), 'Cancelled');
  // The public flyer only has a count, never the list.
  assert.equal(goingSummary({ capacity: 8, attendeeCount: 3, status: 'open' }), '3 of 8 dogs going');
  assert.equal(goingSummary({ capacity: 8, attendeeCount: 3, status: 'cancelled' }), 'Cancelled');
  assert.equal(goingSummary({ capacity: 8, attendeeCount: 8, status: 'open' }), '8 of 8 dogs going · Full');
});

test('check-in opens 30 minutes before the start and closes when the event ends', () => {
  const e = { startsAtMs: 1_000_000_000, durationMinutes: 60, status: 'open' as const };
  assert.equal(isCheckinOpen(e, e.startsAtMs - CHECKIN_OPENS_BEFORE_MS - 1), false);
  assert.equal(isCheckinOpen(e, e.startsAtMs - CHECKIN_OPENS_BEFORE_MS), true);
  assert.equal(isCheckinOpen(e, e.startsAtMs + 59 * 60_000), true);
  assert.equal(isCheckinOpen(e, e.startsAtMs + 60 * 60_000), false);
  assert.equal(isCheckinOpen({ ...e, status: 'cancelled' as never }, e.startsAtMs), false);
});

test('firestore.rules uses the same check-in window as shared/packDay.ts', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.ok(rules.includes(`startsAtMs - ${CHECKIN_OPENS_BEFORE_MS}`));
});

test('checked-in count is per dog; sameCity ignores case and rejects blanks', () => {
  assert.equal(checkedInDogCount([{ dogId: 'a' }, { dogId: 'a' }, { dogId: 'b' }]), 2);
  assert.equal(sameCity(' Austin ', 'austin'), true);
  assert.equal(sameCity('', ''), false);
  assert.equal(sameCity(null, 'Austin'), false);
});
