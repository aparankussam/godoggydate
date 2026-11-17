// mobile/app/+native-intent.tsx
// Rewrites incoming links before expo-router matches them to a screen.
//
// Universal links (applinks:godoggydate.com, served by
// web/app/.well-known/apple-app-site-association/route.ts) hand the app the
// website's own URLs, which don't all match the app's routes:
//   https://godoggydate.com/app/household/join?code=X -> /household/join?code=X
//   https://godoggydate.com/pack/<id>                 -> /pack/<id>
//   https://godoggydate.com/app/pack/<id>             -> /pack/<id>
// godoggydate:// links keep working: anything not listed above passes through
// unchanged.

const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i;

function splitPath(input: string): { pathname: string; search: string } | null {
  const match = URL_PATTERN.exec(input);
  if (match) {
    const scheme = match[1].toLowerCase();
    const host = match[2];
    const rest = match[3] ?? '';
    // For a custom scheme (godoggydate://household/join) the "host" is the
    // first path segment; for http(s) it's the domain.
    const pathname = scheme === 'http' || scheme === 'https' ? rest : `/${host}${rest}`;
    return { pathname: pathname || '/', search: match[4] ?? '' };
  }
  if (input.startsWith('/')) {
    const [pathAndQuery] = input.split('#');
    const queryAt = pathAndQuery.indexOf('?');
    return queryAt === -1
      ? { pathname: pathAndQuery, search: '' }
      : { pathname: pathAndQuery.slice(0, queryAt), search: pathAndQuery.slice(queryAt) };
  }
  return null;
}

function queryParam(search: string, key: string): string | null {
  for (const pair of search.replace(/^\?/, '').split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (rawKey !== key) continue;
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      return rawValue;
    }
  }
  return null;
}

export function mapIncomingPath(path: string): string {
  const parts = splitPath(path);
  if (!parts) return path;
  const pathname = parts.pathname.replace(/\/+$/, '') || '/';

  if (/^\/(app\/)?household\/join$/i.test(pathname)) {
    const code = (queryParam(parts.search, 'code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return code ? `/household/join?code=${code}` : '/household/join';
  }

  const pack = /^\/(?:app\/)?pack\/([^/]+)$/i.exec(pathname);
  if (pack) return `/pack/${pack[1]}`;

  return path;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return mapIncomingPath(path);
  } catch (error) {
    // Throwing here would crash the app on launch; fall back to the raw link.
    console.warn('[native-intent] could not map incoming link', error);
    return path;
  }
}
