import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { isProfileComplete, toFullProfile, type SavedDogProfile } from '../../shared/profile';
import { calculateCompatibility } from '../../shared/utils/matchingEngine';
import type { CompatibilityResult, DogProfile } from '../../shared/types';
import { getFirebase } from './firebase';
import { getBlockedUserIds } from './blocks';
import { getRenderablePhotos } from './photos';

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
  temperament: string[];
  /** Owner-written prompt answers; unanswered prompts are already dropped. */
  prompts: { prompt: string; answer: string }[];
  /** What the card shows under the name: the neighbourhood, or 'Local match'. */
  location: string;
  /** The public city/state (or location text) when the owner gave one. Unset
   *  when there's nothing real to show, so a "Neighbourhood" row never reads
   *  'Local match'. */
  neighbourhood?: string;
  /** Unset when either dog has no coordinates. 0 is a real distance (both dogs
   *  in the same rounded ~1 km cell), not "unknown". */
  distanceMiles?: number;
  /** Owner's answer, attributed as such. null/undefined both mean not stated;
   *  false is an explicit no, which the engine turns into a 'blocked' tier. */
  vaccinated?: boolean | null;
  /** Owner-typed rabies certificate expiry, 'YYYY-MM-DD'. Read it through
   *  getVaccinationStatus, never with a raw Date comparison. */
  rabiesExpiry?: string | null;
  tagline: string;
  /** Vibe Check output for THIS dog (archetype, dog's-voice bio, breed read).
   *  Optional: dogs created before Vibe Check shipped, or whose generation
   *  failed, have none — consumers render nothing rather than a placeholder. */
  ai?: DogProfile['ai'];
  /** Owner's cover-photo pick, so the swipe card opens on the chosen hero. */
  coverPhotoIndex?: number | null;
  /** Owner-set focal point for that cover (0–100), so the crop keeps the subject. */
  coverFocusX?: number | null;
  coverFocusY?: number | null;
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

function publicNeighbourhood(saved: SavedDogProfile): string | undefined {
  const location = saved.location?.trim();
  // A ZIP-shaped location is a legacy value that toPublicSavedDogProfile would
  // strip today; treat it as absent rather than display it.
  if (location && !/^\d{5}(-\d{4})?$/.test(location)) return location;
  const city = saved.city?.trim();
  const state = saved.state?.trim();
  if (city && state) return `${city}, ${state.toUpperCase()}`;
  return undefined;
}

function toDiscoverDog(baseDog: DogProfile, id: string, saved: SavedDogProfile): DiscoverDog {
  const dog = toFullProfile(saved, id);
  // milesBetween() returns -1 when either side has no coordinates. That -1 goes
  // to the engine as-is (it scores an unknown distance as 0 proximity), the
  // same as web/lib/discover.ts. It used to be swapped for 1 mile here, which
  // handed every unlocated dog a proximity bonus it never earned.
  const distanceMiles = milesBetween(baseDog, dog);
  const distanceKnown = distanceMiles >= 0;
  const compat = calculateCompatibility(baseDog, dog, distanceMiles);
  // ZIP is stripped from the public dog doc (toPublicSavedDogProfile), so a
  // ZIP here would only ever come from a legacy doc. Never show it.
  const neighbourhood = publicNeighbourhood(saved);

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
    // Strip the '_placeholder_' padding token here — this is the boundary
    // where photos reach an <Image source={{uri}}>. Placeholders are only
    // ever appended AFTER the real photos, so a real photo's index (and
    // coverPhotoIndex, which points into it) never shifts.
    photos: getRenderablePhotos(dog.photos),
    playStyles: dog.playStyles,
    temperament: dog.temperament ?? [],
    prompts: (dog.prompts ?? []).filter(
      (prompt) => typeof prompt?.prompt === 'string' && typeof prompt?.answer === 'string' && prompt.answer.trim(),
    ),
    location: neighbourhood ?? 'Local match',
    neighbourhood,
    distanceMiles: distanceKnown ? distanceMiles : undefined,
    vaccinated: dog.vaccinated ?? null,
    rabiesExpiry: saved.rabiesExpiry ?? null,
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
    coverPhotoIndex: dog.coverPhotoIndex,
    coverFocusX: dog.coverFocusX,
    coverFocusY: dog.coverFocusY,
    compat,
  };
}

function normalizeSavedProfile(value: SavedDogProfile): SavedDogProfile {
  return {
    ...value,
    playStyles: Array.isArray(value.playStyles) ? value.playStyles : [],
    // Deliberately the RAW stored array. isProfileComplete() only counts
    // photos.length (shared/profile.ts) and both save paths PAD with the
    // '_placeholder_' token precisely to reach that minimum — so stripping
    // placeholders HERE would fail the completeness gate below and empty the
    // whole feed. Placeholders are stripped at the DiscoverDog boundary
    // instead, which is what actually reaches an <Image>.
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
    .map(({ id, saved }) => toDiscoverDog(baseDog, id, saved))
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
    // Nearest first, then the better fit — the same order as
    // web/lib/discover.ts's buildDiscoverFeed, so a person sees the same deck
    // on either surface. Unknown distances go last. This used to break ties
    // alphabetically, which put a weak fit ahead of a strong one for no reason.
    .sort((a, b) => {
      const distA = a.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const distB = b.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      return distA - distB || b.compat.score - a.compat.score;
    });

  return { dogs, radiusApplied: applyRadius };
}

/**
 * Re-read one dog's doc and recompute the pairing just before the match
 * pop-up shows it. Mirrors refreshCompat in web/app/app/page.tsx: the deck's
 * compat was computed when the feed loaded, and if the other owner changed
 * their vaccination answer, energy or size since, the pop-up would present
 * stale values as current — including the quality tier, which an explicit
 * "not vaccinated" flips to 'blocked' on its own. The distance isn't
 * recomputed; it rides along from feed time. Falls back to the cached dog on
 * any failure.
 */
export async function refreshDiscoverDog(
  viewerId: string,
  viewer: SavedDogProfile | null,
  dog: DiscoverDog,
): Promise<DiscoverDog> {
  if (!viewerId || !viewer) return dog;
  try {
    const { db } = getFirebase();
    const snap = await getDoc(doc(db, 'dogs', dog.id));
    if (!snap.exists()) return dog;
    const fresh = toFullProfile(normalizeSavedProfile(snap.data() as SavedDogProfile), dog.id);
    const baseDog = toFullProfile(normalizeSavedProfile(viewer), viewerId);
    return {
      ...dog,
      vaccinated: fresh.vaccinated ?? null,
      rabiesExpiry: fresh.rabiesExpiry ?? null,
      compat: calculateCompatibility(baseDog, fresh, dog.distanceMiles ?? -1),
    };
  } catch {
    return dog;
  }
}
