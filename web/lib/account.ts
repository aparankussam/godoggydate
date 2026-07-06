// web/lib/account.ts
// Account deletion — calls the deleteAccount Cloud Function, which removes
// all user data (dog profile, matches + messages, swipes, blocks, private
// docs) and the Firebase Auth user, then signs the client out.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { getFirebase } from '../shared/utils/firebase';

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
