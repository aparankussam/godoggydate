'use client';
// web/lib/texts.ts
// Client access to "Texts From Your Dog". The server (which alone holds the
// dog's name/breed/Dogtype and the Gemini key) returns a short, unhinged thread
// of chat messages the dog "sent". Mirrors web/lib/apology.ts's ID-token + fetch
// shape. Nothing is persisted — each call returns a fresh thread the client
// renders and shares. Cadence is weekly, enforced server-side.

import { getFirebase } from '../shared/utils/firebase';

export interface DogTexts {
  /** The thread of short messages, in order, in the dog's first-person voice. */
  texts: string[];
  /** The dog's name as the server resolved it (used for the card). */
  dogName: string;
  model?: string;
  promptVersion?: string;
}

async function currentIdToken(): Promise<string> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/**
 * Ask the server for a fresh "texts from your dog" thread. The optional context
 * is real, honest grounding — the weekday, a walk, a reminder title — riffed on
 * but never obeyed. Returns { texts, dogName }.
 */
export async function requestDogTexts(context?: string): Promise<DogTexts> {
  const idToken = await currentIdToken();
  const res = await fetch('/api/ai/texts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ context: context?.trim().slice(0, 240) ?? '' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not get the thread. Try again.');
  }
  return data as DogTexts;
}
