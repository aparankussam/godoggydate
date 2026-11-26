// firebase/functions/src/lostDogLogic.ts
// The pure parts of the lost dog alert push (who hears about it, in what order,
// who is thanked). No imports, so shared/lostDogAudience.test.ts can run it under
// plain node. The Firestore and push work is in ./lostDog.

export const CITY_AUDIENCE_CAP = 500;
/** How far from where the dog was lost a member is "nearby". Most lost dogs are found within a mile or two. */
export const NEARBY_MILES = 5;
/** Latitude half-window for the nearby query: 5 miles is about 0.073 degrees. */
export const NEARBY_LAT_WINDOW = 0.075;

/** Straight-line miles between two points (haversine). */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Members whose dog is within `miles` of the pin, nearest first. Skips anyone without numeric coordinates. */
export function nearbyMembers(
  dogs: Array<{ id: string; lat?: unknown; lng?: unknown }>,
  pin: { lat: number; lng: number },
  miles: number = NEARBY_MILES,
): string[] {
  return dogs
    .filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number')
    .map((d) => ({ id: d.id, miles: milesBetween(pin, { lat: d.lat as number, lng: d.lng as number }) }))
    .filter((d) => d.miles <= miles)
    .sort((a, b) => a.miles - b.miles)
    .map((d) => d.id);
}

export interface AudienceInput {
  ownerId: string;
  /** The owner's matches (the other side of each match). */
  matchPartners: string[];
  /** People who joined a Pack Day in the owner's city. */
  packDayAttendees: string[];
  /** Everyone whose dog profile is in the owner's city. */
  cityMembers: string[];
  /** Members within NEARBY_MILES of where the dog was lost, nearest first (empty without a pin). */
  nearbyMembers?: string[];
  /** False when the owner already raised an alert in the last day: their Pack and
   *  Pack Day people are still told, the rest of the city is not. */
  broadcast: boolean;
}

export interface Audience {
  /** Told straight away: the owner's matches, then Pack Day attendees. */
  first: string[];
  /** Told after: the rest of the city. */
  rest: string[];
}

function unique(list: string[], skip: Set<string>): string[] {
  const out: string[] = [];
  for (const uid of list) {
    if (uid && !skip.has(uid)) { skip.add(uid); out.push(uid); }
  }
  return out;
}

export function planAudience(input: AudienceInput): Audience {
  const seen = new Set<string>([input.ownerId]);
  // People closest to where the dog went missing are the likeliest to see it,
  // whatever city that is, so they are told first along with the owner's Pack.
  const first = unique([...(input.nearbyMembers ?? []), ...input.matchPartners, ...input.packDayAttendees], seen);
  const rest = input.broadcast ? unique(input.cityMembers, seen).slice(0, CITY_AUDIENCE_CAP) : [];
  return { first, rest };
}

/** Signed-in people who reported a sighting, once each, never the owner. */
export function helpersToThank(sightings: Array<{ reporterUid?: unknown }>, ownerId: string): string[] {
  return unique(
    sightings.map((s) => (typeof s.reporterUid === 'string' ? s.reporterUid : '')),
    new Set<string>([ownerId]),
  );
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
