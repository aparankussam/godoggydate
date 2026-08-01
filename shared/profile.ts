import type { DogAIProfile, DogProfile, PlayStyle } from './types';

export interface SavedDogProfile {
  name: string;
  size: 'S' | 'M' | 'L' | 'XL';
  energyLevel: number;
  playStyles: string[];
  // Optional and nullable on purpose. This was a required boolean that both
  // forms initialised to `true`, so every dog in Firestore carries a "yes"
  // nobody was ever asked for. undefined (legacy doc, field absent) and null
  // (owner cleared / never answered) both mean NOT STATED — never render them
  // as a "no", and never coerce them to false: false is the explicit answer
  // that flips a pairing to 'blocked' in the matching engine.
  vaccinated?: boolean | null;
  // Owner-typed rabies certificate expiry, 'YYYY-MM-DD'. The one health fact
  // in this document that a real record backs. null is written (not omitted)
  // when the owner clears it, because saves are { merge: true } — an omitted
  // field would leave the stale date in place. Read it through
  // getVaccinationStatus below, never with a raw Date comparison.
  rabiesExpiry?: string | null;
  createdAt?: number;
  updatedAt?: number;
  breed?: string;
  age?: 'puppy' | 'adult' | 'senior';
  sex?: 'M' | 'F';
  photos?: string[];
  temperament?: string[];
  location?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  prompts?: { prompt: string; answer: string }[];
  // Safety screening — the ONLY inputs detectUnsafePairings() reads
  // (shared/utils/matchingEngine.ts). Until these were collected, the whole
  // safety branch of the matching engine was unreachable: warnings.length was
  // always 0 for every real dog because toFullProfile hardcoded empty arrays,
  // while the homepage advertised incompatibility prevention.
  notGoodWith?: string[];
  behaviorFlags?: string[];
  // Server-assigned by the onDogProfileCreated Cloud Function trigger —
  // never set by the client. Real, permanent, numbered soft-launch scarcity.
  foundingPackNumber?: number;
  // Server-computed by the onRatingCreated Cloud Function — never set by
  // the client (see the 'ai'/trust-field guard in firestore.rules' dogs match).
  trustScore?: number;
  ratingCount?: number;
  meetAgainRate?: number;
  // Server-generated Vibe Check content — never set by the client directly.
  ai?: DogAIProfile;
  // Written only by the household Cloud Functions — never set by the client
  // directly, even the owner. See firestore.rules for the guard.
  householdMemberIds?: string[];
  // Display labels captured once at invite-accept time (users/{uid} is
  // owner-read-only, so there's no other way to show a member's name).
  householdMemberNames?: Record<string, string>;
  // The dog's designated Best Friend — a matchId, owner's own preference,
  // freely client-writable (not server-computed, so no guard needed).
  bestFriendMatchId?: string;
}

export interface SavedDogPrivateProfile {
  location?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

function normalizedPublicLocation(profile: SavedDogProfile): string | undefined {
  const city = profile.city?.trim();
  const state = profile.state?.trim().toUpperCase();
  const location = profile.location?.trim();

  if (city && state) {
    return `${city}, ${state}`;
  }

  // Never expose raw ZIP codes as the public display location.
  if (location && !/^\d{5}(-\d{4})?$/.test(location)) {
    return location;
  }

  return undefined;
}

// Round coords to ~1.1 km precision before exposing on the public dog doc.
// Enough for radius-based discovery, coarse enough that no exact address can be derived.
const PUBLIC_COORD_DECIMALS = 2;

function roundPublicCoord(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const factor = 10 ** PUBLIC_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function toPublicSavedDogProfile(profile: SavedDogProfile): SavedDogProfile {
  return {
    ...profile,
    location: normalizedPublicLocation(profile),
    city: profile.city?.trim() || undefined,
    state: profile.state?.trim().toUpperCase() || undefined,
    zip: undefined,
    lat: roundPublicCoord(profile.lat),
    lng: roundPublicCoord(profile.lng),
  };
}

export function toPrivateSavedDogProfile(profile: SavedDogProfile): SavedDogPrivateProfile {
  return {
    location: profile.location?.trim() || undefined,
    city: profile.city?.trim() || undefined,
    state: profile.state?.trim().toUpperCase() || undefined,
    zip: profile.zip?.trim() || undefined,
    lat: profile.lat,
    lng: profile.lng,
  };
}

export function mergeSavedDogProfiles(
  publicProfile: SavedDogProfile,
  privateProfile?: SavedDogPrivateProfile | null,
): SavedDogProfile {
  if (!privateProfile) return publicProfile;

  return {
    ...publicProfile,
    location: privateProfile.location ?? publicProfile.location,
    city: privateProfile.city ?? publicProfile.city,
    state: privateProfile.state ?? publicProfile.state,
    zip: privateProfile.zip,
    lat: privateProfile.lat,
    lng: privateProfile.lng,
  };
}

export function isProfileComplete(
  profile: {
    photos?: string[];
    name?: string;
    breed?: string;
    age?: string;
    sex?: string;
    size?: string;
    energyLevel?: number;
    temperament?: string[];
    playStyles?: string[];
    location?: string;
    city?: string;
    state?: string;
    zip?: string;
    lat?: number;
    lng?: number;
  } | null | undefined,
): boolean {
  if (!profile) return false;

  const hasPersonality =
    (profile.temperament?.length ?? 0) >= 1 ||
    (profile.playStyles?.length ?? 0) >= 1;
  const hasCoords =
    typeof profile.lat === 'number' &&
    Number.isFinite(profile.lat) &&
    typeof profile.lng === 'number' &&
    Number.isFinite(profile.lng);
  const hasLocation =
    hasCoords ||
    !!(profile.zip ?? '').trim() ||
    (!!(profile.city ?? '').trim() && !!(profile.state ?? '').trim()) ||
    !!(profile.location ?? '').trim();

  return (
    (profile.photos?.length ?? 0) >= 3 &&
    !!(profile.name ?? '').trim() &&
    !!(profile.breed ?? '').trim() &&
    !!profile.age &&
    !!profile.sex &&
    !!profile.size &&
    profile.energyLevel !== undefined &&
    hasPersonality &&
    hasLocation
  );
}

// True if the profile's public-readable fields anchor a location that other
// users can use to discover them. Different from isProfileComplete, which can
// be satisfied by ZIP alone (a private-only field that gets stripped from the
// public dog doc). Use this to warn users that their profile, while complete
// from their own view, will be invisible to other dogs.
export function isPubliclyDiscoverable(
  profile: {
    location?: string;
    city?: string;
    state?: string;
    lat?: number;
    lng?: number;
  } | null | undefined,
): boolean {
  if (!profile) return false;

  const hasCoords =
    typeof profile.lat === 'number' &&
    Number.isFinite(profile.lat) &&
    typeof profile.lng === 'number' &&
    Number.isFinite(profile.lng);
  if (hasCoords) return true;

  const hasCityState = !!profile.city?.trim() && !!profile.state?.trim();
  if (hasCityState) return true;

  const text = profile.location?.trim();
  // Plain ZIP-shaped strings are stripped from the public doc, so they don't
  // count as a public anchor here.
  if (text && !/^\d{5}(-\d{4})?$/.test(text)) return true;

  return false;
}

// ─── VACCINATION STATUS ─────────────────────────────────────────────────────
// One helper so every surface says the same thing about the same data. The
// wording is deliberately graded: a date the owner typed off a certificate is
// allowed to be specific, a boolean is only ever allowed to be attributed
// ("Owner marked: …"), and an absence is stated as an absence. Nothing here
// renders as a verification — nobody checks these.

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parse 'YYYY-MM-DD' into a Date at LOCAL midnight, or null if it isn't a real
 * calendar date.
 *
 * `new Date('2026-08-01')` is UTC midnight, which is July 31st for every US
 * timezone — a certificate would read as expired a day early for the entire
 * user base. Building the Date from parts keeps it on the owner's own calendar.
 */
export function parseLocalIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // JS rolls 2026-02-30 forward to March 2nd rather than rejecting it, so
  // round-trip the parts to reject dates that don't actually exist.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

// Fixed month names rather than toLocaleDateString: this string is rendered by
// a client component that Next also renders on the server, and a locale that
// differs between the two produces a hydration mismatch.
export function formatLocalIsoDate(iso: string | null | undefined): string | null {
  const date = parseLocalIsoDate(iso);
  if (!date) return null;
  return `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export type VaccinationTone =
  | 'dated'          // a real owner-supplied expiry, still in the future
  | 'expired'        // a real owner-supplied expiry, now in the past
  | 'self-reported'  // boolean yes, no date behind it
  | 'unvaccinated'   // explicit no from the owner
  | 'unstated';      // never answered

export interface VaccinationStatus {
  tone: VaccinationTone;
  /** Ready-to-render copy. Callers style by tone; they never rewrite this. */
  label: string;
}

export function getVaccinationStatus(
  profile: { rabiesExpiry?: string | null; vaccinated?: boolean | null } | null | undefined,
  today: Date = new Date(),
): VaccinationStatus {
  const expiry = parseLocalIsoDate(profile?.rabiesExpiry);

  if (expiry) {
    // Compare calendar days, not timestamps: `today` carries a time-of-day and
    // `expiry` is local midnight, so a raw > comparison would call a
    // certificate that expires today "expired" from 00:00 onward.
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const label = formatLocalIsoDate(profile?.rabiesExpiry) ?? '';
    // Expiring today still counts as valid today — that's what the paperwork says.
    return expiry.getTime() >= startOfToday.getTime()
      ? { tone: 'dated', label: `Rabies: valid through ${label}` }
      : { tone: 'expired', label: `Rabies: expired ${label}` };
  }

  // No usable date — fall back to the boolean, attributed to the owner. An
  // unparseable date lands here too rather than being shown as-is.
  if (profile?.vaccinated === true) return { tone: 'self-reported', label: 'Owner marked: vaccinated' };
  if (profile?.vaccinated === false) return { tone: 'unvaccinated', label: 'Owner marked: not vaccinated' };
  return { tone: 'unstated', label: 'Vaccination not stated' };
}

export function toFullProfile(saved: SavedDogProfile, uid: string): DogProfile {
  return {
    id: uid,
    ownerId: uid,
    name: saved.name,
    breed: saved.breed || 'Mixed',
    purebred: false,
    size: saved.size,
    age: saved.age || 'adult',
    sex: saved.sex || 'M',
    fixed: false,
    energyLevel: saved.energyLevel,
    photos: saved.photos ?? [],
    // goodWith stays permissive-by-default (it only ADDS score, never warns).
    // notGoodWith/behaviorFlags were ALSO hardcoded empty here, which silently
    // disabled every safety warning detectUnsafePairings() can produce — the
    // engine read these two fields and always got []. Now passed through from
    // what the owner actually declared.
    goodWith: ['all dogs'],
    notGoodWith: (saved.notGoodWith ?? []) as DogProfile['notGoodWith'],
    playStyles: saved.playStyles as PlayStyle[],
    boundaries: [],
    allergies: [],
    // undefined (legacy doc with no field) and null (never answered / cleared)
    // both collapse to null — "not stated". Never to false, which the engine
    // reads as an explicit no and turns into a 'blocked' tier.
    vaccinated: saved.vaccinated ?? null,
    rabiesExpiry: saved.rabiesExpiry ?? undefined,
    vetChecked: false,
    specialNeeds: [],
    behaviorFlags: (saved.behaviorFlags ?? []) as DogProfile['behaviorFlags'],
    mode: 'playdate',
    // Was hardcoded to a fixed 70 regardless of the real value onRatingCreated
    // computes and writes to this same doc — every dog with real ratings
    // showed a fabricated baseline everywhere this ran. Left undefined (not
    // defaulted) for never-rated dogs, matching the real system: the
    // function only fires — and only ever writes trustScore — once a rating
    // exists, so there is no honest baseline value to substitute here.
    trustScore: saved.trustScore,
    ratingCount: saved.ratingCount,
    meetAgainRate: saved.meetAgainRate,
    totalMeetups: saved.ratingCount ?? 0,
    temperament: saved.temperament ?? [],
    location: saved.location,
    lat: saved.lat,
    lng: saved.lng,
    prompts: saved.prompts,
    foundingPackNumber: saved.foundingPackNumber,
    ai: saved.ai,
    householdMemberIds: saved.householdMemberIds,
    householdMemberNames: saved.householdMemberNames,
    bestFriendMatchId: saved.bestFriendMatchId,
    createdAt: saved.createdAt ?? Date.now(),
    updatedAt: saved.updatedAt ?? saved.createdAt ?? Date.now(),
  };
}
