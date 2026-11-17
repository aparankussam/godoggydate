// mobile/lib/progressSync.ts
// Syncs the on-device progress (boops, invite keys, Adventure Passport, Barkle,
// Human Review cadence) with users/{uid}/private/progress, so the iPhone app
// and the website show the same thing. The merge rules and the sync loop live
// in shared/progress.ts; this file supplies AsyncStorage and the Firestore
// transaction, and holds the Barkle / Human Review storage helpers.
//
// AsyncStorage stays the instant source for every screen. Every failure is
// quiet: offline, signed out or a rules error, the features work exactly as
// before. Guests sync to their anonymous uid, which survives linking to Google
// or Apple, so nothing is lost on upgrade.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { doc, runTransaction } from 'firebase/firestore';
import { getFirebase } from './firebase';
import {
  addBarkleRecord,
  barkleRecord,
  createProgressSync,
  mergeProgress,
  normalizeBarkle,
  normalizeHumanReview,
  normalizeProgress,
  parseBarkleDevice,
  progressKeys,
  progressRemoteWrite,
  resolveBarkleLoad,
  type HumanReviewContent,
  type ProgressDoc,
  type ProgressListener,
  type ProgressStore,
} from '../../shared/progress';

const STALE_AFTER_MS = 60 * 1000;

// ── AsyncStorage with per-key ordering ───────────────────────────────────────
// AsyncStorage is async, so two read-modify-writes of one key (a boop save and
// a sync landing) could interleave and drop one. Every access to a key goes
// through that key's queue, so reads also see earlier writes.

const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

/** Parsed JSON at `key`, or null (missing, corrupt or unavailable). */
export function readStoredJSON(key: string): Promise<unknown> {
  return enqueue(key, async () => {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

/**
 * Atomic read-modify-write: stores fn(current), or leaves the key alone when fn
 * returns undefined. Rejects if storage can't be read, so a transient failure
 * never overwrites good data with something built from nothing.
 */
export function updateStoredJSON(key: string, fn: (raw: unknown) => unknown): Promise<void> {
  return enqueue(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    let current: unknown = null;
    try {
      current = raw ? JSON.parse(raw) : null;
    } catch {
      current = null; // corrupt — replace it
    }
    const next = fn(current);
    if (next === undefined) return;
    await AsyncStorage.setItem(key, JSON.stringify(next));
  });
}

const store: ProgressStore = { read: readStoredJSON, update: updateStoredJSON };

async function syncRemote(uid: string, local: ProgressDoc): Promise<ProgressDoc> {
  const { auth, db } = getFirebase();
  if (auth.currentUser?.uid !== uid) throw new Error('progress sync: not signed in as this user');
  const ref = doc(db, 'users', uid, 'private', 'progress');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? normalizeProgress(snap.data()) : {};
    const merged = mergeProgress(local, remote);
    const write = progressRemoteWrite(merged, remote, snap.exists());
    if (write) tx.set(ref, write.data, { mergeFields: write.mergeFields });
    return merged;
  });
}

const engine = createProgressSync({
  ...store,
  syncRemote,
  onError(error) {
    if (__DEV__) console.warn('[progress] sync skipped', error);
  },
});

let appStateHooked = false;
function hookAppState() {
  if (appStateHooked) return;
  appStateHooked = true;
  // Back in the foreground: pick up what was done on the website meanwhile.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void engine.refreshIfStale(STALE_AFTER_MS);
  });
}

// ── Session wiring ───────────────────────────────────────────────────────────

/** Sign-in or app start with a user (guests included): pull, merge, push. */
export function startProgressSync(uid: string): void {
  if (!uid) return;
  hookAppState();
  engine.start(uid);
}

/** Sign-out. Local progress stays under its uid's keys for that person's return. */
export function stopProgressSync(): void {
  engine.stop();
}

/** A feature saved locally for `uid`; pushed after a ~2s quiet period. */
export function markProgressDirty(uid: string): void {
  engine.markDirty(uid);
}

/**
 * Called when the signed-in uid changes and after a sync brought in progress
 * from another device, so open screens can re-read storage.
 */
export function onProgressChange(listener: ProgressListener): () => void {
  return engine.subscribe(listener);
}

export function syncProgressNow(): Promise<void> {
  return engine.syncNow();
}

// ── Barkle ───────────────────────────────────────────────────────────────────

/**
 * Today's guesses to show. Signed in: the account's game (merged with a game
 * played on this phone while signed out, which the account then adopts).
 * Signed out: this phone's game. Never throws.
 */
export async function loadBarkleGuesses(puzzleNumber: number, answer: string): Promise<string[]> {
  try {
    const uid = engine.activeUid();
    const [deviceRaw, historyRaw] = await Promise.all([
      readStoredJSON(progressKeys.barkleDevice),
      uid ? readStoredJSON(progressKeys.barkleHistory(uid)) : Promise.resolve(null),
    ]);
    const device = parseBarkleDevice(deviceRaw);
    const history = normalizeBarkle(historyRaw);
    const { guesses, adopt } = resolveBarkleLoad({ history, device, puzzleNumber, answer, uid });
    if (uid && adopt) {
      await updateStoredJSON(progressKeys.barkleHistory(uid), (raw) =>
        addBarkleRecord(normalizeBarkle(raw), puzzleNumber, adopt),
      );
      await updateStoredJSON(progressKeys.barkleDevice, (raw) => {
        const save = parseBarkleDevice(raw);
        return save && save.puzzleNumber === puzzleNumber && !save.adoptedBy ? { ...save, adoptedBy: uid } : undefined;
      });
      markProgressDirty(uid);
    }
    return guesses;
  } catch {
    return [];
  }
}

/** Saves the day's guesses: to the account when signed in, else to this phone. */
export async function saveBarkleGuesses(puzzleNumber: number, guessNames: string[], solved: boolean): Promise<void> {
  try {
    const uid = engine.activeUid();
    if (uid) {
      const record = barkleRecord(guessNames, solved);
      if (!record) return;
      await updateStoredJSON(progressKeys.barkleHistory(uid), (raw) =>
        addBarkleRecord(normalizeBarkle(raw), puzzleNumber, record),
      );
      markProgressDirty(uid);
      return;
    }
    await updateStoredJSON(progressKeys.barkleDevice, () => ({ puzzleNumber, guessNames }));
  } catch {
    // Storage unavailable — the game still plays for this session.
  }
}

// ── Human Review cadence ─────────────────────────────────────────────────────

export interface CachedHumanReview {
  review: HumanReviewContent;
  dateLabel: string;
  generatedAtMs: number;
}

/** The last review and when it was written, or null. Never throws. */
export async function loadHumanReview(
  uid: string,
): Promise<{ review: HumanReviewContent; generatedAtMs: number } | null> {
  if (!uid) return null;
  const raw = (await readStoredJSON(progressKeys.humanReview(uid))) as Partial<CachedHumanReview> | null;
  if (!raw?.review || typeof raw.generatedAtMs !== 'number') return null;
  return { review: raw.review, generatedAtMs: raw.generatedAtMs };
}

/** Caches a fresh review (never over a newer one) and syncs the 90-day wait. */
export async function saveHumanReview(uid: string, value: CachedHumanReview): Promise<void> {
  if (!uid) return;
  try {
    await updateStoredJSON(progressKeys.humanReview(uid), (raw) => {
      const current = normalizeHumanReview(raw);
      return current && current.generatedAtMs > value.generatedAtMs ? undefined : value;
    });
  } catch {
    /* private mode / quota — cadence just falls back to server caps */
  }
  markProgressDirty(uid);
}
