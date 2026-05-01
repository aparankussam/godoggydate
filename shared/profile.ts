import type { DogProfile, PlayStyle } from './types';

export interface SavedDogProfile {
  name: string;
  size: 'S' | 'M' | 'L' | 'XL';
  energyLevel: number;
  playStyles: string[];
  vaccinated: boolean;
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
  } | null | undefined,
): boolean {
  if (!profile) return false;

  const hasPersonality =
    (profile.temperament?.length ?? 0) >= 1 ||
    (profile.playStyles?.length ?? 0) >= 1;
  const hasLocation =
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
    goodWith: ['all dogs'],
    notGoodWith: [],
    playStyles: saved.playStyles as PlayStyle[],
    boundaries: [],
    allergies: [],
    vaccinated: saved.vaccinated,
    vetChecked: false,
    specialNeeds: [],
    behaviorFlags: [],
    mode: 'playdate',
    trustScore: 70,
    totalMeetups: 0,
    temperament: saved.temperament ?? [],
    location: saved.location,
    lat: saved.lat,
    lng: saved.lng,
    prompts: saved.prompts,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
