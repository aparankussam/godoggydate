import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARKLE_HISTORY_LIMIT,
  addDiscovery,
  discoveredOrder,
  markSeen,
  mergeDogtypes,
  normalizeDogtypes,
  setOwnType,
  addBarkleRecord,
  adventuresFromLocal,
  applyBoopWrite,
  applyCompletedChange,
  completedFromLedger,
  createProgressSync,
  mergeIntoLocalProgress,
  mergeProgress,
  normalizeProgress,
  parseBarkleDevice,
  progressEquals,
  progressKeys,
  progressRemoteWrite,
  readLocalProgress,
  resolveBarkleLoad,
  stableStringify,
  type ProgressDoc,
  type ProgressStore,
  type ProgressSyncAdapter,
} from './progress.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T>(r: () => number, items: T[]): T {
  return items[Math.floor(r() * items.length)];
}

function subset<T>(r: () => number, items: T[]): T[] {
  return items.filter(() => r() < 0.5);
}

const BREEDS = ['Beagle', 'Poodle', 'Pug', 'Boxer', 'Corgi', 'Collie', 'Akita'];

function randomDoc(r: () => number): ProgressDoc {
  const raw: Record<string, unknown> = {};
  if (r() < 0.8) {
    const allTime = 1 + Math.floor(r() * 300);
    raw.boops = {
      allTime,
      todayDate: pick(r, ['', '2026-11-15', '2026-11-16', '2026-11-17']),
      todayCount: Math.floor(r() * allTime),
    };
  }
  if (r() < 0.8) raw.unlocks = subset(r, ['EROB', 'ZROM', 'EQOB', 'ZQIM', 'ERIB']);
  if (r() < 0.8) {
    const adventures: Record<string, unknown> = {};
    for (const id of subset(r, ['park-bestie', 'pup-cup', 'sunset', 'costume'])) {
      adventures[id] = { n: 1 + Math.floor(r() * 4), at: pick(r, [100, 200, 300]) };
    }
    raw.adventures = adventures;
  }
  if (r() < 0.8) {
    const barkle: Record<string, unknown> = {};
    for (const key of subset(r, ['10', '11', '12'])) {
      const len = 1 + Math.floor(r() * 6);
      barkle[key] = { guesses: Array.from({ length: len }, () => pick(r, BREEDS)), solved: r() < 0.5 };
    }
    raw.barkle = barkle;
  }
  if (r() < 0.6) {
    raw.humanReview = {
      generatedAtMs: pick(r, [1000, 2000]),
      review: {
        stars: pick(r, [4, 4.5, 5]),
        headline: pick(r, ['Good human', 'Great human']),
        pros: ['Walks'],
        improvements: ['Leaves sometimes'],
        verdict: 'Would adopt again.',
        dogName: 'Kaju',
      },
    };
  }
  return normalizeProgress(raw);
}

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  let writes = 0;
  const read = (key: string): unknown => (data.has(key) ? JSON.parse(data.get(key) as string) : null);
  const store: ProgressStore & { writes: () => number; get: (key: string) => unknown; set: (key: string, v: unknown) => void } = {
    read,
    update(key, fn) {
      const next = fn(read(key));
      if (next !== undefined) {
        data.set(key, JSON.stringify(next));
        writes += 1;
      }
    },
    writes: () => writes,
    get: read,
    set: (key, v) => data.set(key, JSON.stringify(v)),
  };
  return store;
}

function fakeRemote(initial: unknown = null) {
  let doc: Record<string, unknown> | null = (initial as Record<string, unknown>) ?? null;
  let calls = 0;
  let remoteWrites = 0;
  let fail = false;
  let delayMs = 0;
  return {
    get doc() {
      return doc;
    },
    get calls() {
      return calls;
    },
    get writes() {
      return remoteWrites;
    },
    setFail(v: boolean) {
      fail = v;
    },
    setDelay(ms: number) {
      delayMs = ms;
    },
    async syncRemote(_uid: string, local: ProgressDoc): Promise<ProgressDoc> {
      calls += 1;
      if (delayMs) await sleep(delayMs);
      if (fail) throw new Error('offline');
      const remote = normalizeProgress(doc);
      const merged = mergeProgress(local, remote);
      const write = progressRemoteWrite(merged, remote, doc !== null);
      if (write) {
        doc = { ...(doc ?? {}), ...write.data };
        remoteWrites += 1;
      }
      return merged;
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Merge laws ───────────────────────────────────────────────────────────────

test('merge is commutative, associative and idempotent', () => {
  const r = rng(42);
  for (let i = 0; i < 400; i++) {
    const a = randomDoc(r);
    const b = randomDoc(r);
    const c = randomDoc(r);
    assert.ok(progressEquals(mergeProgress(a, b), mergeProgress(b, a)), 'commutative');
    assert.ok(
      progressEquals(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c))),
      'associative',
    );
    assert.ok(progressEquals(mergeProgress(a, a), a), 'idempotent');
    assert.ok(progressEquals(mergeProgress(mergeProgress(a, b), b), mergeProgress(a, b)), 'absorbs');
    const merged = mergeProgress(a, b);
    assert.ok(progressEquals(normalizeProgress(merged), merged), 'merge output is already normalized');
  }
});

test('boops keep the highest count, and today comes from the later day', () => {
  const a = normalizeProgress({ boops: { allTime: 120, todayDate: '2026-11-17', todayCount: 4 } });
  const b = normalizeProgress({ boops: { allTime: 150, todayDate: '2026-11-16', todayCount: 40 } });
  assert.deepEqual(mergeProgress(a, b).boops, { allTime: 150, todayDate: '2026-11-17', todayCount: 4 });
  const c = normalizeProgress({ boops: { allTime: 90, todayDate: '2026-11-17', todayCount: 9 } });
  assert.deepEqual(mergeProgress(a, c).boops, { allTime: 120, todayDate: '2026-11-17', todayCount: 9 });
});

test('unlock keys are a union', () => {
  const a = normalizeProgress({ unlocks: ['ZROM', 'EROB'] });
  const b = normalizeProgress({ unlocks: ['EROB', 'ZQIM', 'ZQIM'] });
  assert.deepEqual(mergeProgress(a, b).unlocks, ['EROB', 'ZQIM', 'ZROM']);
});

test('an adventure stamped on two devices keeps the earliest stamp', () => {
  const phone = normalizeProgress({ adventures: { sunset: { n: 1, at: 500 } } });
  const web = normalizeProgress({ adventures: { sunset: { n: 1, at: 300 } } });
  assert.deepEqual(completedFromLedger(mergeProgress(phone, web).adventures), { sunset: 300 });
});

test('unstamping on one device wins over the earlier stamp, and a re-stamp wins again', () => {
  const stamped = normalizeProgress({ adventures: { sunset: { n: 1, at: 300 } } });
  const unstamped = normalizeProgress({ adventures: { sunset: { n: 2, at: 400 } } });
  assert.deepEqual(completedFromLedger(mergeProgress(stamped, unstamped).adventures), {});
  const restamped = normalizeProgress({ adventures: { sunset: { n: 3, at: 900 } } });
  assert.deepEqual(completedFromLedger(mergeProgress(unstamped, restamped).adventures), { sunset: 900 });
});

test('a screen holding a stale passport cannot undo a stamp that arrived by sync', () => {
  // The ledger already has "sunset" from the other device; the screen never saw it.
  const ledger = normalizeProgress({ adventures: { sunset: { n: 1, at: 300 } } }).adventures;
  const before = {};
  const after = { 'pup-cup': 1000 };
  const next = applyCompletedChange(ledger, before, after, 2000);
  assert.deepEqual(completedFromLedger(next), { sunset: 300, 'pup-cup': 1000 });
  // Saving the same change twice (React strict mode) changes nothing more.
  assert.deepEqual(applyCompletedChange(next, before, after, 3000), next);
  // Unstamping counts as a toggle.
  const undone = applyCompletedChange(next, after, {}, 4000);
  assert.deepEqual(completedFromLedger(undone), { sunset: 300 });
  assert.deepEqual(undone?.['pup-cup'], { n: 2, at: 4000 });
});

test('a passport saved before sync existed reads as single stamps', () => {
  const ledger = adventuresFromLocal({ sunset: 300, 'pup-cup': 500, junk: 'x', 'bad id!': 4 });
  assert.deepEqual(ledger, { 'pup-cup': { n: 1, at: 500 }, sunset: { n: 1, at: 300 } });
  assert.deepEqual(adventuresFromLocal({ v: 2, marks: ledger }), ledger);
});

// ── Barkle ───────────────────────────────────────────────────────────────────

test('barkle keeps the solved, then the best, result per puzzle', () => {
  const merge = (x: unknown, y: unknown) =>
    mergeProgress(normalizeProgress({ barkle: { 7: x } }), normalizeProgress({ barkle: { 7: y } })).barkle?.['7'];
  const lost = { guesses: ['Pug', 'Boxer', 'Corgi', 'Collie', 'Akita', 'Poodle'], solved: false };
  const inProgress = { guesses: ['Pug', 'Boxer'], solved: false };
  const solvedIn3 = { guesses: ['Pug', 'Boxer', 'Beagle'], solved: true };
  const solvedIn2 = { guesses: ['Pug', 'Beagle'], solved: true };
  assert.deepEqual(merge(lost, solvedIn3), solvedIn3);
  assert.deepEqual(merge(solvedIn3, solvedIn2), solvedIn2);
  assert.deepEqual(merge(inProgress, lost), lost);
  assert.deepEqual(merge(inProgress, { guesses: ['Pug'], solved: false }), inProgress);
});

test('barkle history is capped at the newest 365 puzzles', () => {
  let history = undefined;
  for (let n = 1; n <= 400; n++) history = addBarkleRecord(history, n, { guesses: ['Pug'], solved: false });
  const keys = Object.keys(history ?? {}).map(Number).sort((a, b) => a - b);
  assert.equal(keys.length, BARKLE_HISTORY_LIMIT);
  assert.equal(keys[0], 400 - BARKLE_HISTORY_LIMIT + 1);
  assert.equal(keys[keys.length - 1], 400);
  // Merging with an older device's long history still respects the cap.
  const old = normalizeProgress({ barkle: { 3: { guesses: ['Pug'], solved: true } } });
  const merged = mergeProgress({ barkle: history }, old);
  assert.equal(Object.keys(merged.barkle ?? {}).length, BARKLE_HISTORY_LIMIT);
  assert.equal(merged.barkle?.['3'], undefined);
});

test('barkle: a signed-out game is adopted once, and never by a second account', () => {
  const device = parseBarkleDevice({ puzzleNumber: 9, guessNames: ['Pug', 'Beagle'] });
  const signedOut = resolveBarkleLoad({ history: undefined, device, puzzleNumber: 9, answer: 'Beagle', uid: null });
  assert.deepEqual(signedOut, { guesses: ['Pug', 'Beagle'], adopt: null });

  const first = resolveBarkleLoad({ history: undefined, device, puzzleNumber: 9, answer: 'Beagle', uid: 'alice' });
  assert.deepEqual(first.guesses, ['Pug', 'Beagle']);
  assert.deepEqual(first.adopt, { guesses: ['Pug', 'Beagle'], solved: true });

  const adopted = parseBarkleDevice({ puzzleNumber: 9, guessNames: ['Pug', 'Beagle'], adoptedBy: 'alice' });
  const bob = resolveBarkleLoad({ history: undefined, device: adopted, puzzleNumber: 9, answer: 'Beagle', uid: 'bob' });
  assert.deepEqual(bob, { guesses: [], adopt: null });

  // Yesterday's device game is ignored.
  const stale = resolveBarkleLoad({ history: undefined, device, puzzleNumber: 10, answer: 'Pug', uid: 'alice' });
  assert.deepEqual(stale, { guesses: [], adopt: null });
});

// ── Human Review, validation, writes ─────────────────────────────────────────

test('the latest human review wins', () => {
  const review = (headline: string) => ({
    stars: 4.5,
    headline,
    pros: ['Snacks'],
    improvements: ['Vacuum'],
    verdict: 'Fine.',
    dogName: 'Kaju',
  });
  const older = normalizeProgress({ humanReview: { generatedAtMs: 1000, review: review('Old') } });
  const newer = normalizeProgress({ humanReview: { generatedAtMs: 5000, review: review('New') } });
  assert.equal(mergeProgress(older, newer).humanReview?.review.headline, 'New');
  assert.equal(mergeProgress(newer, older).humanReview?.generatedAtMs, 5000);
});

test('junk from storage or Firestore is dropped, and text is bounded', () => {
  const doc = normalizeProgress({
    boops: { allTime: -4 },
    unlocks: 'EROB',
    adventures: { 'ok-id': { n: 0, at: 5 }, other: { n: 1, at: 'x' } },
    barkle: { abc: { guesses: ['Pug'] }, 4: { guesses: [] } },
    humanReview: { generatedAtMs: 10, review: { stars: 4 } },
  });
  assert.deepEqual(doc, {});

  const long = normalizeProgress({ barkle: { 1: { guesses: ['x'.repeat(500), 'a', 'b', 'c', 'd', 'e', 'f', 'g'], solved: false } } });
  const rec = long.barkle?.['1'];
  assert.equal(rec?.guesses.length, 6);
  assert.equal(rec?.guesses[0].length, 60);
  assert.deepEqual(normalizeProgress(null), {});
});

test('boop saves add the screen’s own taps on top of a synced count', () => {
  const day = '2026-11-17';
  // Screen loaded 100, sync raised storage to 150, screen tapped 3 times.
  const synced = { allTime: 150, todayDate: day, todayCount: 20 };
  const written = { allTime: 103, todayDate: day, todayCount: 8 };
  assert.deepEqual(applyBoopWrite(synced, written, 100), { allTime: 153, todayDate: day, todayCount: 23 });
  // Saving the same state again adds nothing.
  assert.deepEqual(applyBoopWrite({ allTime: 153, todayDate: day, todayCount: 23 }, written, 103), {
    allTime: 153,
    todayDate: day,
    todayCount: 23,
  });
  // A screen that loaded after the sync can't take the count down.
  assert.equal(applyBoopWrite(synced, { allTime: 101, todayDate: day, todayCount: 1 }, 150).allTime, 150);
  // No known base: never lower than either side.
  assert.equal(applyBoopWrite({ allTime: 50, todayDate: day, todayCount: 1 }, written, undefined).allTime, 103);
  // A new day on the screen resets today's count.
  assert.deepEqual(applyBoopWrite(synced, { allTime: 151, todayDate: '2026-11-18', todayCount: 1 }, 150), {
    allTime: 151,
    todayDate: '2026-11-18',
    todayCount: 1,
  });
});

test('remote writes are skipped when nothing would change', () => {
  const doc = normalizeProgress({ unlocks: ['EROB'] });
  assert.equal(progressRemoteWrite(doc, doc, true), null);
  assert.equal(progressRemoteWrite({}, {}, false), null);
  const write = progressRemoteWrite(doc, {}, false);
  assert.deepEqual(write, { data: { v: 1, unlocks: ['EROB'] }, mergeFields: ['v', 'unlocks'] });
});

test('merging into local keeps boop energy and only writes what changed', async () => {
  const uid = 'u1';
  const store = memoryStore({
    [progressKeys.boops(uid)]: { allTime: 10, todayDate: '2026-11-17', todayCount: 3, energy: 12, energyAtMs: 77 },
    [progressKeys.unlocks(uid)]: { invitedCodes: ['EROB'] },
  });
  const incoming = normalizeProgress({ boops: { allTime: 40, todayDate: '2026-11-16', todayCount: 30 }, unlocks: ['EROB'] });
  const { doc, changed } = await mergeIntoLocalProgress(store, uid, incoming);
  assert.equal(changed, true);
  assert.equal(store.writes(), 1, 'unlocks were already up to date');
  assert.deepEqual(store.get(progressKeys.boops(uid)), {
    allTime: 40,
    todayDate: '2026-11-17',
    todayCount: 3,
    energy: 12,
    energyAtMs: 77,
  });
  assert.ok(progressEquals(doc, await readLocalProgress(store, uid)));
  const again = await mergeIntoLocalProgress(store, uid, incoming);
  assert.equal(again.changed, false);
  assert.equal(store.writes(), 1);
});

// ── Sync engine ──────────────────────────────────────────────────────────────

function engineFor(store: ReturnType<typeof memoryStore>, remote: ReturnType<typeof fakeRemote>) {
  const errors: unknown[] = [];
  const adapter: ProgressSyncAdapter = {
    read: store.read,
    update: store.update,
    syncRemote: (uid, local) => remote.syncRemote(uid, local),
    onError: (e) => errors.push(e),
  };
  const sync = createProgressSync(adapter, { debounceMs: 10, maxWaitMs: 50 });
  return { sync, errors };
}

test('sign-in pulls the other device’s progress, pushes ours, and tells the screens', async () => {
  const uid = 'u1';
  const store = memoryStore({ [progressKeys.unlocks(uid)]: { invitedCodes: ['EROB'] } });
  const remote = fakeRemote({ v: 1, boops: { allTime: 77, todayDate: '', todayCount: 0 } });
  const { sync } = engineFor(store, remote);
  const seen: Array<string | null> = [];
  sync.subscribe((u) => seen.push(u));

  sync.start(uid);
  await sync.syncNow();
  assert.deepEqual(seen, [uid, uid], 'once for the sign-in, once because sync changed local');
  assert.equal((store.get(progressKeys.boops(uid)) as { allTime: number }).allTime, 77);
  assert.deepEqual(remote.doc?.unlocks, ['EROB']);
});

test('local changes are debounced into one push, and other accounts are ignored', async () => {
  const uid = 'u1';
  const store = memoryStore();
  const remote = fakeRemote();
  const { sync } = engineFor(store, remote);
  sync.start(uid);
  await sync.syncNow();
  const callsAfterStart = remote.calls;

  for (let i = 1; i <= 5; i++) {
    store.set(progressKeys.boops(uid), { allTime: i, todayDate: '', todayCount: 0 });
    sync.markDirty(uid);
    sync.markDirty('someone-else');
  }
  await sleep(40);
  assert.equal(remote.calls, callsAfterStart + 1);
  assert.deepEqual(normalizeProgress(remote.doc).boops, { allTime: 5, todayDate: '', todayCount: 0 });
});

test('offline or permission errors are swallowed and local progress survives', async () => {
  const uid = 'u1';
  const store = memoryStore({ [progressKeys.unlocks(uid)]: { invitedCodes: ['EROB'] } });
  const remote = fakeRemote();
  remote.setFail(true);
  const { sync, errors } = engineFor(store, remote);
  sync.start(uid);
  await sync.syncNow();
  assert.equal(errors.length, 1);
  assert.deepEqual(store.get(progressKeys.unlocks(uid)), { invitedCodes: ['EROB'] });

  remote.setFail(false);
  await sync.refreshIfStale(0);
  assert.deepEqual(remote.doc?.unlocks, ['EROB']);
});

test('signing out mid-sync never writes the old account’s result', async () => {
  const uid = 'u1';
  const store = memoryStore();
  const remote = fakeRemote({ v: 1, unlocks: ['EROB'] });
  remote.setDelay(20);
  const { sync } = engineFor(store, remote);
  sync.start(uid);
  sync.stop();
  await sleep(40);
  assert.equal(store.get(progressKeys.unlocks(uid)), null);
  assert.equal(sync.activeUid(), null);
});

test('a save made while a sync is on the network is pushed right after', async () => {
  const uid = 'u1';
  const store = memoryStore();
  const remote = fakeRemote();
  remote.setDelay(15);
  const { sync } = engineFor(store, remote);
  sync.start(uid);
  await sleep(5);
  store.set(progressKeys.unlocks(uid), { invitedCodes: ['ZROM'] });
  sync.markDirty(uid);
  await sleep(80);
  assert.deepEqual(remote.doc?.unlocks, ['ZROM']);
  assert.equal(stableStringify(store.get(progressKeys.unlocks(uid))), stableStringify({ invitedCodes: ['ZROM'] }));
});

// ── Dogtype discoveries ──────────────────────────────────────────────────────

test('normalizeDogtypes drops bad codes and bad times, and caps at 16', () => {
  const raw: Record<string, unknown> = { EROB: { at: 5, dogId: 'd1', dogName: 'Biscuit', seen: true }, XXXX: { at: 1 }, ZROM: { at: -3 }, EGOB: { at: 'x' } };
  assert.deepEqual(normalizeDogtypes(raw), { EROB: { at: 5, dogId: 'd1', dogName: 'Biscuit', seen: true } });
  assert.equal(normalizeDogtypes('nope'), undefined);
  assert.equal(normalizeDogtypes({}), undefined);
});

test('mergeDogtypes keeps earliest at and its dog; seen/own are OR-ed', () => {
  const a = { EROB: { at: 10, dogId: null, dogName: null, seen: false, own: true } };
  const b = { EROB: { at: 20, dogId: 'd1', dogName: 'Biscuit', seen: true } };
  assert.deepEqual(mergeDogtypes(a, b)!.EROB, { at: 10, dogId: 'd1', dogName: 'Biscuit', seen: true, own: true });
});

test('mergeDogtypes is commutative, associative and idempotent', () => {
  const x = { EROB: { at: 3, dogId: 'a', dogName: 'A', seen: false } };
  const y = { EROB: { at: 1, dogId: 'b', dogName: 'B', seen: true }, EGOB: { at: 9, dogId: 'c', dogName: 'C', seen: false } };
  const z = { ZROM: { at: 2, dogId: null, dogName: null, seen: false, own: true } };
  const m = mergeDogtypes;
  assert.deepEqual(m(x, y), m(y, x));
  assert.deepEqual(m(m(x, y), z), m(x, m(y, z)));
  assert.deepEqual(m(x, x), m(x));
});

test('discoveredOrder puts the current own type first, then met types by time; old own types hide', () => {
  let l = addDiscovery(undefined, 'EGOB', { at: 50, dogId: 'd1', dogName: 'Biscuit' });
  l = setOwnType(l, 'EROB', 10);
  l = setOwnType(l, 'ZROM', 20);
  assert.deepEqual(discoveredOrder(l, 'ZROM'), ['ZROM', 'EGOB']);
  l = addDiscovery(l, 'EROB', { at: 60, dogId: 'd2', dogName: 'Rex' });
  assert.deepEqual(discoveredOrder(l, 'ZROM'), ['ZROM', 'EROB', 'EGOB']);
});

test('markSeen flips seen, and merge/normalize carry dogtypes through the doc', () => {
  const l = markSeen(addDiscovery(undefined, 'EGOB', { at: 1, dogId: 'd', dogName: 'B', seen: false }), 'EGOB');
  assert.equal(l.EGOB.seen, true);
  const doc = normalizeProgress({ dogtypes: l });
  assert.deepEqual(mergeProgress(doc, {}).dogtypes, l);
});

test('discoveredOrder always counts and lists the own type first, even before it is stored', () => {
  const l = addDiscovery(undefined, 'EGOB', { at: 5, dogId: 'd1', dogName: 'Biscuit' });
  assert.deepEqual(discoveredOrder(l, 'EROB'), ['EROB', 'EGOB']);
  assert.deepEqual(discoveredOrder(undefined, 'EROB'), ['EROB']);
});

test('mergeDogtypes tie-breaks on dogName so it is order independent', () => {
  const a = { EGOB: { at: 1, dogId: 'd', dogName: 'Alpha', seen: false } };
  const b = { EGOB: { at: 1, dogId: 'd', dogName: 'Beta', seen: false } };
  assert.deepEqual(mergeDogtypes(a, b), mergeDogtypes(b, a));
});
