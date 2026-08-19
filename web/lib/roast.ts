'use client';
// web/lib/roast.ts
// Client access to the "Roast My Dog (Certified Affectionate)" writer. There is
// no user input — the server (which alone holds the dog's traits and the Gemini
// key) grounds the roast entirely on the stored breed/Dogtype/age/energy/play-
// styles and returns 3 affectionate roast lines + 1 mandatory closing
// compliment. Mirrors web/lib/apology.ts's ID-token + fetch shape. Nothing is
// persisted — each call returns a fresh roast the client renders and shares.

import { getFirebase } from '../shared/utils/firebase';

export interface Roast {
  /** Exactly 3 short, affectionate roast lines about the dog. */
  lines: string[];
  /** The mandatory warm closing compliment. */
  compliment: string;
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

/** Ask the server for a fresh certified-affectionate roast of the owner's dog. */
export async function requestRoast(): Promise<Roast> {
  const idToken = await currentIdToken();
  const res = await fetch('/api/ai/roast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not write the roast. Try again.');
  }
  return data as Roast;
}
