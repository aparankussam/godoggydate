import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PACK_DAY_LIMITS,
  buildPackDayIcs,
  foldIcsLine,
  formatPackDayWhen,
  isPast,
  mapsSearchUrl,
  spotsLeft,
  type PackDay,
} from './packDay.ts';

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
