import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { stripUndefined } from './firestoreData';
import type { SavedDogProfile } from '../../shared/profile';

export type { SavedDogProfile } from '../../shared/profile';
export { isProfileComplete } from '../../shared/profile';

export async function getUserDogProfile(uid: string): Promise<SavedDogProfile | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'dogs', uid));
  return snap.exists() ? (snap.data() as SavedDogProfile) : null;
}

export async function saveUserDogProfile(uid: string, profile: SavedDogProfile): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'dogs', uid), stripUndefined({
    ...profile,
    ownerId: uid,
  }));
}
