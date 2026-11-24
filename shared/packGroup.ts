// shared/packGroup.ts
// Recurring Pack Day groups: a standing group (packGroups/{id}) whose weekly /
// biweekly / monthly meetups are generated into packDays/ with a `groupId`, so
// RSVP, capacity, map, share, report and rules all work unchanged. Types,
// limits, copy and pure helpers. firebase/functions/src/packGroups.ts enforces
// the same limits (it can't import this file; shared/packGroup.test.ts checks
// the schedule math it shares agrees).

import { detectUnsafePairings } from './utils/matchingEngine';
import type { DogProfile } from './types';
import type { PackDayFormat } from './packDay';

export type PackGroupFrequency = 'weekly' | 'biweekly' | 'monthly';
export type PackGroupStatus = 'active' | 'paused';

export const PACK_GROUP_FREQUENCY_LABELS: Record<PackGroupFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every two weeks',
  monthly: 'Every month',
};

export const PACK_GROUP_LIMITS = {
  maxNameLength: 50,
  maxTags: 3,
  maxTagLength: 24,
  maxMembers: 200,
  /** Groups (active or paused) one host may run at a time. */
  maxPerHost: 3,
} as const;

/** One-tap tags for breed / interest meetups; hosts can add one of their own. */
export const PACK_GROUP_TAG_SUGGESTIONS = [
  'Dachshund',
  'Puppy social',
  'Small dogs only',
  'Senior dogs',
  'Shy dogs',
  'Doodles',
] as const;

export interface PackGroup {
  id: string;
  name: string;
  hostUid: string;
  hostDogName: string;
  city: string;
  state: string;
  placeName: string;
  note: string;
  format: PackDayFormat;
  tags: string[];
  /** Occurrences only accept small dogs (enforced by rsvpPackDay). */
  smallDogsOnly: boolean;
  capacity: number;
  durationMinutes: number;
  frequency: PackGroupFrequency;
  /** 0 = Sunday. */
  weekday: number;
  localTime: string;
  timeZone: string;
  status: PackGroupStatus;
  /** Includes the host. */
  memberUids: string[];
  /** Removed by the host; can't rejoin. */
  removedUids: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Every Sunday · 9:00 AM", "Every other Sunday · 9:00 AM", "Monthly on Sundays · 9:00 AM". */
export function packGroupScheduleLabel(
  group: Pick<PackGroup, 'frequency' | 'weekday' | 'localTime'>,
): string {
  const day = DAY_NAMES[group.weekday] ?? '';
  const [h, m] = group.localTime.split(':').map(Number);
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const when =
    group.frequency === 'weekly' ? `Every ${day}` : group.frequency === 'biweekly' ? `Every other ${day}` : `Monthly on ${day}s`;
  return `${when} · ${time}`;
}

/** "4 small, 2 large, 1 puppy". Medium dogs are counted too ("3 medium") so the
 *  numbers add up; puppies are counted on top of their size, since a small
 *  puppy is both. Empty string for no dogs. */
export function dogMixLine(dogs: readonly Pick<DogProfile, 'size' | 'age'>[]): string {
  const small = dogs.filter((d) => d.size === 'S').length;
  const medium = dogs.filter((d) => d.size === 'M').length;
  const large = dogs.filter((d) => d.size === 'L' || d.size === 'XL').length;
  const puppies = dogs.filter((d) => d.age === 'puppy').length;
  return [
    small && `${small} small`,
    medium && `${medium} medium`,
    large && `${large} large`,
    puppies && `${puppies} ${puppies === 1 ? 'puppy' : 'puppies'}`,
  ].filter(Boolean).join(', ');
}

/** How many dogs in the group have a stated limit that another dog there trips
 *  (via detectUnsafePairings), e.g. "prefers no small dogs" next to a small
 *  dog. Needs full profiles; callers pass what they could read. */
export function dogsWithCautions(dogs: readonly DogProfile[]): number {
  const flagged = new Set<number>();
  dogs.forEach((a, i) => {
    dogs.forEach((b, j) => {
      if (i !== j && detectUnsafePairings(a, b).length > 0) flagged.add(j);
    });
  });
  return flagged.size;
}

/** The line shown on an occurrence: the mix, plus a heads-up when needed. */
export function dogMixSummary(dogs: readonly DogProfile[]): string {
  const line = dogMixLine(dogs);
  if (!line) return '';
  const n = dogsWithCautions(dogs);
  return n > 0 ? `${line} · ${n} ${n === 1 ? 'owner asks' : 'owners ask'} for a careful intro` : line;
}
