'use client';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

const SESSION_PREFIX = 'godoggydate.analytics.';

function getMeasurementId(): string {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? '';
}

function sanitizeParams(params: AnalyticsParams = {}): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value),
    ),
  ) as Record<string, string | number | boolean>;
}

function pushToDataLayer(...args: unknown[]) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
}

export function analyticsEnabled(): boolean {
  return Boolean(getMeasurementId());
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined') return;
  const safeParams = sanitizeParams(params);

  pushToDataLayer({ event: name, ...safeParams });

  if (typeof window.gtag === 'function' && analyticsEnabled()) {
    window.gtag('event', name, safeParams);
  }
}

export function trackPageView(path: string) {
  const measurementId = getMeasurementId();
  const page_location =
    typeof window !== 'undefined' ? window.location.href : path;

  if (typeof window.gtag === 'function' && measurementId) {
    window.gtag('config', measurementId, {
      page_path: path,
      page_location,
    });
  }

  trackEvent('page_view', {
    page_path: path,
    page_location,
  });
}

export function setAnalyticsUser(userId: string | null) {
  if (typeof window === 'undefined') return;
  const measurementId = getMeasurementId();
  if (!measurementId || typeof window.gtag !== 'function') return;

  window.gtag('config', measurementId, {
    user_id: userId ?? undefined,
  });
}

export function trackOncePerSession(
  key: string,
  eventName: string,
  params: AnalyticsParams = {},
): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const storageKey = `${SESSION_PREFIX}${key}`;
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return false;
    }
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // Ignore storage failures and continue tracking.
  }

  trackEvent(eventName, params);
  return true;
}

const FIRST_TIME_PREFIX = 'godoggydate.analytics.first.';

/**
 * Fire an event only the FIRST time this browser sees this account do it
 * ("first message sent", "first swipe", ...), so launch funnels can count
 * activation without counting every repeat. Remembered in localStorage per
 * account; if storage is blocked the event still fires, so the worst case is a
 * repeat rather than a gap. Returns true when the event was sent now.
 */
export function trackFirstTime(
  userId: string | null | undefined,
  key: string,
  eventName: string,
  params: AnalyticsParams = {},
): boolean {
  if (typeof window === 'undefined' || !userId) return false;

  try {
    const storageKey = `${FIRST_TIME_PREFIX}${userId}.${key}`;
    if (window.localStorage.getItem(storageKey) === '1') return false;
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Storage blocked: fall through and track.
  }

  trackEvent(eventName, params);
  return true;
}
