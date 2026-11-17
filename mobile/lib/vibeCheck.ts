// mobile/lib/vibeCheck.ts
// Mirrors web/lib/vibeCheck.ts — small display helpers shared by every
// surface that renders Vibe Check data — plus the client for the Vibe Check
// route itself ("✨ Fill this in from the photos" in the profile editor).

import { getFirebase } from './firebase';
import { webBaseUrl } from './webLinks';
import type { DogAIProfile } from '../../shared/types';

/** archetype.code has no fixed per-letter meaning — the model "chooses" a
 *  letter per axis per dog (see web/app/api/ai/vibe-check/route.ts's schema
 *  description, the only place this is generated). Never claim what a
 *  specific letter means; only name the four axes it spans. */
export const VIBE_CODE_AXES = 'energy · sociability · boldness · focus';

export function breedConfidencePhrase(confidence: 'low' | 'medium' | 'high'): string {
  if (confidence === 'high') return 'would bet on it';
  if (confidence === 'medium') return 'pretty sure';
  return 'a wild guess';
}

// ── Vibe Check client ───────────────────────────────────────────────────────
// Same call web/components/DogProfileForm.tsx makes: POST the photos (or ask
// the server to read the ones already saved on the dog doc) with the owner's
// Firebase ID token. The server saves the result to dogs/{uid}.ai itself; the
// editor only pre-fills its fields from it and the owner still saves the form.

export type VibeCheckFailure = 'signin' | 'cooldown' | 'daily-limit' | 'unavailable' | 'failed';

export class VibeCheckError extends Error {
  kind: VibeCheckFailure;

  constructor(message: string, kind: VibeCheckFailure) {
    super(message);
    this.name = 'VibeCheckError';
    this.kind = kind;
  }
}

export const VIBE_CHECK_SIGN_IN_MESSAGE =
  'Sign in to use this. As a guest you can still fill the form in by hand.';

export interface VibeCheckRequest {
  /** The dog's name, if typed yet. Helps the bio sound like them. */
  name?: string;
  /** Up to 3 photos that aren't saved yet, as base64 data URIs. */
  photos?: { dataUri: string }[];
  /** Read the photos already saved on the owner's dog doc instead. */
  useStoredPhotos?: boolean;
}

/** False for guests (anonymous sessions), which the server turns away from
 *  every AI route. */
export function canUseVibeCheck(): boolean {
  const user = getFirebase().auth.currentUser;
  return Boolean(user && !user.isAnonymous);
}

// The route's own per-user limits: a 12-second cooldown (Retry-After ≤ 12s)
// and a daily cap (Retry-After of an hour). Both come back as 429 with the
// same text, so the header is what tells them apart.
const COOLDOWN_RETRY_MAX_SECONDS = 60;

export async function requestVibeCheck(request: VibeCheckRequest): Promise<DogAIProfile> {
  const user = getFirebase().auth.currentUser;
  // The server turns away anonymous (guest) sessions for every AI route, so
  // say so up front instead of spending a request to hear it.
  if (!user || user.isAnonymous) {
    throw new VibeCheckError(VIBE_CHECK_SIGN_IN_MESSAGE, 'signin');
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new VibeCheckError('Couldn’t reach Vibe Check. Check your connection and try again.', 'failed');
  }
  let res: Response;
  try {
    res = await fetch(`${webBaseUrl()}/api/ai/vibe-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        name: request.name?.trim() || undefined,
        ...(request.useStoredPhotos ? { useStoredPhotos: true } : { photos: request.photos ?? [] }),
      }),
    });
  } catch {
    throw new VibeCheckError('Couldn’t reach Vibe Check. Check your connection and try again.', 'failed');
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string; ai?: DogAIProfile };

  if (res.status === 401 || res.status === 403) {
    throw new VibeCheckError(VIBE_CHECK_SIGN_IN_MESSAGE, 'signin');
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > COOLDOWN_RETRY_MAX_SECONDS) {
      throw new VibeCheckError(
        'That’s all the Vibe Checks for today. Try again later, or fill the form in by hand.',
        'daily-limit',
      );
    }
    throw new VibeCheckError(
      data.error || 'You’re going a little fast — give it a few seconds and try again.',
      'cooldown',
    );
  }
  if (res.status === 503) {
    // The app-wide daily limit, or the model being down. The server's text
    // already says which, and that it isn't the owner's fault.
    throw new VibeCheckError(data.error || 'Vibe Check is resting for now. Please try again later.', 'unavailable');
  }
  if (!res.ok || !data.ai?.vibeCheck) {
    throw new VibeCheckError(data.error || 'Vibe Check failed — try again', 'failed');
  }
  return data.ai;
}

// ── Photos the owner just picked ────────────────────────────────────────────
// The route accepts JPEG, PNG and WebP up to 5 MB each. The request body also
// has to stay under the host's ~4.5 MB limit, and base64 adds a third, so
// inline photos are capped at about 3 MB in total. Anything that doesn't fit
// is left out; the editor falls back to the saved photos when there are some.

const INLINE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_TOTAL_BYTES = 3 * 1024 * 1024;

function uriToBlob(uri: string): Promise<Blob> {
  // XHR rather than fetch, the same way lib/storage.ts reads picked photos.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Could not read the selected photo from this device.'));
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send();
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected photo from this device.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : '');
    };
    reader.readAsDataURL(blob);
  });
}

/** Turns up to 3 picked photos into data URIs the route accepts, skipping any
 *  it would refuse (wrong type, too big) or that would push the request over
 *  the size limit. May return an empty list. */
export async function localPhotosToDataUris(
  photos: Array<{ uri: string; mimeType?: string }>,
): Promise<{ dataUri: string }[]> {
  const out: { dataUri: string }[] = [];
  let total = 0;
  for (const photo of photos.slice(0, 3)) {
    try {
      const blob = await uriToBlob(photo.uri);
      const mimeType = (photo.mimeType || blob.type || 'image/jpeg').toLowerCase();
      if (!INLINE_MIME.has(mimeType)) continue;
      if (blob.size > MAX_PHOTO_BYTES || total + blob.size > MAX_INLINE_TOTAL_BYTES) continue;
      const base64 = await blobToBase64(blob);
      if (!base64) continue;
      // Rebuild the prefix from the known type: the native reader can label a
      // file blob application/octet-stream, which the route rejects.
      out.push({ dataUri: `data:${mimeType};base64,${base64}` });
      total += blob.size;
    } catch {
      // Unreadable photo — leave it out and try the rest.
    }
  }
  return out;
}
