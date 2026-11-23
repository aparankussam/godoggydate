// mobile/lib/analytics.ts
// Same trackEvent API as web/lib/analytics.ts, but events go through the
// web app's /api/analytics relay (which holds the GA4 API secret server-
// side) instead of gtag. Fire-and-forget: analytics must never block or
// break product flows.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

const CLIENT_ID_KEY = 'godoggydate.analytics.clientId';
const SESSION_KEY = 'godoggydate.analytics.session';
// GA4 closes a session after 30 idle minutes; a later event starts a new one.
const SESSION_IDLE_MS = 30 * 60 * 1000;
let cachedClientId: string | null = null;
let session: { id: string; lastAt: number } | null = null;
let sessionLoaded: Promise<void> | null = null;
let sessionPersistedAt = 0;
let currentUserId: string | null = null;

function getApiBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim().replace(/\/$/, '') ||
    null
  );
}

async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  try {
    const stored = await AsyncStorage.getItem(CLIENT_ID_KEY);
    if (stored) {
      cachedClientId = stored;
      return stored;
    }
  } catch { /* storage unavailable — fall through to ephemeral id */ }

  const fresh = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  cachedClientId = fresh;
  try {
    await AsyncStorage.setItem(CLIENT_ID_KEY, fresh);
  } catch { /* ephemeral id is fine for this session */ }
  return fresh;
}

/**
 * Stable GA4 session id (unix seconds when the session began), shared by every
 * event until 30 minutes pass with no event. The Measurement Protocol drops
 * events that carry no session_id, so a fresh random value per event is as bad
 * as none: it would make every event its own session. Survives an app restart
 * inside the idle window.
 */
async function getSessionId(): Promise<string> {
  if (!sessionLoaded) {
    sessionLoaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        if (stored && typeof stored.id === 'string' && typeof stored.lastAt === 'number') session = stored;
      } catch { /* start a fresh session */ }
    })();
  }
  await sessionLoaded;

  const now = Date.now();
  const startedNew = !session || now - session.lastAt > SESSION_IDLE_MS;
  session = startedNew || !session
    ? { id: String(Math.floor(now / 1000)), lastAt: now }
    : { id: session.id, lastAt: now };
  // Persist on a new session and then at most about once a minute.
  if (startedNew || now - sessionPersistedAt > 60 * 1000) {
    sessionPersistedAt = now;
    try { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* in-memory is fine */ }
  }
  return session.id;
}

export function setAnalyticsUser(userId: string | null) {
  currentUserId = userId;
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  const base = getApiBase();
  if (!base || base.includes('localhost')) return; // dev builds: no-op

  void (async () => {
    try {
      const clientId = await getClientId();
      const sessionId = await getSessionId();
      // session_id and engagement_time_msec go first: GA4 needs both for the
      // event to appear in session-based reports and the relay keeps only the
      // first few params.
      const safeParams = Object.fromEntries(
        Object.entries({ session_id: sessionId, engagement_time_msec: 100, ...params, platform: 'mobile' })
          .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)),
      );
      await fetch(`${base}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          sessionId,
          ...(currentUserId ? { userId: currentUserId } : {}),
          events: [{ name, params: safeParams }],
        }),
      });
    } catch { /* never surface analytics failures */ }
  })();
}
