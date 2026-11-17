// web/lib/progressSync.ts
// Syncs the on-device progress (boops, invite keys, Adventure Passport, Barkle,
// Human Review cadence) with users/{uid}/private/progress, so the website and
// the iPhone app show the same thing. The merge rules and the sync loop live
// in shared/progress.ts; this file supplies localStorage and the Firestore
// transaction, and holds the Barkle / Human Review / passport storage helpers
// those screens use.
//
// localStorage stays the instant source for every screen. Firebase is loaded
// lazily, so the public /barkle page only pulls it in for someone who has
// signed in on this browser before. Every failure is quiet: the features work
// exactly as before when offline or signed out.

import {
  addBarkleRecord,
  adventuresFromLocal,
  adventuresToLocal,
  applyCompletedChange,
  barkleRecord,
  completedFromLedger,
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

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJSON(key: string): unknown {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — the screens keep their in-memory state */
  }
}

// localStorage is synchronous, so read-modify-write here is atomic within the tab.
const store: ProgressStore = {
  read: readJSON,
  update(key, fn) {
    const next = fn(readJSON(key));
    if (next !== undefined) writeJSON(key, next);
  },
};

async function syncRemote(uid: string, local: ProgressDoc): Promise<ProgressDoc> {
  const [{ getFirebase }, firestore] = await Promise.all([
    import('../shared/utils/firebase'),
    import('firebase/firestore'),
  ]);
  const { auth, db } = getFirebase();
  if (!db || auth?.currentUser?.uid !== uid) throw new Error('progress sync: not signed in as this user');
  const ref = firestore.doc(db, 'users', uid, 'private', 'progress');
  return firestore.runTransaction(db, async (tx) => {
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
    if (process.env.NODE_ENV !== 'production') console.warn('[progress] sync skipped', error);
  },
});

let windowHooked = false;
function hookWindow() {
  if (windowHooked || typeof window === 'undefined') return;
  windowHooked = true;
  // Coming back to the tab picks up what was done on the phone meanwhile.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void engine.refreshIfStale(STALE_AFTER_MS);
  });
  window.addEventListener('online', () => void engine.refreshIfStale(0));
}

function readLastUid(): string | null {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(progressKeys.lastUid);
  } catch {
    return null;
  }
}

// ── Session wiring ───────────────────────────────────────────────────────────

/** Sign-in or page load with a user: pull, merge and push this uid's progress. */
export function startProgressSync(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  hookWindow();
  try {
    window.localStorage.setItem(progressKeys.lastUid, uid);
  } catch {
    /* only a hint for /barkle */
  }
  engine.start(uid);
}

/** Sign-out. Local progress stays under its uid's keys for that person's return. */
export function stopProgressSync(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(progressKeys.lastUid);
  } catch {
    /* ignore */
  }
  engine.stop();
}

/** A feature saved locally for `uid`; pushed after a ~2s quiet period. */
export function markProgressDirty(uid: string): void {
  engine.markDirty(uid);
}

/**
 * Called when the signed-in uid changes and after a sync brought in progress
 * from another device, so open screens can re-read local storage.
 */
export function onProgressChange(listener: ProgressListener): () => void {
  return engine.subscribe(listener);
}

export function syncProgressNow(): Promise<void> {
  return engine.syncNow();
}

let authWatched = false;
/**
 * For pages outside /app (the public Barkle page), which have no
 * AppLayoutShell to start the sync. Only loads Firebase for someone who has
 * signed in on this browser before; everyone else never downloads it.
 */
export function ensureProgressSyncFromAuth(): void {
  if (authWatched || typeof window === 'undefined' || engine.activeUid() || !readLastUid()) return;
  authWatched = true;
  void (async () => {
    try {
      const [{ getFirebase }, { onAuthStateChanged }] = await Promise.all([
        import('../shared/utils/firebase'),
        import('firebase/auth'),
      ]);
      const { auth } = getFirebase();
      if (!auth) return;
      onAuthStateChanged(auth, (user) => {
        if (user) startProgressSync(user.uid);
        else stopProgressSync();
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[progress] auth unavailable', error);
    }
  })();
}

// ── Barkle ───────────────────────────────────────────────────────────────────

/**
 * Today's guesses to show. Signed in: the account's game (merged with this
 * browser's signed-out game, which the account then adopts). Signed out: this
 * browser's game. Before auth has answered, the last signed-in uid is assumed.
 */
export function loadBarkleGuesses(puzzleNumber: number, answer: string): string[] {
  const active = engine.activeUid();
  const uid = active ?? readLastUid();
  const device = parseBarkleDevice(readJSON(progressKeys.barkleDevice));
  const history = uid ? normalizeBarkle(readJSON(progressKeys.barkleHistory(uid))) : undefined;
  const { guesses, adopt } = resolveBarkleLoad({ history, device, puzzleNumber, answer, uid });
  if (active && uid === active && adopt) {
    store.update(progressKeys.barkleHistory(active), (raw) =>
      addBarkleRecord(normalizeBarkle(raw), puzzleNumber, adopt),
    );
    store.update(progressKeys.barkleDevice, (raw) => {
      const save = parseBarkleDevice(raw);
      return save && save.puzzleNumber === puzzleNumber && !save.adoptedBy ? { ...save, adoptedBy: active } : undefined;
    });
    markProgressDirty(active);
  }
  return guesses;
}

/** Saves the day's guesses: to the account when signed in, else to this browser. */
export function saveBarkleGuesses(puzzleNumber: number, guessNames: string[], solved: boolean): void {
  const uid = engine.activeUid();
  if (uid) {
    const record = barkleRecord(guessNames, solved);
    if (!record) return;
    store.update(progressKeys.barkleHistory(uid), (raw) => addBarkleRecord(normalizeBarkle(raw), puzzleNumber, record));
    markProgressDirty(uid);
    return;
  }
  writeJSON(progressKeys.barkleDevice, { puzzleNumber, guessNames });
}

// ── Human Review cadence ─────────────────────────────────────────────────────

export interface CachedHumanReview {
  review: HumanReviewContent;
  dateLabel: string;
  generatedAtMs: number;
}

/** The last review and when it was written, or null. */
export function loadHumanReview(uid: string): { review: HumanReviewContent; generatedAtMs: number } | null {
  if (!uid) return null;
  const raw = readJSON(progressKeys.humanReview(uid)) as Partial<CachedHumanReview> | null;
  if (!raw?.review || typeof raw.generatedAtMs !== 'number') return null;
  return { review: raw.review, generatedAtMs: raw.generatedAtMs };
}

/** Caches a fresh review (never over a newer one) and syncs the 90-day wait. */
export function saveHumanReview(uid: string, value: CachedHumanReview): void {
  if (!uid) return;
  store.update(progressKeys.humanReview(uid), (raw) => {
    const current = normalizeHumanReview(raw);
    return current && current.generatedAtMs > value.generatedAtMs ? undefined : value;
  });
  markProgressDirty(uid);
}

// ── Adventure Passport ───────────────────────────────────────────────────────

/** questId → stampedAt for this dog. */
export function loadAdventures(dogId: string): Record<string, number> {
  if (!dogId) return {};
  return completedFromLedger(adventuresFromLocal(readJSON(progressKeys.adventures(dogId))));
}

/** Stamp or unstamp one quest. Idempotent; leaves every other quest alone. */
export function setAdventureDone(dogId: string, questId: string, done: boolean): void {
  if (!dogId) return;
  const now = Date.now();
  store.update(progressKeys.adventures(dogId), (raw) => {
    const ledger = adventuresFromLocal(raw);
    const before = completedFromLedger(ledger);
    const after = { ...before };
    if (done) after[questId] = after[questId] || now;
    else delete after[questId];
    const next = applyCompletedChange(ledger, before, after, now);
    return next ? adventuresToLocal(next) : undefined;
  });
  markProgressDirty(dogId);
}
