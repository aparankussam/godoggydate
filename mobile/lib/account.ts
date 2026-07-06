// mobile/lib/account.ts
// Account deletion — calls the deleteAccount Cloud Function (same one web
// uses), which removes all user data and the Firebase Auth user, then signs
// the client out. Required for Apple App Store Guideline 5.1.1(v).

import { getFunctions, httpsCallable } from 'firebase/functions';
import { signOut } from '@firebase/auth';
import { getFirebase } from './firebase';

export async function deleteAccount(): Promise<void> {
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
