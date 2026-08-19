// mobile/lib/humanReview.ts
// Mobile client for "My Human: A Review" — mirrors web/lib/humanReview.ts. The
// review is a deadpan, review-site-style write-up of the OWNER, dictated by the
// dog. The already-deployed web route (/api/ai/human-review) owns the dog's
// stored facts, the Gemini key, the per-uid volume cap + anti-burst lock, and
// the honesty grounding; it returns a benign 3.5–5 star read that is explicitly
// NOT a real score. Nothing is persisted server-side — the section caches the
// last result locally for its quarterly cadence.
//
// Auth + baseURL shape copied from mobile/lib/petTwin.ts: resolve the web base
// from EXPO_PUBLIC_WEB_URL / EXPO_PUBLIC_PAYMENTS_API_URL and attach a Firebase
// ID token as a Bearer header. The server derives the uid from that token; the
// optional userId below is passed through harmlessly for parity with the caller.

import { getFirebase } from './firebase';

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
  /** The owner's uid — passed through for parity with the web caller. The
   *  server authoritatively derives the uid from the ID token regardless. */
  userId?: string;
  /** Optional untrusted hint about what the dog appreciates. */
  note?: string;
  /** Optional REAL care-routine/consistency streak in days. Omit if unknown —
   *  never pass a made-up number; the server treats it as a stated fact. */
  streak?: number;
}

function webBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim().replace(/\/$/, '') ||
    null
  );
}

export function isHumanReviewConfigured(): boolean {
  return Boolean(webBase());
}

async function currentIdToken(): Promise<string> {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/** Ask the server to write a fresh review of the owner. */
export async function requestHumanReview(input: RequestHumanReviewInput = {}): Promise<HumanReview> {
  const base = webBase();
  if (!base) throw new Error('The reviewer is not configured for this build.');
  const idToken = await currentIdToken();

  const payload: Record<string, unknown> = {};
  const userId = input.userId?.trim();
  if (userId) payload.userId = userId;
  const note = input.note?.trim();
  if (note) payload.note = note;
  if (typeof input.streak === 'number' && Number.isFinite(input.streak) && input.streak > 0) {
    payload.streak = Math.floor(input.streak);
  }

  const res = await fetch(`${base}/api/ai/human-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || 'Could not write the review. Try again.');
  }
  return data as HumanReview;
}
