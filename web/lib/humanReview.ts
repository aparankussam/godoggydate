'use client';
// web/lib/humanReview.ts
// Client access to "My Human: A Review" — the deadpan, review-site-style write-up
// of the OWNER, dictated by the dog. The server (which alone holds the dog's
// stored facts and the Gemini key) grounds the review only on data we already
// have plus any real numbers passed in, and returns a benign 3.5–5 star read.
// Mirrors web/lib/apology.ts's ID-token + fetch shape. Nothing is persisted
// server-side; the section caches the last result locally for its quarterly
// cadence.

import { getFirebase } from '../shared/utils/firebase';

export interface HumanReview {
  /** Benign, playful star score in [3.5, 5.0], stepped by 0.5. Not a real score. */
  stars: number;
  /** Short deadpan review headline in the dog's voice. */
  headline: string;
  /** Two or three affectionate "Pros" bullets. */
  pros: string[];
  /** Two or three gentle, silly "Areas for improvement" bullets. */
  improvements: string[];
  /** One or two sentence closing verdict. */
  verdict: string;
  /** The dog's name as the server resolved it (used for the card). */
  dogName: string;
  model?: string;
  promptVersion?: string;
}

export interface RequestHumanReviewInput {
  /** Optional untrusted hint about what the dog appreciates. */
  note?: string;
  /** Optional REAL care-routine/consistency streak in days. Omit if unknown —
   *  never pass a made-up number; the server treats it as a stated fact. */
  streak?: number;
}

async function currentIdToken(): Promise<string> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/** Ask the server to write a fresh review of the owner. */
export async function requestHumanReview(input: RequestHumanReviewInput = {}): Promise<HumanReview> {
  const idToken = await currentIdToken();
  const payload: Record<string, unknown> = {};
  const note = input.note?.trim();
  if (note) payload.note = note;
  if (typeof input.streak === 'number' && Number.isFinite(input.streak) && input.streak > 0) {
    payload.streak = Math.floor(input.streak);
  }

  const res = await fetch('/api/ai/human-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not write the review. Try again.');
  }
  return data as HumanReview;
}
