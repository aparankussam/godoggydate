// mobile/lib/account.ts
// Account-level records and account deletion.
//
// Terms acceptance mirrors web/components/AuthModal.tsx: the 18+ / Terms box
// is ticked before any sign-in button works, and the acceptance is saved on
// users/{uid} afterwards.
//
// Deletion calls the deleteAccount Cloud Function (same one web uses), which
// removes all user data and the Firebase Auth user, then signs the client out.
// Required for Apple App Store Guideline 5.1.1(v).

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signOut } from '@firebase/auth';
import { getFirebase } from './firebase';

// ── Terms acceptance ─────────────────────────────────────────────────────────

/**
 * Must stay equal to TERMS_VERSION in web/components/AuthModal.tsx. Bump both
 * when the Terms change materially, so acceptance is collected again.
 */
export const TERMS_VERSION = '2026-11';

const DEVICE_TERMS_KEY = 'godoggydate.termsAcceptedVersion';

/** True when users/{uid} already records 18+ and the current Terms version. */
export async function hasAcceptedCurrentTerms(uid: string): Promise<boolean> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return false;
  const data = snap.data() as { ageConfirmed18?: unknown; termsVersion?: unknown };
  return data.ageConfirmed18 === true && data.termsVersion === TERMS_VERSION;
}

/** Same fields and merge write as web's recordTermsAcceptance. */
export async function recordTermsAcceptance(uid: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(
    doc(db, 'users', uid),
    { termsAcceptedAt: serverTimestamp(), termsVersion: TERMS_VERSION, ageConfirmed18: true },
    { merge: true },
  );
}

/**
 * Remembers that the current Terms were accepted on this device, so the box on
 * the welcome screen comes back already ticked after a sign-out. Best effort.
 */
export async function rememberTermsAcceptedOnDevice(): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_TERMS_KEY, TERMS_VERSION);
  } catch {
    // Storage is a convenience here; the Firestore record is the real one.
  }
}

export async function wasTermsAcceptedOnDevice(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEVICE_TERMS_KEY)) === TERMS_VERSION;
  } catch {
    return false;
  }
}

// ── Account deletion ─────────────────────────────────────────────────────────

const REVOKE_TIMEOUT_MS = 10_000;

/**
 * Apple asks apps that offer Sign in with Apple to revoke the user's Apple
 * tokens when the account is deleted. Firebase does the revoking: we get a
 * fresh authorization code from Apple and hand it to Identity Toolkit's
 * accounts:revokeToken, which exchanges and revokes it with Apple.
 *
 * Only works once the Apple provider's OAuth code flow is configured in the
 * Firebase console (Services ID, Apple team ID, key ID and private key).
 * Until then Identity Toolkit rejects the call and we just log it.
 *
 * Never throws: any failure or cancellation is logged and deletion goes ahead.
 */
async function revokeAppleTokensBestEffort(): Promise<void> {
  try {
    if (Platform.OS !== 'ios') return;
    const { app, auth } = getFirebase();
    const user = auth.currentUser;
    if (!user) return;
    if (!user.providerData.some((provider) => provider?.providerId === 'apple.com')) return;
    if (!(await AppleAuthentication.isAvailableAsync())) return;

    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    const authorizationCode = credential.authorizationCode;
    if (!authorizationCode) {
      console.warn('[account] Apple returned no authorization code; skipping token revocation');
      return;
    }

    const idToken = await user.getIdToken();
    const apiKey = app.options.apiKey ?? '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: 'apple.com',
            tokenType: 'CODE',
            token: authorizationCode,
            idToken,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.warn('[account] Apple token revocation failed', response.status, detail.slice(0, 300));
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    // Includes ERR_REQUEST_CANCELED when the person dismisses Apple's sheet.
    console.warn('[account] Apple token revocation skipped', error);
  }
}

export async function deleteAccount(): Promise<void> {
  // Must run first: it needs a live Firebase ID token, which stops working
  // once the callable deletes the Auth user.
  await revokeAppleTokensBestEffort();

  const { app, auth } = getFirebase();
  const functions = getFunctions(app, 'us-central1');
  const callable = httpsCallable(functions, 'deleteAccount');
  await callable();
  try {
    await signOut(auth);
  } catch {
    // Auth user is already deleted server-side; local sign-out is best-effort.
  }
}
