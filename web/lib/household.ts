// web/lib/household.ts
// Household — invite a partner, roommate, sitter, or walker onto your dog's
// account. They need no dog of their own. Free, no payment gating: per this
// week's strategy research, it's the only mechanic that's a genuine viral
// vector at four total users, and pricing it behind a wall would waste it.
// All mutation happens server-side (see firebase/functions/src/index.ts) —
// this file is just the callable-function wiring.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/utils/firebase';
import type { SavedDogProfile } from '../../shared/profile';

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

export interface HouseholdDog {
  dogId: string;
  profile: SavedDogProfile;
}

/**
 * The dogs this user has been INVITED onto — i.e. dogs whose
 * householdMemberIds contains their uid.
 *
 * This is the read side of Household, and until now nothing in web/ ran it.
 * Everything it needs already existed: firestore.rules makes dogs/{dogId}
 * readable by any signed-in user (so both the `get` and the `list` this query
 * performs are permitted) and firestore.indexes.json already carries the
 * dogs.householdMemberIds array-contains fieldOverride. Without this query an
 * invited partner/sitter accepted an invite and then landed on a profile tab
 * that only ever read THEIR OWN (nonexistent) dog.
 *
 * Never returns the caller's own dog: acceptHouseholdInvite refuses to add an
 * owner to their own householdMemberIds (see firebase/functions/src/index.ts),
 * so an owner's array never contains their own uid.
 */
export async function getHouseholdDogsForUser(uid: string): Promise<HouseholdDog[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, 'dogs'), where('householdMemberIds', 'array-contains', uid)),
  );
  return snap.docs.map((d) => ({ dogId: d.id, profile: d.data() as SavedDogProfile }));
}

export async function removeHouseholdMember(memberUid: string): Promise<void> {
  const { app } = getFirebase();
  const functions = getFunctions(app, 'us-central1');
  const callable = httpsCallable<{ memberUid: string }, { removed: string }>(functions, 'removeHouseholdMember');
  await callable({ memberUid });
}
