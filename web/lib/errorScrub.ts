// web/lib/errorScrub.ts
// Pure text scrubbing for error reports, used by the browser reporter before it
// sends anything and again by /api/client-error before it logs anything, so a
// report can never carry an email address, an account/doc id or a query string.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Long mixed letter+digit tokens: Firebase uids, document ids, invite codes, tokens.
const ID_RE = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}\b/g;
const ORIGIN_RE = /https?:\/\/[^\s/)'"]+/g;
// A query string: a "?" glued to a path or file name, up to whitespace or a closing bracket.
const QUERY_RE = /([\w/.\-])\?[^\s)'"#]*/g;
const HASH_RE = /#[^\s)'"]*/g;

/** Removes emails, ids and query strings and truncates. */
export function scrubText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(EMAIL_RE, '[email]')
    .replace(QUERY_RE, '$1')
    .replace(HASH_RE, '')
    .replace(ID_RE, '[id]')
    .slice(0, maxLen);
}

// A stack frame: "    at fn (file:1:2)" (Chrome/Node) or "fn@file:1:2" (Safari/Firefox).
const FRAME_RE = /^\s*at\s|@\S*:\d+/;

/**
 * A stack trace reduced to function names and file paths: no origins, no queries,
 * and no message text. Chrome puts "Error: <message>" on the first line(s) of the
 * stack, which can hold whatever the message held (an email, a doc path with a
 * uid), so everything before the first frame is dropped.
 */
export function scrubStack(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const lines = value.split('\n');
  const firstFrame = lines.findIndex((line) => FRAME_RE.test(line));
  const frames = firstFrame === -1 ? [] : lines.slice(firstFrame);
  return frames
    .join('\n')
    .replace(EMAIL_RE, '[email]')
    .replace(ORIGIN_RE, '')
    .replace(QUERY_RE, '$1')
    .replace(HASH_RE, '')
    .slice(0, maxLen);
}

/** "/d/waffles-bJ08ja5xqkZUo3QpIUoYsmHIUXE3" -> "/d/[id]". Never keeps an id or a query string. */
export function routeOf(pathname: unknown): string {
  if (typeof pathname !== 'string') return '';
  const path = pathname.split(/[?#]/)[0] || '/';
  return path
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      const lastDash = segment.lastIndexOf('-');
      const tail = lastDash >= 0 ? segment.slice(lastDash + 1) : segment;
      const looksLikeId = tail.length >= 16 || /\d{4,}/.test(segment) || /^[A-Z0-9]{6,}$/.test(segment);
      return looksLikeId ? '[id]' : segment;
    })
    .join('/')
    .slice(0, 120);
}
