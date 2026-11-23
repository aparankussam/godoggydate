// web/lib/blocks.ts
// Client-side blocking. Blocks live at blocks/{userId}/blocked/{targetUserId}
// (owner read/write per firestore.rules). firestore.rules stops messages and new
// matches across a block in either direction; the onBlockWrite function mirrors
// each block to blocks/{target}/blockedBy/{blocker} (and removes the mirror again
// when the block is deleted) so both people's feeds hide each other.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { getPrimaryRenderablePhoto } from './photos';

/** Fired on window after a block or unblock, so open lists (Matches, Messages,
 *  Blocked members) can refresh without a reload. */
export const BLOCKS_CHANGED_EVENT = 'gdd:blocks-changed';

function announceBlocksChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BLOCKS_CHANGED_EVENT));
}

export async function blockUser(currentUserId: string, targetUserId: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'blocks', currentUserId, 'blocked', targetUserId), {
    targetUserId,
    createdAt: serverTimestamp(),
  });
  announceBlocksChanged();
}

export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, 'blocks', currentUserId, 'blocked', targetUserId));
  announceBlocksChanged();
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

export interface BlockedMember {
  targetUserId: string;
  /** The dog's name, or null when their profile is gone (they left). */
  dogName: string | null;
  /** The dog's photo, when they have one. */
  dogPhoto: string | null;
  blockedAtMs: number | null;
}

/**
 * Everyone THIS user has blocked, newest first, with the dog's name so the list
 * can say who it is. Only the blocker's own list: the reverse direction
 * (blockedBy) is deliberately never shown to anyone. Throws on a read failure so
 * the list can offer a retry rather than claim nobody is blocked.
 */
export async function listBlockedMembers(currentUserId: string): Promise<BlockedMember[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, 'blocks', currentUserId, 'blocked'));
  const members = await Promise.all(
    snap.docs.map(async (d): Promise<BlockedMember> => {
      const data = d.data() as { createdAt?: { toMillis?: () => number } | null };
      let dogName: string | null = null;
      let dogPhoto: string | null = null;
      try {
        const dog = await getDoc(doc(db, 'dogs', d.id));
        if (dog.exists()) {
          const dogData = dog.data() as { name?: unknown; photos?: unknown };
          if (typeof dogData.name === 'string' && dogData.name.trim()) dogName = dogData.name.trim();
          if (Array.isArray(dogData.photos)) dogPhoto = getPrimaryRenderablePhoto(dogData.photos as string[]);
        }
      } catch { /* offline: show them without a name */ }
      return {
        targetUserId: d.id,
        dogName,
        dogPhoto,
        blockedAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null,
      };
    }),
  );
  return members.sort((a, b) => (b.blockedAtMs ?? 0) - (a.blockedAtMs ?? 0));
}
