// web/lib/aiGuard.ts
// Spend protection shared by every /api/ai route. Per-user limits don't bound
// total cost on their own, since accounts are cheap to create, so this adds a
// project-wide daily ceiling and turns away anonymous sessions. Fails closed: if
// the counter can't be read, no paid model call is made.
//
// Two steps, in this order inside a route:
//   1. guardAiRequest(provider): cheap, no database. Turns away anonymous sessions.
//      Call it right after the ID token is verified.
//   2. claimAiBudget(): bumps the project-wide daily counter. Call it LAST, after
//      the API-key check, body validation, dog lookup and the per-user lock/cap,
//      immediately before the first paid model call. Only calls that really reach
//      the model spend the shared budget, so junk requests from one account (bad
//      body, no dog, missing key, per-user cap) can never use up the day for
//      everyone.
//
// The counter uses a plain atomic increment, not a read-then-write transaction:
// a transaction on one hot document aborts under concurrency (it turned away 38
// of 50 simultaneous calls). The increment is verified with a read right after;
// a call that lands over the limit gives its unit back and is turned away. Calls
// that pass can never add up to more than the limit.

import { NextResponse } from 'next/server';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from './firebaseAdmin';

const DEFAULT_GLOBAL_DAILY_LIMIT = 2000;

export async function guardAiRequest(signInProvider: string | undefined): Promise<NextResponse | null> {
  if (signInProvider === 'anonymous') {
    return NextResponse.json({ error: 'Sign in to use this feature.' }, { status: 403 });
  }
  return null;
}

function restingResponse(): NextResponse {
  return NextResponse.json(
    { error: 'This feature is resting for today. Please try again tomorrow.' },
    { status: 503 },
  );
}

function budgetRef(day: string) {
  return getAdminDb().doc(`aiUsage/${day}`);
}

async function readCount(day: string): Promise<number> {
  const count = (await budgetRef(day).get()).data()?.count;
  return typeof count === 'number' ? count : 0;
}

export async function claimAiBudget(): Promise<NextResponse | null> {
  const limit = Number(process.env.AI_GLOBAL_DAILY_LIMIT) || DEFAULT_GLOBAL_DAILY_LIMIT;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await budgetRef(day).set({ count: FieldValue.increment(1) }, { merge: true });
    if ((await readCount(day)) <= limit) return null;
    // Over the limit: hand the unit back so the counter keeps meaning "calls
    // that were let through" and the day can still reach exactly the limit.
    await budgetRef(day).set({ count: FieldValue.increment(-1) }, { merge: true });
    console.error('[ai-guard] global daily AI limit reached', { day, limit });
  } catch (error) {
    console.error('[ai-guard] counter failed', error);
  }
  return restingResponse();
}

// Give back a per-user slot (anti-burst lock + one unit of the rolling cap) that a
// route reserved but never spent on a model call because the shared daily budget
// said no. Without this, a user who taps while the project is resting would use
// up their own cap for the next day.
export async function refundUserSlot(ref: DocumentReference): Promise<void> {
  try {
    await ref.set({ lastReservedAtMs: 0, count: FieldValue.increment(-1) }, { merge: true });
  } catch {
    /* best effort */
  }
}
