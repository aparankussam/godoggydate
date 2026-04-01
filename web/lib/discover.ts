// web/lib/discover.ts
// Feed helpers for real-user discovery with demo-profile fallback.

import { collection, getDocs } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { SEED_DOGS, SEED_DISTANCES } from '../shared/data/seedDogs';
import { calculateCompatibility } from '../shared/utils/matchingEngine';
import { isProfileComplete, toFullProfile } from './auth';
import type { SavedDogProfile } from './auth';
import type { DogProfile, CompatibilityResult } from '../shared/types';

export interface DiscoverFeedDog {
  id: string;
  firestoreId: string;
  ownerId: string;
  name: string;
  breed: string;
  age: string;
  sex: string;
  size: string;
  energyLevel: number;
  photos?: string[];
  vaccinated?: boolean | null;
  temperament?: string[];
  playStyles?: string[];
  location?: string;
  prompts?: { prompt: string; answer: string }[];
  distanceMiles: number;
  compat: CompatibilityResult;
  isDemo: boolean;
}

function milesBetween(a: DogProfile, b: DogProfile): number {
  // -1 sentinel: no coordinates — SwipeCard shows location string or "Nearby" instead.
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number') return -1;
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number') return -1;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return +(
    2 * earthRadiusMiles * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  ).toFixed(1);
}

function toFeedDog(baseDog: DogProfile, candidate: DogProfile, isDemo: boolean): DiscoverFeedDog {
  const distanceMiles = isDemo
    ? SEED_DISTANCES[candidate.name] ?? 1.2
    : milesBetween(baseDog, candidate);

  return {
    id: candidate.id,
    firestoreId: candidate.id,
    ownerId: candidate.ownerId,
    name: candidate.name,
    breed: candidate.breed,
    age: candidate.age,
    sex: candidate.sex,
    size: candidate.size,
    energyLevel: candidate.energyLevel,
    photos: candidate.photos,
    vaccinated: candidate.vaccinated,
    temperament: candidate.temperament,
    playStyles: candidate.playStyles,
    location: candidate.location,
    prompts: candidate.prompts,
    distanceMiles,
    compat: calculateCompatibility(baseDog, candidate, distanceMiles),
    isDemo,
  };
}

async function getSwipedDogIds(uid: string): Promise<Set<string>> {
  try {
    const { db } = getFirebase();
    const swipeSnap = await getDocs(collection(db, 'swipes', uid, 'decisions'));
    return new Set(swipeSnap.docs.map((docSnap) => docSnap.id));
  } catch {
    return new Set();
  }
}

async function getRealCandidateDogs(currentUserId: string): Promise<DogProfile[]> {
  try {
    const { db } = getFirebase();
    const dogsSnap = await getDocs(collection(db, 'dogs'));
    return dogsSnap.docs
      .map((docSnap) => {
        const saved = docSnap.data() as SavedDogProfile;
        const normalized: SavedDogProfile = {
          ...saved,
          playStyles: Array.isArray(saved.playStyles) ? saved.playStyles : [],
          photos: Array.isArray(saved.photos) ? saved.photos : [],
          temperament: Array.isArray(saved.temperament) ? saved.temperament : [],
        };
        return { id: docSnap.id, saved: normalized };
      })
      .filter(({ id, saved }) => {
        if (id === currentUserId) return false;
        if (id.startsWith('UID_')) return false;

        const hasMinimumFields =
          !!saved.name?.trim() &&
          !!saved.size &&
          typeof saved.energyLevel === 'number';

        return isProfileComplete(saved) || hasMinimumFields;
      })
      .map(({ id, saved }) => toFullProfile(saved, id));
  } catch {
    return [];
  }
}

function getSeedCandidateDogs(excludedIds: Set<string>): DogProfile[] {
  return SEED_DOGS
    .slice(1)
    .map((dog, index) => ({
      ...dog,
      id: `seed_${index + 1}`,
      ownerId: `seed_${index + 1}`,
      trustScore: 70,
      totalMeetups: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
    .filter((dog) => !excludedIds.has(dog.id));
}

// Guest feed — seed dogs only, no Firestore, no base-dog required.
// Used when no auth session exists so unauthenticated visitors can browse.
export function buildGuestFeed(): DiscoverFeedDog[] {
  const unscored: CompatibilityResult = {
    score: 0,
    quality: 'good',
    label: '',
    microcopy: '',
    reasons: [],
    warnings: [],
    breakdown: {
      breedScore: 0, sizeScore: 0, energyScore: 0,
      goodWithScore: 0, playStyleScore: 0,
      healthScore: 0, distanceScore: 0, penalty: 0,
    },
  };
  return getSeedCandidateDogs(new Set()).map((dog) => ({
    id:            dog.id,
    firestoreId:   dog.id,
    ownerId:       dog.ownerId,
    name:          dog.name,
    breed:         dog.breed,
    age:           dog.age,
    sex:           dog.sex,
    size:          dog.size,
    energyLevel:   dog.energyLevel,
    photos:        dog.photos,
    vaccinated:    dog.vaccinated,
    playStyles:    dog.playStyles,
    prompts:       dog.prompts,
    distanceMiles: SEED_DISTANCES[dog.name] ?? 1.2,
    compat:        unscored,
    isDemo:        true,
  }));
}

export async function buildDiscoverFeed(currentUserId: string, baseDog: DogProfile): Promise<DiscoverFeedDog[]> {
  const swipedIds = await getSwipedDogIds(currentUserId);
  const realDogs = (await getRealCandidateDogs(currentUserId))
    .filter((dog) => !swipedIds.has(dog.id))
    .map((dog) => toFeedDog(baseDog, dog, false))
    .sort((a, b) => b.compat.score - a.compat.score || a.distanceMiles - b.distanceMiles);

  const demoDogs = getSeedCandidateDogs(swipedIds)
    .map((dog) => toFeedDog(baseDog, dog, true))
    .sort((a, b) => b.compat.score - a.compat.score || a.distanceMiles - b.distanceMiles);

  const recycledDemoDogs = getSeedCandidateDogs(new Set())
    .map((dog) => toFeedDog(baseDog, dog, true))
    .sort((a, b) => b.compat.score - a.compat.score || a.distanceMiles - b.distanceMiles);

  if (realDogs.length === 0) {
    return demoDogs.length > 0 ? demoDogs : recycledDemoDogs;
  }

  return [...realDogs, ...(demoDogs.length > 0 ? demoDogs : recycledDemoDogs)];
}
