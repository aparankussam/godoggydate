// shared/packDayHeadsUp.ts
// "Heads-up" for a Pack Day: an attendee whose owner declared a limit ("prefers no
// puppies") while a dog that trips it is also going. Shown on the event page as a
// modest note; it never blocks anyone from joining, and it is only ever what the
// owners typed in (nobody verifies it).
//
// The rules ARE the Discover rules: analyzeLimits() in utils/matchingEngine.ts
// decides what counts as "tripped" (a puppy for "no puppies", Large or XL for "no
// large dogs", ...), so an event page and a swipe card never disagree. This file
// only fans that out across the dogs going and words the result with a count
// ("1 puppy is going"). Dogs the viewer blocked are left out by the caller.

import { analyzeLimits, describeLimit } from './utils/matchingEngine';
import type { DogProfile } from './types';

export interface HeadsUpDog {
  uid: string;
  profile: DogProfile;
}

export interface HeadsUpNote {
  /** Stable per holder + limit, for React keys and tests. */
  id: string;
  /** The dog whose owner declared the limit. */
  holderUid: string;
  /** "Moose's owner prefers no puppies — 1 puppy is going" */
  text: string;
}

// Limits where a count reads naturally ("2 large dogs are going"). Everything
// else (rough play, calm dogs, ...) names the dogs instead.
const COUNT_NOUN: Record<string, [singular: string, plural: string]> = {
  'small dogs': ['small dog', 'small dogs'],
  'large dogs': ['large dog', 'large dogs'],
  puppies: ['puppy', 'puppies'],
  'high-energy dogs': ['high-energy dog', 'high-energy dogs'],
  'needs slow introduction': ['high-energy dog', 'high-energy dogs'],
};

function dogName(dog: HeadsUpDog): string {
  return (dog.profile.name ?? '').trim() || 'A dog';
}

function whoIsGoing(chip: string, triggers: HeadsUpDog[]): string {
  const noun = COUNT_NOUN[chip.trim().toLowerCase()];
  const n = triggers.length;
  if (noun) return `${n} ${n === 1 ? noun[0] : noun[1]} ${n === 1 ? 'is' : 'are'} going`;
  const names = triggers.map(dogName);
  if (names.length === 1) return `${names[0]} is going`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are going`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more are going`;
}

/**
 * The conflicts among the dogs going, one note per (dog, declared limit) that at
 * least one other dog trips. `viewerUid` words the viewer's own dog's limits as
 * "You prefer no puppies". Order follows the order of `dogs`, then the order the
 * owner ticked their limits.
 */
export function packDayHeadsUps(dogs: HeadsUpDog[], opts: { viewerUid?: string } = {}): HeadsUpNote[] {
  const notes: HeadsUpNote[] = [];
  for (const holder of dogs) {
    // chip -> the other dogs that trip it, in the order the limits were declared
    const tripped = new Map<string, { chip: string; kind: 'notGoodWith' | 'behaviorFlag'; triggers: HeadsUpDog[] }>();
    for (const other of dogs) {
      if (other.uid === holder.uid) continue;
      // The viewer here is `other`; the declared limits read are `holder`'s.
      const analysis = analyzeLimits(other.profile, holder.profile);
      for (const item of analysis.items) {
        if (item.side !== 'theirs' || item.severity !== 'caution') continue;
        const key = `${item.kind}:${item.chip.toLowerCase()}`;
        const entry = tripped.get(key) ?? { chip: item.chip, kind: item.kind, triggers: [] };
        entry.triggers.push(other);
        tripped.set(key, entry);
      }
    }
    for (const [key, { chip, kind, triggers }] of tripped) {
      const subject = holder.uid === opts.viewerUid
        ? ({ kind: 'you', dogName: holder.profile.name } as const)
        : ({ kind: 'owner', dogName: holder.profile.name } as const);
      notes.push({
        id: `${holder.uid}:${key}`,
        holderUid: holder.uid,
        text: `${describeLimit(chip, kind, subject)} — ${whoIsGoing(chip, triggers)}`,
      });
    }
  }
  return notes;
}
