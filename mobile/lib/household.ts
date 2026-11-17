// mobile/lib/household.ts
// Household — invite a partner, roommate, sitter, or walker onto your dog's
// account. They need no dog of their own. Free, no payment gating: per the
// strategy research, it's the only mechanic that's a genuine viral vector at
// four total users, and pricing it behind a wall would waste it.
// All mutation happens server-side (see firebase/functions/src/index.ts) —
// this file is just the callable-function wiring plus the one read query.
// Ported from web/lib/household.ts.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from './firebase';
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
 * The dogs this user has been INVITED onto — dogs whose householdMemberIds
 * contains their uid. Same query as web/lib/household.ts:
 * firestore.rules makes dogs/{dogId} readable by any signed-in user, and
 * firestore.indexes.json carries the householdMemberIds array-contains
 * override.
 *
 * Never returns the caller's own dog: acceptHouseholdInvite refuses to add an
 * owner to their own householdMemberIds.
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

/** Invite codes are 6 characters from an uppercase alphanumeric alphabet. */
export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

// An invite link can arrive before anyone is signed in. The code is held here
// (memory only, this app session) while they sign in, so the join screen and
// onboarding can pick it up afterwards instead of making them find it again.
let pendingInviteCode: string | null = null;

export function setPendingHouseholdInvite(code: string | null | undefined): void {
  const normalized = normalizeInviteCode(code);
  pendingInviteCode = normalized || null;
}

export function peekPendingHouseholdInvite(): string | null {
  return pendingInviteCode;
}

export function clearPendingHouseholdInvite(): void {
  pendingInviteCode = null;
}
