// shared/playdates.ts
// Checks and display text for a playdate proposal (date / time / place) typed
// into the web chat's "Propose a playdate" form. The same strings the iPhone app
// writes — ISO 'YYYY-MM-DD' and 24-hour 'HH:MM' — so either app can tell whether
// a playdate is still ahead.
//
// No imports, so `node --test` can run the test file directly.
//
// Why validate at all: <input type="date"> happily accepts yesterday, year 0001
// and year 99999. A past date that gets confirmed brings up "How did it go?"
// immediately, and a rating feeds the other dog's trust score, so a proposal in
// the past (or a year no calendar will reach) is refused up front.

export const MAX_PLAYDATE_PLACE_LENGTH = 200;
/** How far ahead a playdate can be proposed. */
export const MAX_PLAYDATE_ADVANCE_DAYS = 365;

export type PlaydateDraftProblem =
  | { field: 'date'; message: string }
  | { field: 'time'; message: string }
  | { field: 'place'; message: string };

const two = (n: number) => String(n).padStart(2, '0');
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local calendar day as 'YYYY-MM-DD' (what <input type="date"> uses as value/min/max). */
export function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Strict 'YYYY-MM-DD' to local midnight, or null — including for 02/30 and 5-digit years. */
export function parsePlaydateDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  // setFullYear semantics: years 0-99 map to 1900-1999 in the Date constructor.
  if (year < 100) d.setFullYear(year);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** Strict 'HH:MM' (24-hour) to minutes after midnight, or null. */
export function parsePlaydateTime(value: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const [hours, minutes] = [Number(m[1]), Number(m[2])];
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** The min/max for the date input, as 'YYYY-MM-DD'. */
export function playdateDateBounds(now: Date = new Date()): { min: string; max: string } {
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MAX_PLAYDATE_ADVANCE_DAYS);
  return { min: toLocalIsoDate(now), max: toLocalIsoDate(max) };
}

/** First problem with a draft, or null when it can be sent. */
export function playdateDraftProblem(
  draft: { date: string; time?: string | null; place: string },
  now: Date = new Date(),
): PlaydateDraftProblem | null {
  const day = parsePlaydateDate(draft.date);
  if (!day) return { field: 'date', message: 'Pick a real date for the playdate.' };

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (day.getTime() < startOfToday.getTime()) {
    return { field: 'date', message: 'That date has already passed. Pick today or a later day.' };
  }
  const { max } = playdateDateBounds(now);
  if (draft.date > max) {
    return { field: 'date', message: 'Pick a date within the next year.' };
  }

  const time = (draft.time ?? '').trim();
  if (time) {
    const minutes = parsePlaydateTime(time);
    if (minutes === null) return { field: 'time', message: 'Pick a real time for the playdate.' };
    if (day.getTime() === startOfToday.getTime() && minutes < now.getHours() * 60 + now.getMinutes()) {
      return { field: 'time', message: 'That time has already passed today.' };
    }
  }

  const place = draft.place.trim();
  if (!place) return { field: 'place', message: 'Add where you want to meet.' };
  if (place.length > MAX_PLAYDATE_PLACE_LENGTH) {
    return { field: 'place', message: `Keep the place under ${MAX_PLAYDATE_PLACE_LENGTH} characters.` };
  }
  return null;
}

/** Minutes after midnight to '3:30 PM'. */
export function formatPlaydateClock(minutesAfterMidnight: number): string {
  const hours = Math.floor(minutesAfterMidnight / 60) % 24;
  const minutes = minutesAfterMidnight % 60;
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${two(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * For people: 'Sat, Nov 22 at 3:30 PM' (year added when it isn't the current
 * one). A date that isn't a real ISO date (an old free-text playdate such as
 * "Sat, July 12") is shown exactly as it was typed.
 */
export function formatPlaydateWhen(
  p: { date: string; time?: string | null },
  now: Date = new Date(),
): string {
  const rawTime = (p.time ?? '').trim();
  const day = parsePlaydateDate(p.date);
  if (!day) {
    const rawDate = (p.date ?? '').trim();
    return rawTime ? `${rawDate} at ${rawTime}` : rawDate;
  }
  const base = `${WEEKDAYS_SHORT[day.getDay()]}, ${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}`;
  const dayLabel = day.getFullYear() === now.getFullYear() ? base : `${base}, ${day.getFullYear()}`;
  const minutes = parsePlaydateTime(rawTime);
  const time = minutes !== null ? formatPlaydateClock(minutes) : rawTime;
  return time ? `${dayLabel} at ${time}` : dayLabel;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Under a chat message: '3:42 PM' today, 'Yesterday 3:42 PM', 'Mon 3:42 PM'
 * within the week, 'Nov 10, 3:42 PM' this year, 'Nov 10, 2025' before that.
 * Same wording as the iPhone app. The thread used to show a bare clock time on
 * every message, so a reply from last week looked like it came a minute ago.
 */
export function formatMessageTime(ms: number, now: number = Date.now()): string {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const clock = formatPlaydateClock(d.getHours() * 60 + d.getMinutes());
  const days = Math.round((startOfDay(now).getTime() - startOfDay(ms).getTime()) / DAY_MS);
  if (days <= 0) return clock;
  if (days === 1) return `Yesterday ${clock}`;
  if (days < 7) return `${WEEKDAYS_SHORT[d.getDay()]} ${clock}`;
  const monthDay = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? `${monthDay}, ${clock}` : `${monthDay}, ${d.getFullYear()}`;
}

// ── Add to calendar (.ics) ───────────────────────────────────────────────────

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,');
}

function utf8Size(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

/** RFC 5545 section 3.1: lines fold at 75 octets (CRLF + a space), never inside a UTF-8 character. */
function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = utf8Size(char);
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // a continuation line starts with a space, which counts
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Default length of a playdate in the calendar. */
export const PLAYDATE_ICS_MINUTES = 60;

/**
 * A single-event .ics for a confirmed playdate: floating local time (no zone), so
 * it lands at the wall-clock time both owners agreed to. A playdate with no time
 * becomes an all-day event. Null when the date isn't a real 'YYYY-MM-DD' (an old
 * free-text playdate can't be put on a calendar).
 */
export function buildPlaydateIcs(
  playdate: { date: string; time?: string | null; place: string },
  opts: { dogName: string; uidSeed: string; now?: Date },
): string | null {
  const day = parsePlaydateDate(playdate.date);
  if (!day) return null;
  const place = (playdate.place ?? '').trim();
  const minutes = parsePlaydateTime(playdate.time);
  const ymd = (d: Date) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;

  const dtLines: string[] = [];
  if (minutes === null) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    dtLines.push(`DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(next)}`);
  } else {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes + PLAYDATE_ICS_MINUTES);
    const local = (d: Date) => `${ymd(d)}T${two(d.getHours())}${two(d.getMinutes())}00`;
    dtLines.push(`DTSTART:${local(start)}`, `DTEND:${local(end)}`);
  }

  const dogName = opts.dogName.trim() || 'a new friend';
  const uid = opts.uidSeed.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'playdate';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GoDoggyDate//Playdate//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:playdate-${uid}-${playdate.date}${minutes === null ? '' : `-${two(Math.floor(minutes / 60))}${two(minutes % 60)}`}@godoggydate.com`,
    `DTSTAMP:${icsStamp(opts.now ?? new Date())}`,
    ...dtLines,
    `SUMMARY:${icsEscape(`Playdate with ${dogName}`)}`,
    ...(place ? [`LOCATION:${icsEscape(place)}`] : []),
    `DESCRIPTION:${icsEscape('Arranged on GoDoggyDate. Meet in a public place and keep leashes on until the dogs are calm.')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldIcsLine).join('\r\n') + '\r\n';
}

/** A safe file name for the download, e.g. 'playdate-moose-2026-11-22.ics'. */
export function playdateIcsFileName(dogName: string, date: string): string {
  const slug = dogName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  return `playdate-${[slug, safeDate].filter(Boolean).join('-') || 'with-gdd'}.ics`;
}

// ── Match ids ────────────────────────────────────────────────────────────────

/**
 * The other person in a match, read from the match id itself. Matches are created
 * as `{dog1UserId}_{dog2UserId}` (firestore.rules enforces it), so when a match
 * document is gone, or unreadable, the id still says who was on the other side.
 * That is how a chat can tell "the other person left" from "this was never your
 * match": it looks the other dog up. Null when `myUid` is not one half of the id.
 */
export function otherUserIdFromMatchId(matchId: string, myUid: string): string | null {
  if (!matchId || !myUid) return null;
  if (matchId.startsWith(`${myUid}_`)) return matchId.slice(myUid.length + 1) || null;
  if (matchId.endsWith(`_${myUid}`)) return matchId.slice(0, matchId.length - myUid.length - 1) || null;
  return null;
}
