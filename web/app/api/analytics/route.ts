import { NextResponse } from 'next/server';

// GA4 Measurement Protocol relay for the mobile app. The API secret must
// stay server-side (embedding it in the app would let anyone spam the GA4
// property), so mobile posts here and we forward. No auth on purpose —
// events are anonymous product telemetry, and the payload is tightly
// validated below. Returns 204 no-op when GA4 is not configured.

const MAX_EVENT_NAME = 40;
const MAX_PARAMS = 10;
const MAX_STRING = 100;

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
