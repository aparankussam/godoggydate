// mobile/lib/analytics.ts
// Same trackEvent API as web/lib/analytics.ts, but events go through the
// web app's /api/analytics relay (which holds the GA4 API secret server-
// side) instead of gtag. Fire-and-forget: analytics must never block or
// break product flows.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

const CLIENT_ID_KEY = 'godoggydate.analytics.clientId';
let cachedClientId: string | null = null;
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

export function setAnalyticsUser(userId: string | null) {
  currentUserId = userId;
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  const base = getApiBase();
  if (!base || base.includes('localhost')) return; // dev builds: no-op

  void (async () => {
    try {
      const clientId = await getClientId();
      const safeParams = Object.fromEntries(
        Object.entries({ ...params, platform: 'mobile' })
          .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)),
      );
      await fetch(`${base}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          ...(currentUserId ? { userId: currentUserId } : {}),
          events: [{ name, params: safeParams }],
        }),
      });
    } catch { /* never surface analytics failures */ }
  })();
}
