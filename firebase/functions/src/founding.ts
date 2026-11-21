// firebase/functions/src/founding.ts
// MIRROR of shared/founding.ts. Do not edit this copy by hand.
//
// The functions deploy uploads only firebase/functions (tsconfig rootDir is
// src), so this package can't import ../../shared at runtime. Everything below
// this header is byte-identical to shared/founding.ts from the first `export`
// line down, and shared/serverMirrors.test.ts fails if the two drift. To change
// it, edit shared/founding.ts, then copy its body here.

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

// ── Who earns a free number ────────────────────────────────────────────────────
// A number is a scarce public badge, so it goes to a finished profile, not to
// any dogs/{uid} document: the first version numbered whatever was written
// first, and a hollow { name: 'x' } doc took a spot. "Finished" is what the
// apps call a complete profile (isProfileComplete in shared/profile.ts) with
// two differences: the photos must be real (never the '_placeholder_' padding),
// and the location must be on the PUBLIC dog doc. A ZIP lives only in the
// owner's private doc, which a dog-doc trigger can't see, so a ZIP-only profile
// (which other dogs can't discover anyway) waits until it has a city and state,
// a place name or coordinates.

export const FOUNDING_MIN_PHOTOS = 3;
const PLACEHOLDER_PHOTO = '_placeholder_';

/** What the founding check reads from a public dog doc. */
export interface FoundingProfileFields {
  name?: unknown;
  breed?: unknown;
  age?: unknown;
  sex?: unknown;
  size?: unknown;
  energyLevel?: unknown;
  temperament?: unknown;
  playStyles?: unknown;
  photos?: unknown;
  city?: unknown;
  state?: unknown;
  location?: unknown;
  lat?: unknown;
  lng?: unknown;
}

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function listHasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isZipShaped(value: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(value.trim());
}

function isCoordinate(value: unknown, limit: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

/** A non-empty string that isn't the '_placeholder_' padding token. */
export function isNonPlaceholderPhoto(value: unknown): boolean {
  return filled(value) && (value as string).trim() !== PLACEHOLDER_PHOTO;
}

/**
 * What is still missing for a free Founding number; empty when the profile is
 * finished. `isRealPhoto` decides what counts as a photo: the default only
 * rules out blanks and the placeholder, while the Cloud Function passes a
 * check for this project's own Storage URLs.
 */
export function foundingProfileGaps(
  dog: FoundingProfileFields | null | undefined,
  isRealPhoto: (photo: unknown) => boolean = isNonPlaceholderPhoto,
): string[] {
  if (!dog) return ['profile'];
  const gaps: string[] = [];
  if (!filled(dog.name)) gaps.push('name');
  if (!filled(dog.breed)) gaps.push('breed');
  if (!filled(dog.age)) gaps.push('age');
  if (!filled(dog.sex)) gaps.push('sex');
  if (!filled(dog.size)) gaps.push('size');
  if (typeof dog.energyLevel !== 'number' || !Number.isFinite(dog.energyLevel)) gaps.push('energyLevel');
  if (!listHasEntries(dog.temperament) && !listHasEntries(dog.playStyles)) gaps.push('personality');

  const photos = Array.isArray(dog.photos) ? dog.photos : [];
  if (photos.filter((photo) => isRealPhoto(photo)).length < FOUNDING_MIN_PHOTOS) gaps.push('photos');

  const hasCoords = isCoordinate(dog.lat, 90) && isCoordinate(dog.lng, 180);
  const hasCityState = filled(dog.city) && !isZipShaped(dog.city as string) && filled(dog.state);
  const hasPlace = filled(dog.location) && !isZipShaped(dog.location as string);
  if (!hasCoords && !hasCityState && !hasPlace) gaps.push('location');
  return gaps;
}

export function isFoundingProfileComplete(
  dog: FoundingProfileFields | null | undefined,
  isRealPhoto?: (photo: unknown) => boolean,
): boolean {
  return foundingProfileGaps(dog, isRealPhoto).length === 0;
}

// ── Which Stripe checkouts earn a number ──────────────────────────────────────
// The Payment Link sells one $39 membership. These decide, from the facts on a
// checkout.session.completed event, whether it grants one.

/** Price of one membership, in US cents. */
export const FOUNDING_PRICE_CENTS = 3900;

export type FoundingCheckoutReason =
  | 'ok'
  | 'unpaid'          // not paid (yet): nothing to grant
  | 'zero_amount'     // a 100%-off or free session: nothing was paid, so no number is spent
  | 'below_price'     // cheaper than one membership: a different product
  | 'wrong_currency';

export interface FoundingCheckoutFacts {
  paymentStatus?: string | null;
  /** Before discounts, in cents. A promo code the owner handed out still grants. */
  amountSubtotal?: number | null;
  /** What was actually charged, in cents. */
  amountTotal?: number | null;
  currency?: string | null;
}

export interface FoundingCheckoutVerdict {
  grants: boolean;
  reason: FoundingCheckoutReason;
  /** How many memberships the subtotal pays for (1 unless quantity was raised). */
  quantity: number;
}

export function classifyFoundingCheckout(facts: FoundingCheckoutFacts): FoundingCheckoutVerdict {
  const subtotal = typeof facts.amountSubtotal === 'number' && Number.isFinite(facts.amountSubtotal)
    ? facts.amountSubtotal
    : 0;
  // null when Stripe didn't say: then only the payment status can speak.
  const total = typeof facts.amountTotal === 'number' && Number.isFinite(facts.amountTotal)
    ? facts.amountTotal
    : null;
  const quantity = Math.max(1, Math.floor(subtotal / FOUNDING_PRICE_CENTS));
  const verdict = (reason: FoundingCheckoutReason): FoundingCheckoutVerdict => ({
    grants: reason === 'ok',
    reason,
    quantity,
  });

  // A 100%-off session ends as 'no_payment_required', but check the amount
  // too: a number is only ever spent on money actually taken.
  if (subtotal >= FOUNDING_PRICE_CENTS && total !== null && total <= 0) return verdict('zero_amount');
  if (facts.paymentStatus !== 'paid') return verdict('unpaid');
  if (subtotal < FOUNDING_PRICE_CENTS) return verdict('below_price');
  if (facts.currency !== 'usd') return verdict('wrong_currency');
  return verdict('ok');
}

/** Dollars-and-cents text for an alert, e.g. 7800 -> "$78.00". */
export function formatUsdCents(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return 'an unknown amount';
  return `$${(cents / 100).toFixed(2)}`;
}
