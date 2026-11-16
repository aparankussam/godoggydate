// web/lib/blocks.ts
// Client-side blocking. Blocks live at blocks/{userId}/blocked/{targetUserId}
// (owner read/write per firestore.rules). firestore.rules stops messages and new
// matches across a block in either direction; the onBlockWrite function mirrors
// each block to blocks/{target}/blockedBy/{blocker} so both people's feeds hide
// each other.

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

/** Returns everyone hidden from the current user: blocked by them, or blocking them. */
export async function getBlockedUserIds(currentUserId: string): Promise<Set<string>> {
  const { db } = getFirebase();
  try {
    const [blocked, blockedBy] = await Promise.all([
      getDocs(collection(db, 'blocks', currentUserId, 'blocked')),
      getDocs(collection(db, 'blocks', currentUserId, 'blockedBy')),
    ]);
    return new Set([...blocked.docs, ...blockedBy.docs].map((d) => d.id));
  } catch {
    // Offline or transient failure — fail open so the feed still renders.
    return new Set();
  }
}
