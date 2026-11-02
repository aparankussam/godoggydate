// web/lib/aiGuard.ts
// Spend protection shared by every /api/ai route. Per-user limits don't bound
// total cost on their own, since accounts are cheap to create, so this adds a
// project-wide daily ceiling and turns away anonymous sessions. Fails closed: if
// the counter can't be read, no paid model call is made.

import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './firebaseAdmin';

const DEFAULT_GLOBAL_DAILY_LIMIT = 2000;

export async function guardAiRequest(signInProvider: string | undefined): Promise<NextResponse | null> {
  if (signInProvider === 'anonymous') {
    return NextResponse.json({ error: 'Sign in to use this feature.' }, { status: 403 });
  }

  const limit = Number(process.env.AI_GLOBAL_DAILY_LIMIT) || DEFAULT_GLOBAL_DAILY_LIMIT;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const db = getAdminDb();
    const ref = db.doc(`aiUsage/${day}`);
    const allowed = await db.runTransaction(async (tx) => {
      const count = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
      if (count >= limit) return false;
      tx.set(ref, { count: FieldValue.increment(1) }, { merge: true });
      return true;
    });
    if (allowed) return null;
    console.error('[ai-guard] global daily AI limit reached', { day, limit });
  } catch (error) {
    console.error('[ai-guard] counter failed', error);
  }
  return NextResponse.json(
    { error: 'This feature is resting for today. Please try again tomorrow.' },
    { status: 503 },
  );
}
