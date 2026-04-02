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
