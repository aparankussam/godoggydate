import type { DogAIProfile, DogProfile, PlayStyle } from './types';

export interface SavedDogProfile {
  name: string;
  size: 'S' | 'M' | 'L' | 'XL';
  energyLevel: number;
  playStyles: string[];
  vaccinated: boolean;
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
    vaccinated: saved.vaccinated,
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
