// web/lib/blocks.ts
// Client-side blocking. Blocks live at blocks/{userId}/blocked/{targetUserId}
// (owner read/write per firestore.rules). Blocking hides the target from the
// blocker's discover feed, matches list, and inbox. Server-side reciprocal
// hiding (they can't see you either) is a future Cloud Function concern.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

export async function blockUser(currentUserId: string, targetUserId: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'blocks', currentUserId, 'blocked', targetUserId), {
    targetUserId,
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, 'blocks', currentUserId, 'blocked', targetUserId));
}

/** Returns the set of user ids the current user has blocked. */
export async function getBlockedUserIds(currentUserId: string): Promise<Set<string>> {
  const { db } = getFirebase();
  try {
    const snap = await getDocs(collection(db, 'blocks', currentUserId, 'blocked'));
    return new Set(snap.docs.map((d) => d.id));
  } catch {
    // Offline or transient failure — fail open so the feed still renders.
    return new Set();
  }
}
