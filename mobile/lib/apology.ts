// mobile/lib/apology.ts
// Mobile client for the "Notes-App Apology" writer — mirrors web/lib/apology.ts
// and the fetch+auth+baseURL shape of mobile/lib/petTwin.ts. The owner types
// what their dog allegedly did; the already-deployed web route (/api/ai/apology)
// alone holds the dog's name/breed/Dogtype and the Gemini key and returns a
// formal, unrepentant statement in the dog's own voice. Nothing is persisted —
// each call returns a fresh statement the app renders and shares. It is openly
// a JOKE, written by AI in the dog's voice, never a sincere apology.

import { getFirebase } from './firebase';

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

/** Max length of the owner's "what did they do?" input, matched to the route. */
export const CRIME_MAX_LEN = 280;

function webBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim().replace(/\/$/, '') ||
    null
  );
}

export function isApologyConfigured(): boolean {
  return Boolean(webBase());
}

async function currentIdToken(): Promise<string> {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/** Ask the server to write a fresh notes-app non-apology for the given crime. */
export async function requestApology(crime: string): Promise<Apology> {
  const trimmed = crime.trim();
  if (!trimmed) throw new Error('Tell us what they did first.');

  const base = webBase();
  if (!base) throw new Error('The apology writer is not configured for this build.');
  const idToken = await currentIdToken();
  const res = await fetch(`${base}/api/ai/apology`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ crime: trimmed }),
  });
  const data = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || 'Could not write the statement. Try again.');
  }
  return data as Apology;
}
