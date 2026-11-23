// web/lib/trustedPhotoUrl.ts
// Server-side guard for any code that fetches a stored photo URL (the social
// preview images, Vibe Check). A dog doc's photos[] is user-writable text, so a
// URL read from it is untrusted: fetching it blindly lets anyone make our server
// request internal addresses, cloud metadata endpoints or arbitrary hosts (SSRF).
//
// Only two shapes are ever trusted, both for THIS project's bucket (see projectBuckets):
//   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<object>...
//   http://<emulator host>:9199/v0/b/<bucket>/o/<object>...   (local dev only:
//     needs NEXT_PUBLIC_FIREBASE_EMULATOR_HOST and a "demo-" project id, the same
//     guard the browser client uses, so a real deployment can't be pointed at it)
// Anything else yields null and the caller falls back to its branded card.

const PROD_HOST = 'firebasestorage.googleapis.com';
const EMULATOR_STORAGE_PORT = '9199';

/**
 * This project's bucket: the configured one, plus the project's two reserved
 * default names. Older photos may carry the legacy `<project>.appspot.com` name
 * even after the config moves to `<project>.firebasestorage.app` (or the other
 * way round); both names belong to the project alone.
 */
function projectBuckets(): string[] {
  const names = new Set<string>();
  const configured = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (configured) names.add(configured);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (configured && projectId) {
    names.add(`${projectId}.appspot.com`);
    names.add(`${projectId}.firebasestorage.app`);
  }
  return [...names];
}

export function trustedPhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  const buckets = projectBuckets();
  if (buckets.length === 0) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (!buckets.some((bucket) => url.pathname.startsWith(`/v0/b/${bucket}/o/`))) return null;

  if (url.protocol === 'https:' && url.hostname === PROD_HOST && url.port === '') {
    return url.toString();
  }

  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  if (
    emulatorHost &&
    projectId.startsWith('demo-') &&
    url.protocol === 'http:' &&
    url.hostname === emulatorHost &&
    url.port === EMULATOR_STORAGE_PORT
  ) {
    return url.toString();
  }
  return null;
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Fetches a trusted photo URL and returns it as a data URI, or null when the URL
 * is not trusted or anything about the response is off (redirect, non-image,
 * too large, slow). We fetch it ourselves, with redirects refused, rather than
 * handing the URL to the image renderer, so the only request that ever leaves
 * the server is the one to a vetted Storage URL.
 */
export async function fetchTrustedPhotoDataUri(
  raw: unknown,
  { maxBytes = 3 * 1024 * 1024, timeoutMs = 4000 }: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const url = trustedPhotoUrl(raw);
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_MIMES.has(mime)) return null;
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
