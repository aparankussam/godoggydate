// mobile/lib/roast.ts
// Mobile client for "Roast My Dog (Certified Affectionate)" — mirrors
// web/lib/roast.ts and reuses the fetch+auth+baseURL shape from
// mobile/lib/petTwin.ts. There is NO user input: the already-deployed web route
// (/api/ai/roast), which alone holds the dog's traits and the Gemini key,
// grounds the roast entirely on the stored breed/Dogtype/age/energy/play-styles
// and returns 3 affectionate roast lines + 1 mandatory closing compliment.
// Nothing is persisted — each call returns a fresh roast the app renders and
// shares. The app never rebuilds the server route; it only POSTs (with a
// Firebase ID token) and renders what comes back.

import { getFirebase } from './firebase';

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

function webBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim().replace(/\/$/, '') ||
    null
  );
}

export function isRoastConfigured(): boolean {
  return Boolean(webBase());
}

async function currentIdToken(): Promise<string> {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/** Ask the server for a fresh certified-affectionate roast of the owner's dog. */
export async function requestRoast(): Promise<Roast> {
  const base = webBase();
  if (!base) throw new Error('The roast writer is not configured for this build.');
  const idToken = await currentIdToken();
  const res = await fetch(`${base}/api/ai/roast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || 'Could not write the roast. Try again.');
  }
  return data as Roast;
}
