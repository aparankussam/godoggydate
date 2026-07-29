// web/lib/household.ts
// Household — invite a partner, roommate, sitter, or walker onto your dog's
// account. They need no dog of their own. Free, no payment gating: per this
// week's strategy research, it's the only mechanic that's a genuine viral
// vector at four total users, and pricing it behind a wall would waste it.
// All mutation happens server-side (see firebase/functions/src/index.ts) —
// this file is just the callable-function wiring.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/utils/firebase';

export async function createHouseholdInvite(): Promise<{ code: string; expiresAt: number }> {
  const { app } = getFirebase();
  const functions = getFunctions(app, 'us-central1');
  const callable = httpsCallable<undefined, { code: string; expiresAt: number }>(functions, 'createHouseholdInvite');
  const result = await callable();
  return result.data;
}

export async function acceptHouseholdInvite(code: string): Promise<{ dogId: string }> {
  const { app } = getFirebase();
  const functions = getFunctions(app, 'us-central1');
  const callable = httpsCallable<{ code: string }, { dogId: string }>(functions, 'acceptHouseholdInvite');
  const result = await callable({ code });
  return result.data;
}

export async function removeHouseholdMember(memberUid: string): Promise<void> {
  const { app } = getFirebase();
  const functions = getFunctions(app, 'us-central1');
  const callable = httpsCallable<{ memberUid: string }, { removed: string }>(functions, 'removeHouseholdMember');
  await callable({ memberUid });
}
