// web/lib/revealUnlocks.ts
// Local-first "unlock" ledger for the Reveal Explorer. The first (strongest)
// best-match is always free; each additional match unlocks when the owner EARNS
// a key, and there are two honest ways to earn one:
//   • reach a Snoot Boop milestone (derived live from the boop count), or
//   • invite a friend (the shared card IS the invite).
//
// Mirrors the boops pattern exactly: localStorage only, no backend, per-device,
// SSR-safe. Honest by construction — a key is always a real thing the owner did
// (booped N times, or shared an invite), never fabricated. Keyed by the same
// dogId (the owner's uid) the boop counter uses, so boops earned in Snoot Boop
// count here too.

import { loadAllTime, BOOP_MILESTONES } from './boops';

export interface UnlockState {
  /** Distinct match-type codes the owner has invited for. One key each — a set,
   *  so re-sharing the same type can't farm extra keys. */
  invitedCodes: string[];
}

const KEY = (dogId: string) => `godoggydate.revealUnlocks.${dogId}`;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadUnlocks(dogId: string): UnlockState {
  if (!hasStorage() || !dogId) return { invitedCodes: [] };
  try {
    const raw = window.localStorage.getItem(KEY(dogId));
    if (!raw) return { invitedCodes: [] };
    const parsed = JSON.parse(raw) as { invitedCodes?: unknown };
    const codes = Array.isArray(parsed.invitedCodes)
      ? parsed.invitedCodes.filter((c): c is string => typeof c === 'string')
      : [];
    return { invitedCodes: Array.from(new Set(codes)) };
  } catch {
    return { invitedCodes: [] };
  }
}

function save(dogId: string, state: UnlockState): void {
  if (!hasStorage() || !dogId) return;
  try {
    window.localStorage.setItem(KEY(dogId), JSON.stringify(state));
  } catch {
    /* private mode / quota — the ledger degrades to nothing, never throws */
  }
}

/** Keys earned from Snoot Boop: one per milestone the all-time count has reached. */
export function boopKeys(dogId: string): number {
  const allTime = loadAllTime(dogId);
  return BOOP_MILESTONES.filter((m) => allTime >= m.count).length;
}

/** Total keys the owner has earned = boop milestones + distinct invites. */
export function keysEarned(dogId: string, invitedCodes: string[]): number {
  return boopKeys(dogId) + invitedCodes.length;
}

/**
 * How many additional matches are unlocked (beyond the always-free first),
 * capped at how many locked matches actually exist.
 */
export function unlockedExtra(dogId: string, invitedCodes: string[], lockedTotal: number): number {
  return Math.max(0, Math.min(lockedTotal, keysEarned(dogId, invitedCodes)));
}

/** Record an invite for a match type. Idempotent — one key per distinct type. */
export function recordInvite(dogId: string, matchCode: string): UnlockState {
  const state = loadUnlocks(dogId);
  if (!matchCode || state.invitedCodes.includes(matchCode)) return state;
  const next = { invitedCodes: [...state.invitedCodes, matchCode] };
  save(dogId, next);
  return next;
}
