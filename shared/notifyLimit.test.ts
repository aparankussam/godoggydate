// shared/notifyLimit.test.ts — the 2-a-day cap, with an in-memory stand-in for Firestore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimPushSlot, makeLimitedPush, pushDayKey, DAILY_PUSH_CAP } from '../firebase/functions/src/notifyLimit.ts';

function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    doc: (path: string) => path,
    runTransaction: async <T>(fn: (tx: any) => Promise<T>) =>
      fn({
        get: async (ref: string) => ({ exists: store.has(ref), data: () => store.get(ref) }),
        set: (ref: string, data: Record<string, unknown>) => void store.set(ref, data),
      }),
  };
}

test('third social push in a day is dropped, exempt kinds never are', async () => {
  const db = fakeDb();
  const now = Date.UTC(2026, 0, 5, 12);
  for (let i = 0; i < DAILY_PUSH_CAP; i++) assert.equal(await claimPushSlot(db, 'u', 'social', now), true);
  assert.equal(await claimPushSlot(db, 'u', 'social', now), false);
  assert.equal(await claimPushSlot(db, 'u', 'urgent', now), true);
  assert.equal(await claimPushSlot(db, 'u', 'reminder', now), true);
  assert.equal(await claimPushSlot(db, 'u', 'direct', now), true);
  assert.equal([...db.store.keys()].length, 1); // exempt pushes don't count
});

test('cap is per user and resets the next UTC day', async () => {
  const db = fakeDb();
  const d1 = Date.UTC(2026, 0, 5, 23, 59);
  await claimPushSlot(db, 'a', 'social', d1);
  await claimPushSlot(db, 'a', 'social', d1);
  assert.equal(await claimPushSlot(db, 'b', 'social', d1), true);
  assert.equal(await claimPushSlot(db, 'a', 'social', d1 + 2 * 60_000), true);
  assert.equal(pushDayKey(d1), '2026-01-05');
});

test('limited sender only sends when a slot was claimed', async () => {
  const db = fakeDb();
  const sent: string[] = [];
  const send = makeLimitedPush(db, async (uid: string, p: string) => void sent.push(`${uid}:${p}`));
  for (const p of ['1', '2', '3']) await send('u', p, 'social');
  assert.deepEqual(sent, ['u:1', 'u:2']);
});
