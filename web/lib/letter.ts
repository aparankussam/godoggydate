'use client';
// web/lib/letter.ts
// Client access to "The Gotcha Day Letter" writer. The owner taps a button on a
// real, near occasion (a Gotcha Day or birthday computed from dates THEY entered)
// and the server — which alone holds the dog's data and the Gemini key — returns
// a warm ~150-word letter in the dog's voice. The result is cached server-side
// per occasion, so a second tap returns the same keepsake rather than a reroll.
// Mirrors web/lib/apology.ts's ID-token + fetch shape.

import { getFirebase } from '../shared/utils/firebase';
import { computeMilestones, type Milestone } from '../../shared/milestones';
import type { SavedDogProfile } from './auth';

// Kept in sync with LETTER_WINDOW_DAYS in web/app/api/ai/letter/route.ts — the
// section only offers a letter when the server will actually honour it.
export const LETTER_WINDOW_DAYS = 30;

export type LetterKind = 'gotcha' | 'birthday';

export interface Letter {
  /** Warm opening line, in the dog's first-person voice. */
  salutation: string;
  /** The letter body (~150 words, or shorter when profile data is sparse). */
  body: string;
  /** Closing signature line, ending in a paw print. */
  signOff: string;
  /** The dog's name as the server resolved it. */
  dogName: string;
  /** The occasion this letter marks, e.g. "Rex's Gotcha Day". */
  occasion: string;
  /** The occasion's honest subtitle, e.g. "3 years since Rex came home". */
  occasionSubtitle: string;
  kind: LetterKind;
  /** True when the letter was written short because the profile had little to
   *  ground on — surfaced so the UI can be honest about it. */
  sparse: boolean;
  /** True when this came from the server-side per-occasion cache. */
  cached: boolean;
  model?: string;
  promptVersion?: string;
}

/** The birthday / Gotcha Day a letter can be written for right now, if any.
 *  Prefers an active occasion, else the soonest one inside the window. Returns
 *  null when nothing real is near — the letter is never offered for a
 *  made-up date. Mirrors pickLetterMilestone on the server so the client only
 *  shows the button when the server will honour it. */
export function pickLetterMilestone(
  profile: SavedDogProfile | null | undefined,
  nowMs: number = Date.now(),
): Milestone | null {
  if (!profile) return null;
  const { active, next } = computeMilestones(
    {
      name: profile.name,
      birthYear: profile.birthYear,
      birthMonth: profile.birthMonth,
      adoptionDate: profile.adoptionDate,
      createdAt: profile.createdAt,
    },
    nowMs,
  );
  const list: Milestone[] = [...active];
  if (next) list.push(next);
  const candidates = list.filter(
    (m) => (m.kind === 'gotcha' || m.kind === 'birthday') &&
      (m.isActive || m.daysUntil <= LETTER_WINDOW_DAYS),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.daysUntil - b.daysUntil;
  })[0];
}

async function currentIdToken(): Promise<string> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/** Ask the server for the dog's letter for the given occasion kind. The server
 *  validates the kind against the real, near milestones and caches the result. */
export async function requestLetter(kind?: LetterKind): Promise<Letter> {
  const idToken = await currentIdToken();
  const res = await fetch('/api/ai/letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(kind ? { kind } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not write the letter. Try again.');
  }
  return data as Letter;
}
