// web/lib/auth.ts
// Firebase Auth + Firestore helpers for GoDoggyDate.

import {
  GoogleAuthProvider,
  signInWithPopup,
  browserPopupRedirectResolver,
  signOut as _signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { isProfileComplete, toFullProfile } from '../../shared/profile';
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

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebase();
  await _signOut(auth);
}

// ── Firestore ─────────────────────────────────────────────────────────────────
export async function getUserDogProfile(uid: string): Promise<SavedDogProfile | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'dogs', uid));
  return snap.exists() ? (snap.data() as SavedDogProfile) : null;
}

export async function saveUserDogProfile(
  uid: string,
  profile: SavedDogProfile,
): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'dogs', uid), stripUndefined({
    ...profile,
    ownerId: uid,
  }));
}
