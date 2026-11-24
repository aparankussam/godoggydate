import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_READ_ONLY_AFTER_MS,
  canPostPhoto,
  canPostText,
  chatClosesAtMs,
  chatPhase,
  classPhotoUids,
  headsUpPostAtMs,
  visibleChatMessages,
  whoPlayedCandidates,
} from './packDayChat.ts';

const HOUR = 3_600_000;
const event = { startsAtMs: 1_000 * HOUR, durationMinutes: 60 };

test('chat phases follow the event and go read-only 48h after it ends', () => {
  assert.equal(chatPhase(event, event.startsAtMs - 1), 'before');
  assert.equal(chatPhase(event, event.startsAtMs), 'live');
  assert.equal(chatPhase(event, event.startsAtMs + HOUR), 'after');
  assert.equal(chatClosesAtMs(event), event.startsAtMs + HOUR + CHAT_READ_ONLY_AFTER_MS);
  assert.equal(chatPhase(event, chatClosesAtMs(event) - 1), 'after');
  assert.equal(chatPhase(event, chatClosesAtMs(event)), 'readonly');
  assert.equal(chatPhase({ ...event, status: 'cancelled' }, event.startsAtMs - HOUR), 'readonly');
});

test('text is open until read-only; photos only once the event has started', () => {
  assert.equal(canPostText('before'), true);
  assert.equal(canPostText('readonly'), false);
  assert.equal(canPostPhoto('before'), false);
  assert.equal(canPostPhoto('live'), true);
  assert.equal(canPostPhoto('after'), true);
  assert.equal(canPostPhoto('readonly'), false);
});

test('morning-of heads-up: 7:00 AM host time, or an hour before an early start', () => {
  // Host in UTC-5: 9:00 AM local is 14:00 UTC.
  const nineAm = Date.UTC(2026, 10, 21, 14, 0);
  assert.equal(headsUpPostAtMs(nineAm, '2026-11-21', '09:00'), Date.UTC(2026, 10, 21, 12, 0));
  // 7:30 AM start: an hour before beats 7:00 AM only if earlier; 6:30 < 7:00 so 6:30.
  const sevenThirty = Date.UTC(2026, 10, 21, 12, 30);
  assert.equal(headsUpPostAtMs(sevenThirty, '2026-11-21', '07:30'), Date.UTC(2026, 10, 21, 11, 30));
  assert.equal(headsUpPostAtMs(nineAm, 'nope', '09:00'), null);
});

test('blocked people are hidden, system posts stay', () => {
  const msgs = [{ fromUserId: 'a' }, { fromUserId: 'b' }, { fromUserId: 'system' }];
  assert.deepEqual(visibleChatMessages(msgs, new Set(['b'])).map((m) => m.fromUserId), ['a', 'system']);
});

test('who-played lists the other dogs, minus blocked', () => {
  assert.deepEqual(whoPlayedCandidates(['me', 'a', 'b', 'c'], 'me', new Set(['b'])), ['a', 'c']);
});

test('class photo uses check-ins, falls back to RSVPs, never shows someone no longer going', () => {
  assert.deepEqual(classPhotoUids(['a', 'a', 'x'], ['a', 'b']), ['a']);
  assert.deepEqual(classPhotoUids([], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(classPhotoUids(['x'], ['a', 'b']), ['a', 'b']);
});
