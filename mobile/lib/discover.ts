import { collection, getDocs } from 'firebase/firestore';
import { isProfileComplete, toFullProfile, type SavedDogProfile } from '../../shared/profile';
import { calculateCompatibility } from '../../shared/utils/matchingEngine';
import type { CompatibilityResult, DogProfile } from '../../shared/types';
import { getFirebase } from './firebase';
import { getBlockedUserIds } from './blocks';

export interface DiscoverDog {
  id: string;
  ownerId: string;
  createdAt?: number;
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
  /** Vibe Check output for THIS dog (archetype, dog's-voice bio, breed read).
   *  Optional: dogs created before Vibe Check shipped, or whose generation
   *  failed, have none — consumers render nothing rather than a placeholder. */
  ai?: DogProfile['ai'];
  compat: CompatibilityResult;
}

export const DEFAULT_DISCOVER_RADIUS_MILES = 50;

export interface FetchDiscoverFeedOptions {
  radiusMiles?: number;
}

export interface DiscoverFeedResult {
  dogs: DiscoverDog[];
  radiusApplied: boolean;
}

function isSeedUserId(id: string): boolean {
  return id.startsWith('user_seed_');
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

export async function fetchDiscoverFeed(
  userId: string,
  options: FetchDiscoverFeedOptions = {},
): Promise<DiscoverFeedResult> {
  if (!userId) return { dogs: [], radiusApplied: false };

  const { db } = getFirebase();
  const currentSnap = await getDocs(collection(db, 'dogs'));
  const currentDoc = currentSnap.docs.find((docSnap) => docSnap.id === userId);
  if (!currentDoc) return { dogs: [], radiusApplied: false };

  const currentSaved = normalizeSavedProfile(currentDoc.data() as SavedDogProfile);
  if (!isProfileComplete(currentSaved)) return { dogs: [], radiusApplied: false };

  const baseDog = toFullProfile(currentSaved, userId);
  const [swipedIds, blockedIds] = await Promise.all([
    getSwipedDogIds(userId),
    getBlockedUserIds(userId),
  ]);

  const baseHasCoords = typeof baseDog.lat === 'number' && typeof baseDog.lng === 'number';
  const radiusMiles = options.radiusMiles ?? DEFAULT_DISCOVER_RADIUS_MILES;
  const applyRadius = baseHasCoords && radiusMiles > 0;

  const dogs = currentSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      saved: normalizeSavedProfile(docSnap.data() as SavedDogProfile),
    }))
    .filter(({ id, saved }) => {
      if (id === userId) return false;
      if (isSeedUserId(id)) return false;
      if (swipedIds.has(id)) return false;
      if (blockedIds.has(id)) return false;
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
          : saved.zip?.trim() || 'Local match');

      return {
        id: dog.id,
        ownerId: dog.ownerId,
        createdAt: dog.createdAt,
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
        // dog.bio is never populated for real dogs — toFullProfile doesn't
        // set it — so this chain always fell through to a prompt or the
        // engine's microcopy. The Vibe Check bio IS the dog's-voice line
        // this was reaching for, and it was sitting unused on dog.ai.
        tagline:
          dog.ai?.vibeCheck?.bio?.trim() ||
          dog.bio?.trim() ||
          dog.prompts?.find((prompt) => prompt.answer?.trim())?.answer?.trim() ||
          compat.microcopy,
        ai: dog.ai,
        compat,
      } satisfies DiscoverDog;
    })
    .filter((dog) => {
      if (!applyRadius) return true;
      // Keep candidates whose distance is unknown (e.g. web-created profiles
      // that have city/state but no lat/lng yet). They sort to the end of the
      // deck and the card shows their city/state via getLocationLabel.
      // Without this, a mobile user with coords never sees a web-created
      // profile in the same area.
      if (typeof dog.distanceMiles !== 'number') return true;
      return dog.distanceMiles <= radiusMiles;
    })
    .sort((a, b) => {
      const distA = a.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const distB = b.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      return distA - distB || a.name.localeCompare(b.name);
    });

  return { dogs, radiusApplied: applyRadius };
}
