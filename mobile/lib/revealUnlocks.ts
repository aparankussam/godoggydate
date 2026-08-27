// mobile/lib/revealUnlocks.ts
// Local-first "unlock" ledger for the Reveal Explorer — the AsyncStorage twin of
// web/lib/revealUnlocks.ts. The single strongest best-match is always free; each
// additional one unlocks when the owner earns a key, two honest ways:
//   • reach a Snoot Boop milestone (derived from the boop count), or
//   • invite a friend (the shared card IS the invite).
// No backend, per-device. A key is always a real thing the owner did.
//
// AsyncStorage is async (unlike web's synchronous localStorage), so the reads
// here return Promises and the explorer loads the result into state on mount /
// focus, then computes keys synchronously from that snapshot.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadBoops, BOOP_MILESTONES } from './boops';

const KEY = (dogId: string) => `godoggydate.revealUnlocks.${dogId}`;

export interface UnlockSnapshot {
  /** Distinct match-type codes invited for — one key each (a set). */
  invitedCodes: string[];
  /** All-time boop count, read alongside so keys can be computed in one place. */
  boopAllTime: number;
}

/** Read the ledger AND the boop count together. Never throws. */
export async function loadUnlocks(dogId: string): Promise<UnlockSnapshot> {
  if (!dogId) return { invitedCodes: [], boopAllTime: 0 };
  let invitedCodes: string[] = [];
  let boopAllTime = 0;
  try {
    const raw = await AsyncStorage.getItem(KEY(dogId));
    if (raw) {
      const parsed = JSON.parse(raw) as { invitedCodes?: unknown };
      if (Array.isArray(parsed.invitedCodes)) {
        invitedCodes = Array.from(
          new Set(parsed.invitedCodes.filter((c): c is string => typeof c === 'string')),
        );
      }
    }
  } catch {
    /* corrupt / unavailable — degrade to empty */
  }
  try {
    boopAllTime = (await loadBoops(dogId)).allTime;
  } catch {
    /* ignore — 0 keys from boops */
  }
  return { invitedCodes, boopAllTime };
}

/** Keys earned from Snoot Boop: one per milestone the all-time count has reached. */
export function boopKeys(allTime: number): number {
  return BOOP_MILESTONES.filter((m) => allTime >= m.count).length;
}

/** Total keys = boop milestones + distinct invites. */
export function keysEarned(snapshot: UnlockSnapshot): number {
  return boopKeys(snapshot.boopAllTime) + snapshot.invitedCodes.length;
}

/** Additional matches unlocked (beyond the free first), capped at lockedTotal. */
export function unlockedExtra(snapshot: UnlockSnapshot, lockedTotal: number): number {
  return Math.max(0, Math.min(lockedTotal, keysEarned(snapshot)));
}

/**
 * Record an invite for a match type. Idempotent — one key per distinct type.
 * Returns the updated invitedCodes so the caller can update state immediately.
 */
export async function recordInvite(dogId: string, matchCode: string): Promise<string[]> {
  if (!dogId || !matchCode) return [];
  const snapshot = await loadUnlocks(dogId);
  if (snapshot.invitedCodes.includes(matchCode)) return snapshot.invitedCodes;
  const next = [...snapshot.invitedCodes, matchCode];
  try {
    await AsyncStorage.setItem(KEY(dogId), JSON.stringify({ invitedCodes: next }));
  } catch {
    /* best-effort — the in-memory update still reveals the card this session */
  }
  return next;
}
