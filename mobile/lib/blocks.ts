// mobile/lib/blocks.ts
// Mirrors web/lib/blocks.ts. Blocks live at blocks/{userId}/blocked/{targetUserId}
// (owner read/write per firestore.rules). Blocking hides the target from the
// blocker's discover feed and matches list.

import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';

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
    return new Set();
  }
}
