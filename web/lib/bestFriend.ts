// web/lib/bestFriend.ts
// One Best Friend slot per dog — the strategy research's single
// highest-conviction idea: make the friendship itself the primary object
// instead of the match. Owner's own preference, not server-computed, so a
// plain client write is correct here (unlike foundingPackNumber/ai/trustScore).

import { doc, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

export async function setBestFriend(uid: string, matchId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), { bestFriendMatchId: matchId });
}

export async function clearBestFriend(uid: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), { bestFriendMatchId: null });
}
