// shared/founding.ts
// The founding ladder: one numbered run of Founding Members, #1–150.
//   #1–50    free: the first 50 dogs with a profile (onDogProfileCreated)
//   #51–150  $39 once: numbered by the Stripe webhook as each payment lands
// After #150, founding closes for good. Free and paid members get the same
// lifetime entitlement (Pro for life) and the same "⭐ Founding Member #N" badge.
//
// counters/foundingPack is the one source of truth for which step the ladder is
// on. It only ever counts up, so a number is never handed out twice.
//
// No imports on purpose: shared/pro.ts and shared/utils/stripe.ts both import
// this file, and pro.ts already imports stripe.ts, so anything here that
// imported either of them would create a cycle.
//
// firebase/functions/src/index.ts can't import from shared/, so it repeats these
// numbers (FOUNDING_FREE_CAP, FOUNDING_TOTAL_CAP). Change them together, along
// with the payment limit on the Stripe Payment Link (FOUNDING_PAID_SPOTS).

export const FOUNDING_FREE_SPOTS = 50;
export const FOUNDING_PAID_SPOTS = 100;
export const FOUNDING_TOTAL = FOUNDING_FREE_SPOTS + FOUNDING_PAID_SPOTS;

export type FoundingPhase = 'free' | 'paid' | 'closed';

function clampCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/** Which step of the ladder a counters/foundingPack count puts us on. */
export function foundingPhase(count: number): FoundingPhase {
  const c = clampCount(count);
  if (c < FOUNDING_FREE_SPOTS) return 'free';
  if (c < FOUNDING_TOTAL) return 'paid';
  return 'closed';
}

/** Spots left in the current phase: free spots while free, paid spots while paid. */
export function foundingSpotsLeft(count: number): number {
  const c = clampCount(count);
  const phase = foundingPhase(c);
  if (phase === 'free') return FOUNDING_FREE_SPOTS - c;
  if (phase === 'paid') return FOUNDING_TOTAL - c;
  return 0;
}

/** The one Founding badge. A member without a number (bought before the
 *  ladder existed) still gets the badge, just without "#N". */
export function foundingBadgeLabel(foundingNumber?: number | null): string {
  return typeof foundingNumber === 'number'
    ? `⭐ Founding Member #${foundingNumber}`
    : '⭐ Founding Member';
}
