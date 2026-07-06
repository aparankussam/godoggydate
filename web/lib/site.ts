const FALLBACK_SITE_URL = 'https://godoggydate.com';

function normalizeSiteUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return FALLBACK_SITE_URL;

  try {
    const url = new URL(candidate);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return FALLBACK_SITE_URL;
    }
    return url.origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL,
);

export function absoluteUrl(path = '/'): string {
  return new URL(path, siteUrl).toString();
}
