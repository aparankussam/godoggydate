import { NextResponse } from 'next/server';
import { siteUrl } from '../../../lib/site';

// GA4 Measurement Protocol relay for the mobile app. The API secret must
// stay server-side (embedding it in the app would let anyone spam the GA4
// property), so mobile posts here and we forward. No auth on purpose —
// events are anonymous product telemetry, and the payload is tightly
// validated below. Returns 204 no-op when GA4 is not configured.
//
// Because it is unauthenticated and forwards a caller-supplied userId/clientId,
// two lightweight guards keep it from being abused as an open GA4 spam relay:
//   1. An Origin/Referer allowlist rejects cross-origin BROWSER traffic — a
//      malicious page's fetch/XHR always carries its own Origin, so anything
//      that isn't our own site is 403'd. The native mobile client (the intended
//      caller) sends NEITHER header, so a header-less request is allowed.
//   2. A best-effort in-memory per-IP rate limit caps burst volume. It is
//      per-instance (not shared across serverless instances) and intentionally
//      simple — enough to blunt trivial floods without a datastore.

const MAX_EVENT_NAME = 40;
const MAX_PARAMS = 10;
const MAX_STRING = 100;

// ── Origin/Referer allowlist ────────────────────────────────────────────────

/** True for our own canonical site origin or any localhost dev origin. */
function isAllowedAnalyticsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin === siteUrl) return true;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// ── Per-IP rate limit (best-effort, per-instance) ───────────────────────────

const RATE_LIMIT_MAX = 60;          // requests allowed per window per IP
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_BUCKET_SWEEP_THRESHOLD = 5000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Fixed-window counter. Returns true when the caller is over the limit. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    // Opportunistically evict expired buckets so the map can't grow without
    // bound across many distinct IPs on a long-lived instance.
    if (rateBuckets.size > RATE_BUCKET_SWEEP_THRESHOLD) {
      for (const [key, b] of rateBuckets) {
        if (now >= b.resetAt) rateBuckets.delete(key);
      }
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

interface AnalyticsBody {
  clientId?: string;
  userId?: string;
  events?: Array<{ name?: string; params?: Record<string, unknown> }>;
}

function sanitizeParams(params: Record<string, unknown> = {}): Record<string, string | number> {
  const entries = Object.entries(params)
    .filter(([key, value]) =>
      /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .slice(0, MAX_PARAMS)
    .map(([key, value]) => [
      key,
      typeof value === 'string' ? value.slice(0, MAX_STRING) : typeof value === 'boolean' ? String(value) : value,
    ]);
  return Object.fromEntries(entries) as Record<string, string | number>;
}

export async function POST(request: Request) {
  // Reject cross-origin browser traffic. A header-less request (the native
  // mobile client, the intended caller) is allowed; a present Origin — or,
  // failing that, Referer — must match our own site.
  const originHeader = request.headers.get('origin')?.trim();
  const refererHeader = request.headers.get('referer')?.trim();
  if (originHeader) {
    if (!isAllowedAnalyticsOrigin(originHeader)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } else if (refererHeader && !isAllowedAnalyticsOrigin(refererHeader)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Best-effort per-IP throttle before doing any forwarding work.
  if (isRateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const apiSecret = process.env.GA4_API_SECRET?.trim();
  if (!measurementId || !apiSecret) {
    return new NextResponse(null, { status: 204 });
  }

  const body = await request.json().catch(() => null) as AnalyticsBody | null;
  const clientId = body?.clientId?.trim();
  if (!clientId || !/^[a-zA-Z0-9._-]{8,64}$/.test(clientId)) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  const events = (body?.events ?? [])
    .filter((e) => typeof e.name === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(e.name) && e.name.length <= MAX_EVENT_NAME)
    .slice(0, 5)
    .map((e) => ({ name: e.name as string, params: sanitizeParams(e.params) }));

  if (events.length === 0) {
    return NextResponse.json({ error: 'no valid events' }, { status: 400 });
  }

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          ...(body?.userId && /^[a-zA-Z0-9._-]{1,64}$/.test(body.userId) ? { user_id: body.userId } : {}),
          events,
        }),
      },
    );
  } catch (error) {
    console.warn('GA4 relay failed', error);
  }

  return new NextResponse(null, { status: 204 });
}
