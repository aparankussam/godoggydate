'use client';
// web/lib/petTwin.ts
// Client access to Pet Twin: trigger generation (server enforces cadence + Pro)
// and subscribe to the dog's moments. Moments are written server-side only, so
// the client never writes here — it reads the realtime stream and calls the
// route to ask for a new card.

import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

export interface PetTwinMoment {
  id: string;
  thought: string;
  mood: string;
  moodEmoji: string;
  sourceKind: string;
  /** The literally-true thing this card reacted to — shown as the source chip. */
  sourceLabel: string;
  createdAt: number;
  model?: string;
  promptVersion?: string;
}

export interface GenerateResult {
  /** null only in the rare "another request is generating right now" case —
   *  the realtime listener resolves the card the moment it lands. */
  moment: PetTwinMoment | null;
  throttled: boolean;
  isPro: boolean;
  nextAllowedMs?: number;
}

async function currentIdToken(): Promise<string> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/** Ask for a new card. The server returns the existing one (throttled) if it's
 *  too soon for this tier, so callers can treat both the same way. */
export async function generatePetTwin(): Promise<GenerateResult> {
  const idToken = await currentIdToken();
  const res = await fetch('/api/ai/pet-twin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not get today\'s card. Try again.');
  }
  // A 200 with moment:null means another request is mid-generation — not an
  // error; the caller keeps whatever the listener shows and it self-heals.
  return data as GenerateResult;
}

/** Realtime listener for the most recent moment (today's card). */
export function onLatestMoment(
  dogId: string,
  callback: (moment: PetTwinMoment | null) => void,
): () => void {
  const { db } = getFirebase();
  const q = query(
    collection(db, 'dogs', dogId, 'moments'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const doc = snap.docs[0];
      callback(doc ? ({ id: doc.id, ...doc.data() } as PetTwinMoment) : null);
    },
    () => callback(null),
  );
}

/** Realtime listener for the moment history (the compounding memory seed). */
export function onMomentHistory(
  dogId: string,
  callback: (moments: PetTwinMoment[]) => void,
  max = 30,
): () => void {
  const { db } = getFirebase();
  const q = query(
    collection(db, 'dogs', dogId, 'moments'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PetTwinMoment))),
    () => callback([]),
  );
}
