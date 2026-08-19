// web/lib/discover.ts
// Feed helpers for real-user discovery with demo-profile fallback.

import { collection, getDocs } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { SEED_DOGS, SEED_DISTANCES } from '../../shared/data/seedDogs';
import { calculateCompatibility } from '../../shared/utils/matchingEngine';
import { isProfileComplete, toFullProfile } from './auth';
import { getBlockedUserIds } from './blocks';
import type { SavedDogProfile } from './auth';
import type { DogProfile, CompatibilityResult } from '../../shared/types';

export interface DiscoverFeedDog {
  id: string;
  firestoreId: string;
  ownerId: string;
  createdAt?: number;
  name: string;
  breed: string;
  age: string;
  sex: string;
  size: string;
  energyLevel: number;
  photos?: string[];
  vaccinated?: boolean | null;
  /** Owner-typed rabies expiry, 'YYYY-MM-DD'. Usually absent. Consumers must
   *  render it via getVaccinationStatus (shared/profile.ts) rather than
   *  reading the boolean above on its own — the boolean predates this field
   *  and was defaulted to true for every dog that ever saved a profile. */
  rabiesExpiry?: string;
  temperament?: string[];
  playStyles?: string[];
  location?: string;
  prompts?: { prompt: string; answer: string }[];
  /** Owner's cover photo pick + focal crop (0–100), so the swipe card opens on
   *  the chosen hero instead of photos[0]. */
  coverPhotoIndex?: number | null;
  coverFocusX?: number | null;
  coverFocusY?: number | null;
  /** Vibe Check output for THIS dog (archetype, dog's-voice bio, breed read).
   *  Optional: dogs created before Vibe Check shipped, or whose generation
   *  failed, have none — every consumer must render nothing rather than a
   *  placeholder. */
  ai?: DogProfile['ai'];
  distanceMiles: number;
  compat: CompatibilityResult;
  isDemo: boolean;
}

function isSeedUserId(id: string): boolean {
  return id.startsWith('user_seed_');
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
  const candidateWithAddress = candidate as DogProfile & {
    city?: string;
    state?: string;
    zip?: string;
  };
  const location =
    candidate.location?.trim() ||
    (candidateWithAddress.city?.trim() && candidateWithAddress.state?.trim()
      ? `${candidateWithAddress.city.trim()}, ${candidateWithAddress.state.trim().toUpperCase()}`
      : candidateWithAddress.zip?.trim() || 'Local match');

  return {
    id: candidate.id,
    firestoreId: candidate.id,
    ownerId: candidate.ownerId,
    createdAt: candidate.createdAt,
    name: candidate.name,
    breed: candidate.breed,
    age: candidate.age,
    sex: candidate.sex,
    size: candidate.size,
    energyLevel: candidate.energyLevel,
    photos: candidate.photos,
    vaccinated: candidate.vaccinated,
    rabiesExpiry: candidate.rabiesExpiry,
    temperament: candidate.temperament,
    playStyles: candidate.playStyles,
    location,
    prompts: candidate.prompts,
    // Owner's cover pick + crop — so the swipe card opens on the photo they
    // chose, focally cropped, instead of always photos[0] at a centre crop.
    coverPhotoIndex: candidate.coverPhotoIndex,
    coverFocusX: candidate.coverFocusX,
    coverFocusY: candidate.coverFocusY,
    // The dog's Vibe Check identity. toFullProfile() has always carried this
    // through (shared/profile.ts), and it was dropped here — so the app's
    // most distinctive content was invisible on the one screen where you
    // decide whether you like a dog, and only appeared after a mutual match.
    ai: candidate.ai,
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

// Demo/seed swipes are never written to Firestore (seed profiles have no
// owning account), so they're tracked locally to keep already-seen demo dogs
// out of the deck on reload.
const DEMO_SWIPES_KEY = 'godoggydate.demoSwipedIds';

export function recordDemoSwipeLocally(dogId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = new Set<string>(JSON.parse(window.localStorage.getItem(DEMO_SWIPES_KEY) ?? '[]'));
    existing.add(dogId);
    window.localStorage.setItem(DEMO_SWIPES_KEY, JSON.stringify([...existing]));
  } catch { /* storage unavailable — demo dogs just reappear */ }
}

function getLocallySwipedDemoIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(DEMO_SWIPES_KEY) ?? '[]'));
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
        if (isSeedUserId(id)) return false;

        // Strict completeness only. The previous looser fallback
        // (name + size + energyLevel) admitted photoless profiles, which
        // looked broken in the deck. Mobile already required strict
        // isProfileComplete, so this aligns the two surfaces.
        // Note: isProfileComplete now treats lat/lng as a valid location,
        // so ZIP-only profiles that have granted geolocation still pass.
        return isProfileComplete(saved);
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

// Non-interactive demo/showcase dogs — "See how matching works". Never
// swipeable and never mixed into a real feed: 13 of the 15 seed dogs have
// photos: [] (a photo-first swipe app showing an emoji-on-gradient card for
// 87% of "matches"), and every like on one silently produced a "this is a
// demo profile" toast — the single biggest authenticity liability in the
// product for an audience whose core competency is detecting fakes. These
// still exist as a labeled, honest "here's what matching would look like"
// gallery, computed against the viewer's own dog when known.
export function buildDemoGalleryDogs(baseDog?: DogProfile): DiscoverFeedDog[] {
  const dogs = getSeedCandidateDogs(new Set());
  // Every dog is scored, always. This used to substitute a hardcoded zeroed
  // CompatibilityResult whenever baseDog was undefined — i.e. for every
  // signed-out visitor, which is the entire audience the demo exists for.
  // The result was that "see how matching works" showed a photo grid to
  // strangers and the working engine only to people who had already signed
  // up. Guests now get scored against an explicitly-labeled sample dog
  // (buildDemoViewerDog) that they can adjust, so the demo shows the
  // mechanism rather than a verdict.
  const viewer = baseDog ?? buildDemoViewerDog();
  return dogs
    .map((dog) => toFeedDog(viewer, dog, true))
    .sort((a, b) => b.compat.score - a.compat.score || a.distanceMiles - b.distanceMiles);
}

/**
 * A stand-in "your dog" for signed-out visitors playing with the demo.
 *
 * Deliberately a plausible middle-of-the-road dog: medium, moderately
 * energetic, no restrictions — so the seed cast produces a spread of
 * verdicts (some perfect, some slow-intro, some blocked) rather than
 * clustering at one end and making the engine look like it always says the
 * same thing. Overrides let the demo's controls move size and energy and
 * re-score live, which is what actually demonstrates that the score is
 * caused by the inputs.
 *
 * Never written to Firestore and never presented as a real dog.
 */
export function buildDemoViewerDog(overrides: Partial<DogProfile> = {}): DogProfile {
  return {
    id:          'demo-viewer',
    ownerId:     'demo-viewer',
    name:        'your dog',
    breed:       'Mixed Breed',
    purebred:    false,
    size:        'M',
    age:         'adult',
    sex:         'female',
    fixed:       true,
    energyLevel: 60,
    photos:      [],
    goodWith:    ['all dogs'],
    notGoodWith: [],
    playStyles:  ['loves fetch 🎾', 'gentle play 🐾'],
    boundaries:  [],
    allergies:   [],
    vaccinated:  true,
    vetChecked:  true,
    ...overrides,
  } as DogProfile;
}

// Real matches only. Previously fell back to recycling all 15 (mostly
// photoless) seed dogs into the live swipeable deck whenever real density
// ran out — see buildDemoGalleryDogs for where that content now lives
// instead: a labeled, non-swipeable showcase, never presented as if it
// could reciprocate a like.
export async function buildDiscoverFeed(currentUserId: string, baseDog: DogProfile): Promise<DiscoverFeedDog[]> {
  const [swipedIds, blockedIds] = await Promise.all([
    getSwipedDogIds(currentUserId),
    getBlockedUserIds(currentUserId),
  ]);
  return (await getRealCandidateDogs(currentUserId))
    .filter((dog) => !swipedIds.has(dog.id) && !blockedIds.has(dog.id))
    .map((dog) => toFeedDog(baseDog, dog, false))
    .sort((a, b) => b.compat.score - a.compat.score || a.distanceMiles - b.distanceMiles);
}
