import { collection, getDocs } from 'firebase/firestore';
import { isProfileComplete, toFullProfile, type SavedDogProfile } from '../../shared/profile';
import { calculateCompatibility } from '../../shared/utils/matchingEngine';
import type { DogProfile } from '../../shared/types';
import { getFirebase } from './firebase';

export interface DiscoverDog {
  id: string;
  ownerId: string;
  name: string;
  breed: string;
  age: 'puppy' | 'adult' | 'senior';
  sex: 'M' | 'F';
  size: 'S' | 'M' | 'L' | 'XL';
  energyLevel: number;
  photos: string[];
  playStyles: string[];
  location: string;
  distanceMiles?: number;
  tagline: string;
}

function milesBetween(a: DogProfile, b: DogProfile): number {
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

async function getSwipedDogIds(uid: string): Promise<Set<string>> {
  try {
    const { db } = getFirebase();
    const swipeSnap = await getDocs(collection(db, 'swipes', uid, 'decisions'));
    return new Set(swipeSnap.docs.map((docSnap) => docSnap.id));
  } catch {
    return new Set();
  }
}

function normalizeSavedProfile(value: SavedDogProfile): SavedDogProfile {
  return {
    ...value,
    playStyles: Array.isArray(value.playStyles) ? value.playStyles : [],
    photos: Array.isArray(value.photos) ? value.photos.filter(Boolean) : [],
    temperament: Array.isArray(value.temperament) ? value.temperament : [],
    prompts: Array.isArray(value.prompts) ? value.prompts : [],
  };
}

export async function fetchDiscoverFeed(userId: string): Promise<DiscoverDog[]> {
  if (!userId) return [];

  const { db } = getFirebase();
  const currentSnap = await getDocs(collection(db, 'dogs'));
  const currentDoc = currentSnap.docs.find((docSnap) => docSnap.id === userId);
  if (!currentDoc) return [];

  const currentSaved = normalizeSavedProfile(currentDoc.data() as SavedDogProfile);
  if (!isProfileComplete(currentSaved)) return [];

  const baseDog = toFullProfile(currentSaved, userId);
  const swipedIds = await getSwipedDogIds(userId);

  return currentSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      saved: normalizeSavedProfile(docSnap.data() as SavedDogProfile),
    }))
    .filter(({ id, saved }) => {
      if (id === userId) return false;
      if (swipedIds.has(id)) return false;
      return isProfileComplete(saved);
    })
    .map(({ id, saved }) => {
      const dog = toFullProfile(saved, id);
      const distanceMiles = milesBetween(baseDog, dog);
      const compat = calculateCompatibility(baseDog, dog, distanceMiles > 0 ? distanceMiles : 1);
      const location =
        saved.location?.trim() ||
        (saved.city?.trim() && saved.state?.trim()
          ? `${saved.city.trim()}, ${saved.state.trim().toUpperCase()}`
          : saved.zip?.trim() || 'Nearby');

      return {
        id: dog.id,
        ownerId: dog.ownerId,
        name: dog.name,
        breed: dog.breed,
        age: dog.age,
        sex: dog.sex,
        size: dog.size,
        energyLevel: dog.energyLevel,
        photos: dog.photos,
        playStyles: dog.playStyles,
        location,
        distanceMiles: distanceMiles > 0 ? distanceMiles : undefined,
        tagline:
          dog.bio?.trim() ||
          dog.prompts?.find((prompt) => prompt.answer?.trim())?.answer?.trim() ||
          compat.microcopy,
      } satisfies DiscoverDog;
    })
    .sort((a, b) => {
      const distA = a.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const distB = b.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      return distA - distB || a.name.localeCompare(b.name);
    });
}
