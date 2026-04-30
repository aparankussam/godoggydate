import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { stripUndefined } from './firestoreData';
import {
  mergeSavedDogProfiles,
  toPrivateSavedDogProfile,
  toPublicSavedDogProfile,
  type SavedDogProfile,
} from '../../shared/profile';

export type { SavedDogProfile } from '../../shared/profile';
export { isProfileComplete } from '../../shared/profile';

export async function getUserDogProfile(uid: string): Promise<SavedDogProfile | null> {
  const { db } = getFirebase();
  const [publicSnap, privateSnap] = await Promise.all([
    getDoc(doc(db, 'dogs', uid)),
    getDoc(doc(db, 'users', uid, 'private', 'dogProfile')),
  ]);

  if (!publicSnap.exists()) return null;

  const publicProfile = publicSnap.data() as SavedDogProfile;
  const privateProfile = privateSnap.exists() ? privateSnap.data() as SavedDogProfile : null;
  return mergeSavedDogProfiles(publicProfile, privateProfile);
}

export async function saveUserDogProfile(uid: string, profile: SavedDogProfile): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);

  batch.set(
    doc(db, 'dogs', uid),
    stripUndefined({
      ...toPublicSavedDogProfile(profile),
      ownerId: uid,
    }),
  );

  batch.set(
    doc(db, 'users', uid, 'private', 'dogProfile'),
    stripUndefined(toPrivateSavedDogProfile(profile)),
    { merge: true },
  );

  await batch.commit();
}
