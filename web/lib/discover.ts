// web/lib/discover.ts
// Feed helpers for real-user discovery with demo-profile fallback.

import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { SEED_DOGS, SEED_DISTANCES } from '../../shared/data/seedDogs';
import { calculateCompatibility, cautionCountOf } from '../../shared/utils/matchingEngine';
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
  /** Owner-written About line (shared/dogLabels dogAboutText picks it over the AI line). */
  bio?: string;
  distanceMiles: number;
  /** How we know this dog is close: a measured distance within the radius, the
   *  same city, or only the same state. A dog is never shown as "nearby" on less. */
  locality: 'near' | 'city' | 'state';
  compat: CompatibilityResult;
  isDemo: boolean;
}

// ── Labels shared by the card, the details sheet and the match modal ───────────
const SIZE_LABELS: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'XL' };
const SEX_LABELS: Record<string, string> = { M: 'Male', F: 'Female' };
const AGE_LABELS: Record<string, string> = { puppy: 'Puppy', adult: 'Adult', senior: 'Senior' };

/** "M" is Medium, never Male: size and sex are separate words on every surface. */
export function sizeLabel(size: string | undefined | null): string {
  return (size && SIZE_LABELS[size]) || size || '';
}
export function sexLabel(sex: string | undefined | null): string {
  return (sex && SEX_LABELS[sex]) || '';
}
export function ageLabel(age: string | undefined | null): string {
  return (age && AGE_LABELS[age]) || age || '';
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

function toFeedDog(
  baseDog: DogProfile,
  candidate: DogProfile,
  isDemo: boolean,
  locality: DiscoverFeedDog['locality'] = 'near',
): DiscoverFeedDog {
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
      : 'Location not shared');

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
    bio: candidate.bio,
    distanceMiles,
    locality,
    compat: calculateCompatibility(baseDog, candidate, distanceMiles),
    isDemo,
  };
}

// ── Reads are bounded and cached ────────────────────────────────────────────────
// This used to read the WHOLE `dogs` collection (and the person's whole swipe
// history) on every mount, window focus, tab-visible and return to Discover. At 570
// dogs that is 1.9 MB a time, at 2,000 dogs 4.7 MB; a thousand daily users would
// cost real money in reads for a deck that changes a few times a day. Now:
//   - dogs are queried by the viewer's state (limit STATE_QUERY_LIMIT), plus a latitude band
//     when the viewer has coordinates, so a neighbour across a state line is still found
//     (the band is a coarse box, the exact radius is applied after);
//   - the result is reused for DISCOVER_CACHE_TTL_MS, whatever the tab does;
//   - swipes made in this session are remembered locally instead of re-read.
export const DISCOVER_CACHE_TTL_MS = 10 * 60 * 1000;
const STATE_QUERY_LIMIT = 300;
const BAND_QUERY_LIMIT = 60;
// The widest radius the control offers, so changing it never needs another read.
const BAND_MILES = 100;
const MILES_PER_DEGREE_LAT = 69;

type Candidate = DogProfile & { city?: string; state?: string };

interface CandidateCache {
  key: string;
  at: number;
  dogs: Candidate[];
}
let candidateCache: CandidateCache | null = null;
let candidateInflight: { key: string; promise: Promise<CandidateCache> } | null = null;

interface SwipedCache { uid: string; at: number; ids: Set<string> }
let swipedCache: SwipedCache | null = null;

/** Milliseconds since the candidate dogs were last read from the server (Infinity if never). */
export function discoverCacheAgeMs(): number {
  return candidateCache ? Date.now() - candidateCache.at : Infinity;
}

/** Forget everything cached (sign-out, or a person asking for a fresh look). */
export function resetDiscoverCache(): void {
  candidateCache = null;
  candidateInflight = null;
  swipedCache = null;
}

/** A swipe made in this session: keeps the dog out of the deck without re-reading history. */
export function rememberSwipe(uid: string, dogId: string): void {
  if (swipedCache && swipedCache.uid === uid) swipedCache.ids.add(dogId);
}

async function getSwipedDogIds(uid: string, force: boolean): Promise<Set<string>> {
  if (!force && swipedCache && swipedCache.uid === uid && Date.now() - swipedCache.at < DISCOVER_CACHE_TTL_MS) {
    return swipedCache.ids;
  }
  try {
    const { db } = getFirebase();
    const swipeSnap = await getDocs(collection(db, 'swipes', uid, 'decisions'));
    const ids = new Set(swipeSnap.docs.map((docSnap) => docSnap.id));
    // Anything swiped while this read was in flight is already in the old cache.
    if (swipedCache && swipedCache.uid === uid) swipedCache.ids.forEach((id) => ids.add(id));
    swipedCache = { uid, at: Date.now(), ids };
    return ids;
  } catch {
    return swipedCache && swipedCache.uid === uid ? swipedCache.ids : new Set();
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

interface ViewerPlace {
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
}

function normPlace(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** City/state out of a "City, ST" display location, for callers that only hold a DogProfile. */
function placeFromLocation(location: string | undefined): { city?: string; state?: string } {
  const text = (location ?? '').trim();
  const comma = text.lastIndexOf(',');
  if (comma < 1) return {};
  const state = text.slice(comma + 1).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? { city: text.slice(0, comma).trim(), state } : {};
}

function toCandidate(id: string, data: SavedDogProfile): Candidate | null {
  if (id.startsWith('UID_')) return null;
  if (isSeedUserId(id)) return null;
  const normalized: SavedDogProfile = {
    ...data,
    playStyles: Array.isArray(data.playStyles) ? data.playStyles : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
    temperament: Array.isArray(data.temperament) ? data.temperament : [],
  };
  // Strict completeness only. The previous looser fallback
  // (name + size + energyLevel) admitted photoless profiles, which
  // looked broken in the deck. Mobile already required strict
  // isProfileComplete, so this aligns the two surfaces.
  // Note: isProfileComplete now treats lat/lng as a valid location,
  // so ZIP-only profiles that have granted geolocation still pass.
  if (!isProfileComplete(normalized)) return null;
  return {
    ...toFullProfile(normalized, id),
    city: normalized.city?.trim() || undefined,
    state: normalized.state?.trim().toUpperCase() || undefined,
  };
}

// Throws if the dogs can't be read. This used to swallow the error and return
// [], which the caller can't tell apart from "nobody nearby" — so a dropped
// connection on a window-focus refresh replaced the deck with "The
// neighborhood's still quiet".
async function readCandidateDogs(currentUserId: string, viewer: ViewerPlace): Promise<Candidate[]> {
  const { db } = getFirebase();
  const dogsRef = collection(db, 'dogs');
  const queries = [];
  if (viewer.state) {
    queries.push(query(dogsRef, where('state', '==', viewer.state), limit(STATE_QUERY_LIMIT)));
  }
  if (typeof viewer.lat === 'number' && typeof viewer.lng === 'number') {
    const dLat = BAND_MILES / MILES_PER_DEGREE_LAT;
    queries.push(
      query(dogsRef, where('lat', '>=', viewer.lat - dLat), where('lat', '<=', viewer.lat + dLat), limit(BAND_QUERY_LIMIT)),
    );
  }
  // No state and no coordinates: nothing we can honestly call "near", so nothing to read.
  if (queries.length === 0) return [];

  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  // Offline, getDocs doesn't reject: it resolves with whatever the in-memory
  // cache holds for this query — usually nothing. Treat "answered from cache
  // only" as a failed read.
  if (snaps.some((snap) => snap.metadata.fromCache)) throw new Error('Could not reach the server to list dogs');

  const byId = new Map<string, Candidate>();
  for (const snap of snaps) {
    for (const docSnap of snap.docs) {
      if (docSnap.id === currentUserId || byId.has(docSnap.id)) continue;
      const candidate = toCandidate(docSnap.id, docSnap.data() as SavedDogProfile);
      if (candidate) byId.set(docSnap.id, candidate);
    }
  }
  return [...byId.values()];
}

async function getCandidateDogs(currentUserId: string, viewer: ViewerPlace, force: boolean): Promise<CandidateCache> {
  // lat is bucketed to the band so a re-saved, slightly different coordinate reuses the cache.
  const latKey = typeof viewer.lat === 'number' ? Math.round(viewer.lat) : 'x';
  const key = `${currentUserId}|${viewer.state ?? ''}|${latKey}`;
  if (!force && candidateCache && candidateCache.key === key && Date.now() - candidateCache.at < DISCOVER_CACHE_TTL_MS) {
    return candidateCache;
  }
  if (candidateInflight && candidateInflight.key === key) return candidateInflight.promise;

  const promise = readCandidateDogs(currentUserId, viewer).then((dogs) => {
    const fresh = { key, at: Date.now(), dogs };
    candidateCache = fresh;
    return fresh;
  });
  candidateInflight = { key, promise };
  try {
    return await promise;
  } finally {
    if (candidateInflight && candidateInflight.promise === promise) candidateInflight = null;
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

// Same radius the mobile deck uses (mobile/lib/discover.ts), so a person sees
// the same neighbours on either surface.
export const DEFAULT_DISCOVER_RADIUS_MILES = 50;
export const DISCOVER_RADIUS_OPTIONS = [10, 25, 50, 100] as const;

export interface DiscoverDeckOptions {
  radiusMiles?: number;
  /** The viewer's city/state. Falls back to parsing "City, ST" from baseDog.location. */
  city?: string;
  state?: string;
  /** Skip the 10-minute cache (an explicit "Check again"). */
  force?: boolean;
}

export interface DiscoverDeck {
  /** Unseen, unblocked dogs in range, conflicts last, otherwise nearest first. */
  dogs: DiscoverFeedDog[];
  /** What "near" means for this viewer: measured distance, their city (and state), their state, or unknown. */
  scope: 'radius' | 'city' | 'state' | 'none';
  radiusMiles: number | null;
  viewerCity?: string;
  viewerState?: string;
  /** Dogs in range before removing the ones already swiped: "you've seen all N". */
  inRangeCount: number;
  /** Of those, the ones the person already swiped. */
  seenCount: number;
  /** Dogs with a measured distance beyond the radius (a wider radius would show them). */
  beyondRadiusCount: number;
  /** Real dogs found for the viewer's state/area at all (any distance). */
  candidateCount: number;
  /** When the dog list was read from the server. */
  fetchedAt: number;
}

const LOCALITY_ORDER: Record<DiscoverFeedDog['locality'], number> = { near: 0, city: 1, state: 2 };

// Real matches only. Previously fell back to recycling all 15 (mostly
// photoless) seed dogs into the live swipeable deck whenever real density
// ran out — see buildDemoGalleryDogs for where that content now lives
// instead: a labeled, non-swipeable showcase, never presented as if it
// could reciprocate a like.
//
// Local first, and honest about what "local" is known to mean:
//   1. a measured distance within the radius (both dogs have coordinates);
//   2. otherwise the same city, then the same state, said as such on the card.
// A dog that shares neither the city/state nor a measured distance is NOT shown —
// with location permission denied, a Missoula dog used to be offered an
// Albuquerque dog "at an unknown distance" as a match.
// Declared limits (D3: warn first, rank lower, never hide): dogs whose limits clash
// with the viewer's dog, or that clash with the viewer's own limits, sink to the end of
// the deck; nobody is removed, and nearest-first stays the base order.
export async function loadDiscoverDeck(
  currentUserId: string,
  baseDog: DogProfile,
  opts: DiscoverDeckOptions = {},
): Promise<DiscoverDeck> {
  const radiusMiles = opts.radiusMiles ?? DEFAULT_DISCOVER_RADIUS_MILES;
  const fromLocation = placeFromLocation(baseDog.location);
  const viewerCity = (opts.city ?? fromLocation.city)?.trim() || undefined;
  const viewerState = (opts.state ?? fromLocation.state)?.trim().toUpperCase() || undefined;
  const hasCoords = typeof baseDog.lat === 'number' && typeof baseDog.lng === 'number';
  const force = Boolean(opts.force);

  const [candidates, swipedIds, blockedIds] = await Promise.all([
    getCandidateDogs(
      currentUserId,
      { city: viewerCity, state: viewerState, lat: hasCoords ? baseDog.lat : undefined, lng: hasCoords ? baseDog.lng : undefined },
      force,
    ),
    getSwipedDogIds(currentUserId, force),
    getBlockedUserIds(currentUserId),
  ]);

  const isKnown = (miles: number) => typeof miles === 'number' && miles >= 0;
  let beyondRadiusCount = 0;
  let seenCount = 0;
  const inRange: DiscoverFeedDog[] = [];

  for (const dog of candidates.dogs) {
    if (blockedIds.has(dog.id)) continue;
    if (dog.memorialSince) continue; // a dog that has passed away is never offered as a match
    const miles = milesBetween(baseDog, dog);
    let locality: DiscoverFeedDog['locality'] | null = null;
    if (isKnown(miles)) {
      if (miles <= radiusMiles) locality = 'near';
      else beyondRadiusCount += 1;
    } else if (viewerState && normPlace(dog.state) === normPlace(viewerState)) {
      locality = viewerCity && normPlace(dog.city) === normPlace(viewerCity) ? 'city' : 'state';
    }
    if (!locality) continue;
    if (swipedIds.has(dog.id)) {
      seenCount += 1;
      continue;
    }
    inRange.push(toFeedDog(baseDog, dog, false, locality));
  }

  const rank = (miles: number) => (isKnown(miles) ? miles : Number.MAX_SAFE_INTEGER);
  const conflicts = (dog: DiscoverFeedDog) => (cautionCountOf(dog.compat) > 0 ? 1 : 0);
  inRange.sort(
    (a, b) =>
      conflicts(a) - conflicts(b) ||
      LOCALITY_ORDER[a.locality] - LOCALITY_ORDER[b.locality] ||
      rank(a.distanceMiles) - rank(b.distanceMiles) ||
      b.compat.score - a.compat.score,
  );

  return {
    dogs: inRange,
    scope: hasCoords ? 'radius' : viewerState ? (viewerCity ? 'city' : 'state') : 'none',
    radiusMiles: hasCoords ? radiusMiles : null,
    viewerCity,
    viewerState,
    inRangeCount: inRange.length + seenCount,
    seenCount,
    beyondRadiusCount,
    candidateCount: candidates.dogs.length,
    fetchedAt: candidates.at,
  };
}

/** The deck's dogs only (kept for callers that don't need the counts). */
export async function buildDiscoverFeed(
  currentUserId: string,
  baseDog: DogProfile,
  radiusMiles: number = DEFAULT_DISCOVER_RADIUS_MILES,
): Promise<DiscoverFeedDog[]> {
  return (await loadDiscoverDeck(currentUserId, baseDog, { radiusMiles })).dogs;
}
