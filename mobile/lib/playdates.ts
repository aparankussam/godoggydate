// mobile/lib/playdates.ts
// Playdate dates and times, and message timestamps, for the chat, the match
// list and the Heads-Up card.
//
// What's stored: web writes playdate.date as 'YYYY-MM-DD' (from
// <input type="date">) and playdate.time as 'HH:MM', 24-hour (from
// <input type="time">), or '' when no time was picked. The iPhone now writes
// the same. iPhone builds before the date picker wrote free text instead
// ("Sat, July 12", "10:00 AM"). Those messages still exist, so they keep
// rendering exactly as typed, and resolvePlaydate() makes a best guess at when
// they were so the rating prompt and Heads-Up card can still work out whether
// the playdate has happened.
//
// No imports, so `node --test` can run the test file directly. No Intl or
// toLocaleString either, for the same reason as shared/dates.ts: Hermes' ICU
// support depends on build flags, so the same call can format differently on a
// phone. Fixed month and weekday tables cost nothing.

export interface PlaydateWhen {
  date: string;
  time?: string | null;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

const two = (n: number) => String(n).padStart(2, '0');

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function startOfDay(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local calendar day as 'YYYY-MM-DD', the format web stores. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Local wall-clock time as 'HH:MM', 24-hour, the format web stores. */
export function toIsoTime(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Strict 'YYYY-MM-DD' to local midnight, or null for anything else. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealCalendarDate(year, month, day)) return null;
  return new Date(year, month - 1, day);
}

/** Strict 'HH:MM' (24-hour) to minutes after midnight, or null. */
export function parseIsoTime(value: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const [hours, minutes] = [Number(m[1]), Number(m[2])];
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes after midnight to '3:30 PM'. */
export function formatClock(minutesAfterMidnight: number): string {
  const hours = Math.floor(minutesAfterMidnight / 60) % 24;
  const minutes = minutesAfterMidnight % 60;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${two(minutes)} ${suffix}`;
}

/** 'Sat, Nov 22', with the year added when it isn't the current one. */
export function formatDay(day: Date, now: number = Date.now()): string {
  const base = `${WEEKDAYS_SHORT[day.getDay()]}, ${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}`;
  return day.getFullYear() === new Date(now).getFullYear() ? base : `${base}, ${day.getFullYear()}`;
}

// ── Old free-text playdates ──────────────────────────────────────────────────

const MONTH_PATTERN = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

function monthIndex(word: string): number {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(word.slice(0, 3));
}

// A date typed without a year means the next one after the proposal was sent.
// The few days of grace cover a confirmation sent a day or two late.
function withInferredYear(month: number, day: number, year: number | null, sentAt: number | undefined): Date | null {
  if (year !== null) {
    return isRealCalendarDate(year, month + 1, day) ? new Date(year, month, day) : null;
  }
  if (sentAt === undefined) return null;
  const earliest = startOfDay(sentAt).getTime() - 3 * DAY_MS;
  const sentYear = new Date(sentAt).getFullYear();
  for (const candidate of [sentYear, sentYear + 1]) {
    if (!isRealCalendarDate(candidate, month + 1, day)) continue;
    const dt = new Date(candidate, month, day);
    if (dt.getTime() >= earliest) return dt;
  }
  return null;
}

function normaliseYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

function parseLegacyDate(text: string, sentAt: number | undefined): Date | null {
  const t = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return parseIsoDate(`${iso[1]}-${iso[2]}-${iso[3]}`);

  if (sentAt !== undefined) {
    if (/\b(today|tonight)\b/.test(t)) return startOfDay(sentAt);
    if (/\btomorrow\b/.test(t)) {
      const d = startOfDay(sentAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }

  // "July 12", "Sat, Jul 12 2026"
  const monthFirst = new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})\\b(?:,?\\s+(\\d{4}))?`).exec(t);
  if (monthFirst) {
    return withInferredYear(monthIndex(monthFirst[1]), Number(monthFirst[2]), normaliseYear(monthFirst[3]), sentAt);
  }

  // "12 July", "12 Jul 2026"
  const dayFirst = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_PATTERN}(?:,?\\s+(\\d{4}))?`).exec(t);
  if (dayFirst) {
    return withInferredYear(monthIndex(dayFirst[2]), Number(dayFirst[1]), normaliseYear(dayFirst[3]), sentAt);
  }

  // US "7/12" or "7/12/26"
  const slashed = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/.exec(t);
  if (slashed) {
    return withInferredYear(Number(slashed[1]) - 1, Number(slashed[2]), normaliseYear(slashed[3]), sentAt);
  }

  return null;
}

function parseLegacyTime(text: string | null | undefined): number | null {
  const t = (text ?? '').toLowerCase().trim();
  if (!t) return null;
  if (/\bnoon\b/.test(t)) return 12 * 60;
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  const meridiem = m[3]?.[0];
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'p' && hours !== 12) hours += 12;
    if (meridiem === 'a' && hours === 12) hours = 0;
  } else if (!m[2]) {
    // A bare number with no colon and no am/pm ("Saturday 10") is too vague.
    return null;
  } else if (hours >= 1 && hours <= 7) {
    // "3:30" for a dog playdate almost always means the afternoon.
    hours += 12;
  }
  return hours * 60 + minutes;
}

// ── Resolving a playdate ─────────────────────────────────────────────────────

export interface ResolvedPlaydate {
  /** Local midnight of the playdate's day. */
  day: Date;
  /** Minutes after midnight, or null when no time was given. */
  minutes: number | null;
  /** True for the 'YYYY-MM-DD' format web and the date picker write. */
  structured: boolean;
}

/**
 * When the playdate is. `sentAt` (the message's timestamp) is only used to
 * guess the year of an old free-text date. Returns null when the date can't
 * be read at all, e.g. "this weekend".
 */
export function resolvePlaydate(p: PlaydateWhen, sentAt?: number): ResolvedPlaydate | null {
  const isoDay = parseIsoDate(p.date);
  if (isoDay) {
    const isoMinutes = parseIsoTime(p.time);
    return {
      day: isoDay,
      minutes: isoMinutes ?? parseLegacyTime(p.time),
      structured: true,
    };
  }
  const legacyDay = parseLegacyDate(p.date ?? '', sentAt);
  if (!legacyDay) return null;
  return { day: legacyDay, minutes: parseLegacyTime(p.time), structured: false };
}

/** When the playdate starts, as epoch ms. A day with no time counts from midnight. */
export function playdateStartMs(p: PlaydateWhen, sentAt?: number): number | null {
  const r = resolvePlaydate(p, sentAt);
  if (!r) return null;
  const minutes = r.minutes ?? 0;
  return new Date(
    r.day.getFullYear(), r.day.getMonth(), r.day.getDate(), Math.floor(minutes / 60), minutes % 60,
  ).getTime();
}

/**
 * How long after the start time the "How did it go?" prompt waits, so it
 * doesn't ask while the dogs are still at the park.
 */
export const PLAYDATE_RATING_DELAY_MS = 60 * 60 * 1000;

export type PlaydatePhase = 'upcoming' | 'happened' | 'unknown';

/**
 * 'upcoming' until the playdate is over, then 'happened'. With a time, that's
 * an hour after the start. With only a day, it's once that day has ended,
 * which is what web does. 'unknown' when the date can't be read; such a
 * playdate gets neither the Heads-Up card nor a rating prompt.
 */
export function playdatePhase(p: PlaydateWhen, now: number = Date.now(), sentAt?: number): PlaydatePhase {
  const r = resolvePlaydate(p, sentAt);
  if (!r) return 'unknown';
  if (r.minutes === null) {
    const nextDay = new Date(r.day.getFullYear(), r.day.getMonth(), r.day.getDate() + 1).getTime();
    return now >= nextDay ? 'happened' : 'upcoming';
  }
  const start = playdateStartMs(p, sentAt) as number;
  return now >= start + PLAYDATE_RATING_DELAY_MS ? 'happened' : 'upcoming';
}

/**
 * For people: 'Sat, Nov 22 at 3:30 PM'. An old free-text playdate is shown
 * exactly as it was typed, as before.
 */
export function formatPlaydateWhen(p: PlaydateWhen, now: number = Date.now()): string {
  const isoDay = parseIsoDate(p.date);
  const rawTime = (p.time ?? '').trim();
  if (!isoDay) {
    const rawDate = (p.date ?? '').trim();
    return rawTime ? `${rawDate} at ${rawTime}` : rawDate;
  }
  const minutes = parseIsoTime(rawTime);
  const time = minutes !== null ? formatClock(minutes) : rawTime;
  return time ? `${formatDay(isoDay, now)} at ${time}` : formatDay(isoDay, now);
}

// ── Message timestamps ───────────────────────────────────────────────────────

/**
 * Under a chat message: '3:42 PM' today, 'Yesterday 3:42 PM', 'Mon 3:42 PM'
 * within the week, 'Nov 10, 3:42 PM' this year, 'Nov 10, 2025' before that.
 */
export function formatMessageTime(ms: number, now: number = Date.now()): string {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const clock = formatClock(d.getHours() * 60 + d.getMinutes());
  const days = Math.round((startOfDay(now).getTime() - startOfDay(ms).getTime()) / DAY_MS);
  if (days <= 0) return clock;
  if (days === 1) return `Yesterday ${clock}`;
  if (days < 7) return `${WEEKDAYS_SHORT[d.getDay()]} ${clock}`;
  const monthDay = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? `${monthDay}, ${clock}` : `${monthDay}, ${d.getFullYear()}`;
}
