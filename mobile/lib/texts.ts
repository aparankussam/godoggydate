// mobile/lib/texts.ts
// Mobile client for "Texts From Your Dog" — mirrors web/lib/texts.ts. The server
// (which alone holds the dog's name/breed/Dogtype and the Gemini key) returns a
// short, unhinged thread of chat messages the dog "sent". This mirrors the exact
// fetch + Firebase ID-token + baseURL shape of mobile/lib/petTwin.ts; the route
// (/api/ai/texts) already exists and owns the honesty grounding, the weekly
// cadence gate, and the per-uid anti-burst + volume caps. Nothing is persisted —
// each call returns a fresh thread the client renders and shares.

import { getFirebase } from './firebase';

export interface DogTexts {
  /** The thread of short messages, in order, in the dog's first-person voice. */
  texts: string[];
  /** The dog's name as the server resolved it (used for the card). */
  dogName: string;
  model?: string;
  promptVersion?: string;
}

function webBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim().replace(/\/$/, '') ||
    null
  );
}

export function isTextsConfigured(): boolean {
  return Boolean(webBase());
}

async function currentIdToken(): Promise<string> {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/**
 * Ask the server for a fresh "texts from your dog" thread. The optional context
 * is real, honest grounding — the weekday, a walk, a reminder title — riffed on
 * but never obeyed (the server ignores any unsafe topic in it). Returns
 * { texts, dogName }.
 */
export async function requestDogTexts(context?: string): Promise<DogTexts> {
  const base = webBase();
  if (!base) throw new Error('The text writer is not configured for this build.');
  const idToken = await currentIdToken();
  const res = await fetch(`${base}/api/ai/texts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ context: context?.trim().slice(0, 240) ?? '' }),
  });
  const data = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || 'Could not get the thread. Try again.');
  }
  return data as DogTexts;
}
