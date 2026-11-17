// web/lib/inAppBrowser.ts
// Detects the "built-in browser" that Facebook, Instagram, TikTok and similar
// apps open links in. Google refuses OAuth sign-in inside embedded webviews
// (error 403 disallowed_useragent), so a sign-in started there cannot finish.
// Pure functions of the user-agent string so they are easy to check by hand.

export interface InAppBrowserInfo {
  /** True when the page is very likely running inside an app's embedded browser. */
  isInApp: boolean;
  /** Human-readable name of the host app when known ("Facebook", "Instagram"...). */
  app: string | null;
  platform: 'ios' | 'android' | 'other';
}

const NOT_IN_APP: InAppBrowserInfo = { isInApp: false, app: null, platform: 'other' };

// Tokens the host apps put in their user-agent. Order matters: Messenger and
// Instagram UAs also contain FB tokens, so the most specific names come first.
const KNOWN_APPS: Array<[RegExp, string]> = [
  [/Instagram/i, 'Instagram'],
  [/Messenger|FBAN\/Messenger/i, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/musical_ly|TikTok|Bytedance/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/Twitter/i, 'X'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Pinterest/i, 'Pinterest'],
  [/\bLine\//i, 'LINE'],
  [/Nextdoor/i, 'Nextdoor'],
  [/Reddit/i, 'Reddit'],
];

export function detectInAppBrowser(userAgent: string | undefined | null): InAppBrowserInfo {
  const ua = (userAgent ?? '').trim();
  if (!ua) return NOT_IN_APP;

  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const platform: InAppBrowserInfo['platform'] = isIos ? 'ios' : isAndroid ? 'android' : 'other';

  for (const [pattern, app] of KNOWN_APPS) {
    if (pattern.test(ua)) return { isInApp: true, app, platform };
  }

  // Generic Android WebView: Chrome-based UAs carry the "; wv)" marker.
  if (isAndroid && /; wv\)/i.test(ua)) return { isInApp: true, app: null, platform };

  // Generic iOS WKWebView: real Safari and the third-party iOS browsers all
  // include "Safari/" (CriOS, FxiOS, EdgiOS too); an embedded WKWebView does not.
  if (isIos && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) {
    return { isInApp: true, app: null, platform };
  }

  return { ...NOT_IN_APP, platform };
}

/** What to tell the person to open the link in, by platform. */
export function externalBrowserName(platform: InAppBrowserInfo['platform']): string {
  if (platform === 'ios') return 'Safari';
  if (platform === 'android') return 'Chrome';
  return 'your browser';
}

/**
 * Android only: a link that asks Android to open this page in Chrome. Returns
 * null elsewhere (iOS has no equivalent, so people have to use the app's own
 * "Open in browser" menu item or copy the link).
 */
export function androidChromeIntentUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const scheme = url.protocol.replace(':', '');
    return (
      `intent://${url.host}${url.pathname}${url.search}` +
      `#Intent;scheme=${scheme};package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`
    );
  } catch {
    return null;
  }
}
