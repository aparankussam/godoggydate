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

/**
 * The site-wide social card (app/opengraph-image.tsx). A page that sets its own
 * `openGraph` / `twitter` metadata replaces the layout's, and with it the card
 * Next attaches to the root segment, so those pages must name it explicitly or
 * their shared links unfurl with no image.
 */
export const defaultSocialImages = [
  { url: '/opengraph-image', width: 1200, height: 630, alt: "GoDoggyDate — Your dog's whole life, in one place" },
];
