// web/lib/auth.ts
// Firebase Auth + Firestore helpers for GoDoggyDate.

import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  getAdditionalUserInfo,
  browserPopupRedirectResolver,
  signOut as _signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import type { UserCredential } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
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

/** Fired on `window` after saveUserDogProfile commits (AppLayoutShell listens). */
export const PROFILE_SAVED_EVENT = 'gdd:profile-saved';

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
/** What a sign-in tells the caller: was this account created just now? */
export interface SignInResult {
  isNewUser: boolean;
}

function toSignInResult(cred: UserCredential): SignInResult {
  return { isNewUser: getAdditionalUserInfo(cred)?.isNewUser === true };
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const { auth } = getFirebase();
  return toSignInResult(
    await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver),
  );
}

export async function signInWithGoogleIdToken(idToken: string): Promise<SignInResult> {
  const { auth } = getFirebase();
  const credential = GoogleAuthProvider.credential(idToken);
  return toSignInResult(await signInWithCredential(auth, credential));
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
export async function signInWithApple(): Promise<SignInResult> {
  const { auth } = getFirebase();
  try {
    return toSignInResult(
      await signInWithPopup(auth, appleProvider(), browserPopupRedirectResolver),
    );
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
  // Unreachable in practice: the page navigates away above.
  return { isNewUser: false };
}

/**
 * Finishes a redirect sign-in that signInWithApple started. Resolves with
 * { method: 'apple', isNewUser } when someone just came back signed in, null
 * when there was nothing to finish. Rejects with the Firebase error if Apple
 * sent them back with one.
 */
export async function completeRedirectSignIn(): Promise<
  ({ method: 'apple' } & SignInResult) | null
> {
  if (!hasPendingRedirectSignIn()) return null;
  setPendingRedirect(null);
  const { auth } = getFirebase();
  const result = await getRedirectResult(auth, browserPopupRedirectResolver);
  return result ? { method: 'apple', ...toSignInResult(result) } : null;
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

  // Location fields the owner CLEARED. The form omits an emptied field, and
  // stripUndefined + { merge: true } would then leave the old value in
  // Firestore: swapping a ZIP for city+state kept the ZIP (and the form showed
  // it again), and swapping city+state for a ZIP kept the old public city, so a
  // profile meant to be private stayed discoverable at the old place. Every
  // caller passes the whole profile, so an empty one here means "cleared".
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

  // Tell the app shell the saved profile changed. It reads the profile once at
  // sign-in to decide whether to show the navigation, so without this a brand
  // new user who saves their first profile had no nav until a manual reload.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
  }
}

/** Memorial mode on (a 'YYYY-MM-DD' date) or off (null). One field, so nothing else on the profile is rewritten. */
export async function setMemorial(uid: string, since: string | null): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), { memorialSince: since });
}
