// mobile/lib/webLinks.ts
// Links from the app to public pages on the website: a dog's public page,
// a Pack Day event, the first-meeting safety guide. Shares should carry one
// of these so the person receiving them has something to tap.

export function webBaseUrl(): string {
  return process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') || 'https://godoggydate.com';
}

export function webUrl(path: string): string {
  return `${webBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

// Mirrors web/lib/dogSlug.ts: a readable name prefix plus the owner's uid.
// Firebase Auth uids never contain hyphens, so the web splits on the last one.
function kebabName(name: string): string {
  const kebab = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return kebab || 'dog';
}

export function toDogSlug(name: string, uid: string): string {
  return `${kebabName(name)}-${uid}`;
}

/** The dog's public page, e.g. https://godoggydate.com/d/kaju-<uid>. */
export function dogPageUrl(name: string, uid: string): string {
  return webUrl(`/d/${toDogSlug(name, uid)}`);
}

/** The public page for a Pack Day event. */
export function packDayUrl(eventId: string): string {
  return webUrl(`/pack/${eventId}`);
}

/** The first-meeting safety guide. */
export function playdateSafetyUrl(): string {
  return webUrl('/playdate-safety');
}
