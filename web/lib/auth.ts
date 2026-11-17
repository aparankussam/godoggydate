// web/lib/auth.ts
// Firebase Auth + Firestore helpers for GoDoggyDate.

import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

// ── Sign in with Apple ────────────────────────────────────────────────────────
// iPhone users who signed up with Apple need the same provider here, or their
// account is unreachable on the web. Hidden until the owner has configured the
// Apple provider in the Firebase console and set this flag on the web host.
export const APPLE_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED === 'true';

function appleProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

// Popup failures that mean "no popups in this browser" rather than "sign-in
// failed". A full-page redirect can still work there.
const POPUP_UNAVAILABLE_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

// Set just before redirecting to Apple, so the page we come back to knows to
// finish the sign-in (and record the 18+ box that was ticked before leaving).
// Pages without the flag skip getRedirectResult, which loads an iframe.
const PENDING_REDIRECT_KEY = 'gdd.pendingRedirectSignIn';

function setPendingRedirect(method: 'apple' | null) {
  try {
    if (method) window.sessionStorage.setItem(PENDING_REDIRECT_KEY, method);
    else window.sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  } catch {
    // Storage blocked: the redirect can't complete there anyway.
  }
}

export function hasPendingRedirectSignIn(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_REDIRECT_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Popup first, like Google. Where the browser can't open one, falls back to a
 * full-page redirect: in that case the returned promise never settles because
 * the page is navigating to Apple, and completeRedirectSignIn() finishes the
 * job when it comes back.
 */
export async function signInWithApple(): Promise<void> {
  const { auth } = getFirebase();
  try {
    await signInWithPopup(auth, appleProvider(), browserPopupRedirectResolver);
    return;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (!POPUP_UNAVAILABLE_CODES.has(code)) throw error;
  }
  setPendingRedirect('apple');
  try {
    await signInWithRedirect(auth, appleProvider(), browserPopupRedirectResolver);
  } catch (error) {
    setPendingRedirect(null);
    throw error;
  }
}

/**
 * Finishes a redirect sign-in that signInWithApple started. Resolves 'apple'
 * when someone just came back signed in, null when there was nothing to
 * finish. Rejects with the Firebase error if Apple sent them back with one.
 */
export async function completeRedirectSignIn(): Promise<'apple' | null> {
  if (!hasPendingRedirectSignIn()) return null;
  setPendingRedirect(null);
  const { auth } = getFirebase();
  const result = await getRedirectResult(auth, browserPopupRedirectResolver);
  return result ? 'apple' : null;
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
  const existingDogSnap = await getDoc(doc(db, 'dogs', uid));
  const existingDogData = existingDogSnap.exists()
    ? existingDogSnap.data() as SavedDogProfile
    : null;
  const createdAt = existingDogData?.createdAt ?? profile.createdAt ?? Date.now();
  const updatedAt = Date.now();
  const batch = writeBatch(db);

  batch.set(
    doc(db, 'dogs', uid),
    stripUndefined({
      ...toPublicSavedDogProfile(profile),
      ownerId: uid,
      createdAt,
      updatedAt,
    }),
    // Preserve server-assigned fields (e.g. foundingPackNumber, trustScore)
    // that aren't part of the client's local profile object — a plain
    // overwrite would silently wipe them on every subsequent edit.
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid, 'private', 'dogProfile'),
    stripUndefined(toPrivateSavedDogProfile(profile)),
    { merge: true },
  );

  await batch.commit();
}
