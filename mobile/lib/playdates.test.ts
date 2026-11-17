import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMessageTime,
  formatPlaydateWhen,
  parseIsoDate,
  parseIsoTime,
  playdatePhase,
  playdateStartMs,
  resolvePlaydate,
  toIsoDate,
  toIsoTime,
} from './playdates.ts';

const at = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

test('writes the same ISO strings web stores', () => {
  const d = new Date(2026, 10, 2, 9, 5);
  assert.equal(toIsoDate(d), '2026-11-02');
  assert.equal(toIsoTime(d), '09:05');
});

test('strict ISO parsing rejects free text and impossible dates', () => {
  assert.equal(parseIsoDate('Sat, July 12'), null);
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('2026-02-28')?.getDate(), 28);
  assert.equal(parseIsoTime('10:00 AM'), null);
  assert.equal(parseIsoTime('24:00'), null);
  assert.equal(parseIsoTime('15:30'), 15 * 60 + 30);
});

test('formats structured playdates for people', () => {
  const now = at(2026, 11, 17, 12);
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '15:30' }, now), 'Sun, Nov 22 at 3:30 PM');
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '00:15' }, now), 'Sun, Nov 22 at 12:15 AM');
  assert.equal(formatPlaydateWhen({ date: '2026-11-22', time: '' }, now), 'Sun, Nov 22');
  assert.equal(formatPlaydateWhen({ date: '2027-01-03', time: '12:00' }, now), 'Sun, Jan 3, 2027 at 12:00 PM');
});

test('shows old free-text playdates exactly as typed', () => {
  assert.equal(formatPlaydateWhen({ date: 'Sat, July 12', time: '10:00 AM' }), 'Sat, July 12 at 10:00 AM');
  assert.equal(formatPlaydateWhen({ date: 'this weekend', time: '' }), 'this weekend');
  // Malformed docs must not throw.
  assert.equal(formatPlaydateWhen({ date: undefined as unknown as string, time: null }), '');
});

test('a structured playdate is upcoming until an hour after it starts', () => {
  const p = { date: '2026-11-22', time: '15:00' };
  assert.equal(playdatePhase(p, at(2026, 11, 20)), 'upcoming');
  assert.equal(playdatePhase(p, at(2026, 11, 22, 15, 30)), 'upcoming');
  assert.equal(playdatePhase(p, at(2026, 11, 22, 16, 0)), 'happened');
});

test('a playdate with no time has happened once its day is over, as on web', () => {
  const p = { date: '2026-11-22', time: '' };
  assert.equal(playdatePhase(p, at(2026, 11, 22, 23, 59)), 'upcoming');
  assert.equal(playdatePhase(p, at(2026, 11, 23, 0, 0)), 'happened');
});

test('old free-text dates take their year from when they were sent', () => {
  const sentJuly = at(2026, 7, 5, 9);
  const july = resolvePlaydate({ date: 'Sat, July 12', time: '10:00 AM' }, sentJuly);
  assert.ok(july);
  assert.equal(toIsoDate(july.day), '2026-07-12');
  assert.equal(july.minutes, 10 * 60);
  assert.equal(july.structured, false);

  const sentDecember = at(2026, 12, 28);
  const january = resolvePlaydate({ date: 'Jan 3rd', time: '3:30' }, sentDecember);
  assert.equal(january && toIsoDate(january.day), '2027-01-03');
  assert.equal(january?.minutes, 15 * 60 + 30);

  assert.equal(toIsoDate(resolvePlaydate({ date: '12 Aug', time: '' }, sentJuly)!.day), '2026-08-12');
  assert.equal(toIsoDate(resolvePlaydate({ date: '7/19', time: 'noon' }, sentJuly)!.day), '2026-07-19');
  assert.equal(toIsoDate(resolvePlaydate({ date: 'tomorrow', time: '' }, sentJuly)!.day), '2026-07-06');
});

test('unreadable free-text dates are unknown, never upcoming or past', () => {
  assert.equal(resolvePlaydate({ date: 'this weekend', time: '' }, at(2026, 7, 5)), null);
  assert.equal(playdatePhase({ date: 'this weekend', time: '' }, Date.now(), at(2026, 7, 5)), 'unknown');
  assert.equal(playdateStartMs({ date: 'July 12', time: '' }), null); // no year and no sent time
});

test('old free-text playdates in the past count as happened', () => {
  const sent = at(2026, 7, 5);
  assert.equal(playdatePhase({ date: 'Sat, July 12', time: '10am' }, at(2026, 11, 17), sent), 'happened');
  assert.equal(playdatePhase({ date: 'Sat, July 12', time: '10am' }, at(2026, 7, 8), sent), 'upcoming');
});

test('message timestamps get more context the older they are', () => {
  const now = at(2026, 11, 17, 18);
  assert.equal(formatMessageTime(at(2026, 11, 17, 15, 42), now), '3:42 PM');
  assert.equal(formatMessageTime(at(2026, 11, 16, 9, 5), now), 'Yesterday 9:05 AM');
  assert.equal(formatMessageTime(at(2026, 11, 13, 12, 0), now), 'Fri 12:00 PM');
  assert.equal(formatMessageTime(at(2026, 11, 2, 8, 0), now), 'Nov 2, 8:00 AM');
  assert.equal(formatMessageTime(at(2025, 11, 2, 8, 0), now), 'Nov 2, 2025');
});
