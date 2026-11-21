// web/lib/requestGuards.ts
// Small helpers shared by the public, unauthenticated telemetry endpoints
// (/api/client-error, /api/csp-report): own-origin gate, per-IP rate limit and a
// size-capped body reader. All in-memory and per serverless instance, which is
// enough to blunt floods without a datastore.

import { siteUrl } from './site';

/** True for our own site (with or without a leading "www.") or a localhost dev origin. */
export function isOwnOrigin(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    const site = new URL(siteUrl);
    const bare = (host: string) => host.replace(/^www\./, '');
    return url.protocol === site.protocol && bare(url.hostname) === bare(site.hostname);
  } catch {
    return false;
  }
}

/** Origin header when present, else the Referer: the page that made the request. */
export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')?.trim();
  if (origin) return isOwnOrigin(origin);
  const referer = request.headers.get('referer')?.trim();
  return isOwnOrigin(referer);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Fixed-window per-key limiter. `hit(key)` returns true when the key is OVER the limit. */
export function createRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || now >= bucket.resetAt) {
        if (buckets.size > 5000) {
          for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
        }
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }
      bucket.count += 1;
      return bucket.count > max;
    },
  };
}

/**
 * Reads the request body as text but never more than `maxBytes`. Returns null
 * when the body is larger (declared or actual), without buffering the rest.
 */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Keeps a URL's origin-less path only: no query string, no hash. */
export function pathOnly(value: unknown, maxLen = 120): string {
  if (typeof value !== 'string') return '';
  let path = value;
  try {
    path = new URL(value, 'http://x.invalid').pathname;
  } catch {
    path = value.split(/[?#]/)[0];
  }
  return path.slice(0, maxLen);
}

/** A URL reduced to scheme + host (or a keyword like "inline" / "eval"), nothing identifying. */
export function originOnly(value: unknown, maxLen = 100): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return url.protocol;
    return url.origin.slice(0, maxLen);
  } catch {
    return value.slice(0, 20);
  }
}
