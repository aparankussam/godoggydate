// firebase/functions/src/notifyLimit.ts
// The one door for non-urgent pushes: at most DAILY_PUSH_CAP per user per UTC
// day, counted server side in pushCounters/{uid}_{day} (no client rule, so only
// the Admin SDK can touch it). Exempt kinds never count and are never blocked:
//   'urgent'   lost-dog alerts — go out instantly, always
//   'reminder' Pack Day / playdate / dog reminders and cancellations of
//              something a person already signed up for
//   'direct'   one person messaging another (chat)
// Everything else is 'social' (RSVP pings, digests, celebrations, new matches)
// and is dropped quietly once the cap is reached. No firebase imports at
// runtime, so shared/notifyLimit.test.ts can run this file directly.

export type PushKind = 'urgent' | 'reminder' | 'direct' | 'social';

export const DAILY_PUSH_CAP = 2;
const EXEMPT: ReadonlySet<PushKind> = new Set(['urgent', 'reminder', 'direct']);

/** UTC calendar day, 'YYYY-MM-DD'. */
export function pushDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isExemptPush(kind: PushKind): boolean {
  return EXEMPT.has(kind);
}

interface CounterDb {
  doc(path: string): unknown;
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(ref: unknown, data: Record<string, unknown>): unknown;
  }) => Promise<T>): Promise<T>;
}

/** Claims one of today's pushes for `uid`. True = go ahead and send. */
export async function claimPushSlot(db: CounterDb, uid: string, kind: PushKind, nowMs: number): Promise<boolean> {
  if (isExemptPush(kind)) return true;
  const day = pushDayKey(nowMs);
  const ref = db.doc(`pushCounters/${uid}_${day}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;
    if (count >= DAILY_PUSH_CAP) return false;
    tx.set(ref, { uid, day, count: count + 1 });
    return true;
  });
}

/** Wraps a raw sender so every caller goes through the cap. */
export function makeLimitedPush<P>(
  db: CounterDb,
  send: (uid: string, payload: P) => Promise<void>,
): (uid: string, payload: P, kind: PushKind) => Promise<boolean> {
  return async (uid, payload, kind) => {
    if (!(await claimPushSlot(db, uid, kind, Date.now()))) return false;
    await send(uid, payload);
    return true;
  };
}
