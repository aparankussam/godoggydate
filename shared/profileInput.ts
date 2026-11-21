// shared/profileInput.ts
// Small, pure rules for the free-text boxes on the dog profile form (name,
// breed, city, state, the "About your dog" answers). The web form gets its
// state from a <select> of valid USPS codes; a phone has no such control, so
// the iPhone form types it and needs the same list to refuse "ZZ" — which web
// would then fail to read back (it only rehydrates a state that is on its list).
//
// No imports, so web, mobile and `node --test` can all use it.

/** The 50 states plus DC — exactly what web/components/DogProfileForm.tsx lists. */
export const US_STATE_CODES: readonly string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

/** True for a real two-letter state code, in any case. */
export function isUsStateCode(value: string | null | undefined): boolean {
  return US_STATE_CODES.includes((value ?? '').trim().toUpperCase());
}

/**
 * What a state box should hold after the owner types or pastes into it:
 * letters only, upper-cased, at most two. Digits, spaces, emoji and punctuation
 * are dropped as they arrive instead of being saved and rejected later.
 */
export function normalizeStateInput(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
}

/**
 * Upper bounds for the profile's free-text boxes. Generous for every real dog
 * and owner, but a pasted novel can no longer become a dog's name that blows
 * out every card it is drawn on. Applied as `maxLength` on the iPhone form,
 * which blocks typing past it without touching what is already saved.
 */
export const PROFILE_TEXT_LIMITS = {
  name: 50,
  breed: 60,
  city: 60,
  promptAnswer: 300,
  /** 5 digits, a hyphen, 4 digits. */
  zip: 10,
} as const;
