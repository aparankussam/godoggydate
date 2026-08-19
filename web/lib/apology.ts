'use client';
// web/lib/apology.ts
// Client access to the "Notes-App Apology" writer. The owner types what their
// dog allegedly did; the server (which alone holds the dog's name/breed/Dogtype
// and the Gemini key) returns a formal, unrepentant statement in the dog's
// voice. Mirrors web/lib/petTwin.ts's ID-token + fetch shape. Nothing is
// persisted — each call returns a fresh statement the client renders and shares.

import { getFirebase } from '../shared/utils/firebase';

export interface Apology {
  /** The body of the non-apology, in the dog's first-person voice. */
  statement: string;
  /** The closing signature line, ending in a paw print. */
  signOff: string;
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

/** Ask the server to write a fresh notes-app non-apology for the given crime. */
export async function requestApology(crime: string): Promise<Apology> {
  const trimmed = crime.trim();
  if (!trimmed) throw new Error('Tell us what they did first.');

  const idToken = await currentIdToken();
  const res = await fetch('/api/ai/apology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ crime: trimmed }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not write the statement. Try again.');
  }
  return data as Apology;
}
