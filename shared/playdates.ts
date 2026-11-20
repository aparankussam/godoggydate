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
