// web/lib/auth.ts
// Firebase Auth + Firestore helpers for GoDoggyDate.

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  browserPopupRedirectResolver,
  signOut as _signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import {
  isProfileComplete,
  mergeSavedDogProfiles,
  toFullProfile,
  toPrivateSavedDogProfile,
  toPublicSavedDogProfile,
} from '../../shared/profile';
import type { SavedDogProfile } from '../../shared/profile';

export type { User } from 'firebase/auth';
export { onAuthStateChanged };
export type { SavedDogProfile } from '../../shared/profile';
export { isProfileComplete, toFullProfile } from '../../shared/profile';

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    ) as T;
  }

  return value;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<void> {
  const { auth } = getFirebase();
  await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
}

export async function signInWithGoogleIdToken(idToken: string): Promise<void> {
  const { auth } = getFirebase();
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(auth, credential);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebase();
  await _signOut(auth);
}

// ── Firestore ─────────────────────────────────────────────────────────────────
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

export async function saveUserDogProfile(
  uid: string,
  profile: SavedDogProfile,
): Promise<void> {
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
