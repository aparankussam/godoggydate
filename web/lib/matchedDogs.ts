// web/lib/matchedDogs.ts
// The dogs you are matched with right now (blocked ones left out), each with the
// match id so a row can link to the dog's page. Used by the Dogtype sheet to list
// "your matches of this type". Never throws; a failed read gives an empty list.

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { getBlockedUserIds } from './blocks';
import { getHeroPhoto, resolveHeroIndex } from './photos';
import type { SavedDogProfile } from './auth';

export interface MatchedDog {
  matchId: string;
  dogId: string;
  name: string;
  breed: string;
  photo: string | null;
  profile: SavedDogProfile | null;
  createdAtMs: number | undefined;
}

export async function fetchMatchedDogs(uid: string): Promise<MatchedDog[]> {
  if (!uid) return [];
  try {
    const { db } = getFirebase();
    const col = collection(db, 'matches');
    const [a, b, blocked] = await Promise.all([
      getDocs(query(col, where('dog1UserId', '==', uid))),
      getDocs(query(col, where('dog2UserId', '==', uid))),
      getBlockedUserIds(uid).catch(() => new Set<string>()),
    ]);
    const rows = new Map<string, { other: string; createdAtMs: number | undefined }>();
    for (const snap of [...a.docs, ...b.docs]) {
      const d = snap.data() as { dog1UserId?: string; dog2UserId?: string; createdAt?: { seconds?: number } | null };
      const other = d.dog1UserId === uid ? d.dog2UserId : d.dog1UserId;
      if (!other || blocked.has(other)) continue;
      rows.set(snap.id, { other, createdAtMs: d.createdAt?.seconds ? d.createdAt.seconds * 1000 : undefined });
    }
    const dogs = await Promise.all(
      [...rows.entries()].map(async ([matchId, { other, createdAtMs }]): Promise<MatchedDog | null> => {
        try {
          const snap = await getDoc(doc(db, 'dogs', other));
          if (!snap.exists()) return null;
          const profile = snap.data() as SavedDogProfile;
          return {
            matchId,
            dogId: other,
            name: profile.name?.trim() || 'A dog',
            breed: profile.breed?.trim() || '',
            photo: getHeroPhoto(profile.photos, resolveHeroIndex(profile)),
            profile,
            createdAtMs,
          };
        } catch {
          return null;
        }
      }),
    );
    return dogs.filter((d): d is MatchedDog => d !== null);
  } catch {
    return [];
  }
}
