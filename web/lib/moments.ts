'use client';
// web/lib/moments.ts
// The Moments Diary reader. Pet Twin cards are written server-side only (see
// web/app/api/ai/pet-twin/route.ts) to dogs/{uid}/moments; this file just
// subscribes to that history as a warm, read-only keepsake stream — a mirror of
// the mobile onMomentHistory listener (mobile/lib/petTwin.ts). Self-contained
// so the diary can stand on its own; PetTwinMoment is duplicated here on
// purpose rather than reaching into petTwin.ts.

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

/**
 * Realtime listener for a dog's Pet Twin moment history, newest first — the
 * feed the Moments Diary renders. Read-only: the client never writes moments.
 * Returns an unsubscribe function; on any error it hands back an empty list so
 * the UI falls to its empty state rather than hanging.
 *
 * @param dogId  the dog document id (the owner's uid)
 * @param callback  receives the moments array on every change
 * @param max  how many recent moments to keep (default 30)
 */
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
