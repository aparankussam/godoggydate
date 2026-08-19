// mobile/lib/coverPhoto.ts
// The owner's cover-photo pick — which photo leads on the profile hero and the
// swipe deck (instead of always photos[0]). An owner preference, so a plain
// client write to their own dog doc is correct (mirrors bestFriend.ts). The
// focal-crop drag the web version has is deferred on mobile: core RN <Image>
// has no object-position, so the PICK (choosing the right photo) is what ships.

import { doc, updateDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';

interface HeroSource {
  coverPhotoIndex?: number | null;
  ai?: { vibeCheck?: { heroPhotoIndex?: number } | null } | null;
}

/** Which photo index should lead: the owner's cover pick, else the AI hero,
 *  else undefined (caller falls back to 0). Mirrors web/lib/photos resolveHeroIndex. */
export function resolveHeroIndex(src: HeroSource | null | undefined): number | undefined {
  const cover = src?.coverPhotoIndex;
  if (typeof cover === 'number' && cover >= 0) return cover;
  const hero = src?.ai?.vibeCheck?.heroPhotoIndex;
  if (typeof hero === 'number' && hero >= 0) return hero;
  return undefined;
}

/** Persist the owner's cover-photo choice (index into the real photos array). */
export async function setCoverPhoto(uid: string, coverPhotoIndex: number): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), { coverPhotoIndex });
}
