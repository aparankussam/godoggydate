// web/lib/packDayAttendees.ts
// Who is going to a Pack Day, from the public dog docs (dogs/{uid} is readable by
// any signed-in member; the event only stores uids). Used by the event page for
// the tiles, the dog card and the heads-up note.

import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { getHeroPhoto, resolveHeroIndex } from './photos';
import { toFullProfile } from '../../shared/profile';
import type { SavedDogProfile } from '../../shared/profile';
import type { HeadsUpDog } from '../../shared/packDayHeadsUp';
import type { PackDay } from '../../shared/packDay';

export interface Attendee {
  uid: string;
  name: string;
  photo: string | null;
  /** Paid Founding Member badge, from the event's foundingUids. */
  founding: boolean;
  /** The public dog doc: what the dog card and the heads-up read. */
  dog: SavedDogProfile;
}

export async function loadAttendees(event: PackDay, foundingUids: string[]): Promise<Attendee[]> {
  return loadDogCards(event.attendeeUids, foundingUids);
}

/** Same cards for any list of uids (a standing group's members). */
export async function loadDogCards(uids: string[], foundingUids: string[] = []): Promise<Attendee[]> {
  const { db } = getFirebase();
  const rows = await Promise.all(
    uids.map(async (uid): Promise<Attendee | null> => {
      try {
        const snap = await getDoc(doc(db, 'dogs', uid));
        if (!snap.exists()) return null;
        const dog = snap.data() as SavedDogProfile;
        return {
          uid,
          name: dog.name?.trim() || 'A dog',
          photo: getHeroPhoto(dog.photos, resolveHeroIndex(dog)),
          founding: foundingUids.includes(uid),
          dog,
        };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((row): row is Attendee => row !== null);
}

/** The shape packDayHeadsUps() reads. */
export function toHeadsUpDogs(attendees: Attendee[]): HeadsUpDog[] {
  return attendees.map((a) => ({ uid: a.uid, profile: toFullProfile(a.dog, a.uid) }));
}

const SIZE_LABEL: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' };
const AGE_LABEL: Record<string, string> = { puppy: 'Puppy', adult: 'Adult', senior: 'Senior' };

/** "Corgi Mix · Small · Adult", leaving out whatever the owner didn't give. */
export function dogFactsLine(dog: Pick<SavedDogProfile, 'breed' | 'size' | 'age'>): string {
  return [dog.breed?.trim(), SIZE_LABEL[dog.size ?? ''], AGE_LABEL[dog.age ?? '']].filter(Boolean).join(' · ');
}
