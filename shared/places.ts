// shared/places.ts
// "Where we go": owners tag the vet, groomer, daycare, trainer or park they
// use, with one tap and no written reviews or star ratings. The server counts
// tags per place in a city and publishes a count only once at least
// PLACE_MIN_OWNERS distinct owners use it, so a count never points at one dog.
// Pure helpers shared by the apps; no imports, so the Cloud Functions copy
// (firebase/functions/src/placeKeys.ts, checked by shared/places.test.ts) can
// be a byte-for-byte mirror.

export type PlaceCategory = 'vet' | 'groomer' | 'daycare' | 'trainer' | 'park';

export const PLACE_CATEGORIES: Record<PlaceCategory, { label: string; emoji: string; noun: string }> = {
  vet: { label: 'Vet', emoji: '🩺', noun: 'vet' },
  groomer: { label: 'Groomer', emoji: '🛁', noun: 'groomer' },
  daycare: { label: 'Daycare / boarding', emoji: '🏡', noun: 'daycare or boarding place' },
  trainer: { label: 'Trainer', emoji: '🎓', noun: 'trainer' },
  park: { label: 'Favorite park', emoji: '🌳', noun: 'park' },
};

export const PLACE_CATEGORY_KEYS = Object.keys(PLACE_CATEGORIES) as PlaceCategory[];

/** A place shows a count only when this many distinct owners use it. */
export const PLACE_MIN_OWNERS = 3;
export const PLACE_NAME_MAX = 60;
/** Tags one owner may keep at a time. */
export const PLACE_MAX_TAGS_PER_OWNER = 20;

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === 'string' && value in PLACE_CATEGORIES;
}

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One id per city: 'austin-tx'. Doc ids use only [a-z0-9-_], so '__' is a safe separator. */
export function placeCityKey(city: string, state: string): string {
  return `${slug(city)}-${slug(state)}`;
}

/** The same place typed two ways ("Dr. Patel" / "dr patel") gets one id. */
export function placeIdFor(cityKey: string, category: PlaceCategory, name: string): string {
  return `${cityKey}__${category}__${slug(name)}`;
}

export function placeNameSlug(name: string): string {
  return slug(name);
}

/** "12 dogs nearby use Dr. Patel", or null while the count is private. */
export function nearbyLine(ownerCount: number | undefined | null, name: string): string | null {
  return typeof ownerCount === 'number' && ownerCount >= PLACE_MIN_OWNERS
    ? `${ownerCount} dogs nearby use ${name}`
    : null;
}

interface PackDayLike {
  id: string;
  placeName: string;
  status: string;
  startsAtMs: number;
}

export interface PackDayPark<T extends PackDayLike = PackDayLike> {
  slug: string;
  name: string;
  /** Pack Days that already happened here (cancelled ones don't count). */
  held: number;
  upcoming: T[];
}

/** Every Pack Day location is a park page: group events by place, soonest upcoming first. */
export function packDayParks<T extends PackDayLike>(events: T[], nowMs: number): Array<PackDayPark<T>> {
  const parks = new Map<string, PackDayPark<T>>();
  for (const event of events) {
    const key = slug(event.placeName);
    if (!key || event.status === 'cancelled') continue;
    const park = parks.get(key) ?? { slug: key, name: event.placeName.trim(), held: 0, upcoming: [] };
    if (event.startsAtMs > nowMs) park.upcoming.push(event);
    else park.held += 1;
    parks.set(key, park);
  }
  for (const park of parks.values()) park.upcoming.sort((a, b) => a.startsAtMs - b.startsAtMs);
  return [...parks.values()].sort((a, b) => b.held + b.upcoming.length - (a.held + a.upcoming.length));
}
