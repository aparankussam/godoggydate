// firebase/functions/src/lostDogLogic.ts
// The pure parts of the lost dog alert push (who hears about it, in what order,
// who is thanked). No imports, so shared/lostDogAudience.test.ts can run it under
// plain node. The Firestore and push work is in ./lostDog.

export const CITY_AUDIENCE_CAP = 500;

export interface AudienceInput {
  ownerId: string;
  /** The owner's matches (the other side of each match). */
  matchPartners: string[];
  /** People who joined a Pack Day in the owner's city. */
  packDayAttendees: string[];
  /** Everyone whose dog profile is in the owner's city. */
  cityMembers: string[];
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
  const first = unique([...input.matchPartners, ...input.packDayAttendees], seen);
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
