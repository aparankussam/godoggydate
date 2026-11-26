import { deleteField, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
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
  const existingDogSnap = await getDoc(doc(db, 'dogs', uid));
  const existingDogData = existingDogSnap.exists()
    ? existingDogSnap.data() as SavedDogProfile
    : null;
  const createdAt = existingDogData?.createdAt ?? profile.createdAt ?? Date.now();
  const updatedAt = Date.now();
  const batch = writeBatch(db);

  // Location fields the owner CLEARED. The editor omits an emptied field, and
  // stripUndefined + { merge: true } would then leave the old value in
  // Firestore: swapping a ZIP for city+state kept the ZIP, and swapping
  // city+state for a ZIP kept the old public city, so a profile meant to be
  // private stayed discoverable at the old place. Every caller passes the whole
  // profile, so an empty one here means "cleared". (Same rule as the web saver.)
  const publicDoc = stripUndefined(toPublicSavedDogProfile(profile)) as unknown as Record<string, unknown>;
  for (const key of ['location', 'city', 'state'] as const) {
    if (!publicDoc[key]) publicDoc[key] = deleteField();
  }
  const privateDoc = stripUndefined(toPrivateSavedDogProfile(profile)) as unknown as Record<string, unknown>;
  for (const key of ['zip', 'city', 'state'] as const) {
    if (!privateDoc[key]) privateDoc[key] = deleteField();
  }

  batch.set(
    doc(db, 'dogs', uid),
    {
      ...publicDoc,
      ownerId: uid,
      createdAt,
      updatedAt,
    },
    // Preserve server-assigned fields (e.g. foundingPackNumber, trustScore)
    // that aren't part of the client's local profile object — a plain
    // overwrite would silently wipe them on every subsequent edit.
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid, 'private', 'dogProfile'),
    privateDoc,
    { merge: true },
  );

  await batch.commit();
}

/** Memorial mode on (a 'YYYY-MM-DD' date) or off (null). One field, so nothing else on the profile is rewritten. */
export async function setMemorial(uid: string, since: string | null): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), { memorialSince: since });
}
