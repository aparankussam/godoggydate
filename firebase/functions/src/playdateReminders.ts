// firebase/functions/src/playdateReminders.ts
// The decision logic behind the playdate reminders, with NO imports so it can
// be unit tested by plain `node --test` (shared/playdateReminders.test.ts
// imports this very file; there is no mirror copy to drift). playdates.ts
// wraps it with Firestore and push.
//
// What a confirmed playdate looks like in storage: a chat message
// (matches/{matchId}/messages/{id}) of type 'playdate_confirmed' carrying
// { date: 'YYYY-MM-DD', time: 'HH:MM' | '', place }. Both apps write the date
// and time as the proposer's WALL CLOCK, with no timezone, so this file has to
// pick one (see zoneForState and the timeZone the apps save with the push
// token) before it can say what "2 hours before" is.
//
// Three reminders per playdate and person, each at most once:
//   day_before     about 24 hours before the start
//   two_hours      about 2 hours before the start
//   how_did_it_go  2.5 hours after the start (the 2-3 hours the product asks for)
// Each one has a window (see REMINDER_WINDOWS_MS): the scheduler runs every 15
// minutes, so a reminder is due from its moment until the window closes. A late
// run (an outage) inside the window still sends; after it, nothing is sent,
// because "tomorrow" 3 hours before the meetup, or a rating prompt next week,
// would be wrong rather than late.

export type ReminderKind = 'day_before' | 'two_hours' | 'how_did_it_go';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export const DAY_BEFORE_LEAD_MS = 24 * HOUR_MS;
export const TWO_HOURS_LEAD_MS = 2 * HOUR_MS;
export const PROMPT_AFTER_START_MS = 2.5 * HOUR_MS;

/** How long after its moment a reminder may still go out. */
export const REMINDER_WINDOWS_MS: Record<ReminderKind, number> = {
  day_before: 90 * MINUTE_MS,
  two_hours: 60 * MINUTE_MS,
  how_did_it_go: 6 * HOUR_MS,
};

/** Local hours in which the "day before" and "how did it go" pushes wait for
 *  morning. The 2-hour reminder never waits: it is tied to a time the people
 *  chose themselves. */
const QUIET_FROM_HOUR = 22;
const QUIET_UNTIL_HOUR = 8;
/** A date with no time: reminders count from noon, the prompt comes at 8 PM. */
const NOMINAL_START_HOUR = 12;
const NOMINAL_PROMPT_HOUR = 20;

// ── Strict parsing (same rules as shared/playdates.ts) ─────────────────────────

export interface IsoDate { y: number; m: number; d: number }

/** Strict 'YYYY-MM-DD' that is a real calendar day, or null. A date typed as
 *  text by an older iPhone build ("Sat, July 12") is null: it can't be placed
 *  on a calendar, so it never gets a reminder or a rating prompt. */
export function parseIsoDate(value: unknown): IsoDate | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1970 || y > 2200) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** Strict 24-hour 'HH:MM', or null (also for '' and for free text like "3pm"). */
export function parseClock(value: unknown): { h: number; min: number } | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

// ── Time zones ─────────────────────────────────────────────────────────────────

const ZONE_BY_STATE: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
};

/** The main time zone of a US state ('MI' or 'michigan' is not looked up: the
 *  profile stores the two-letter code). A fallback for a person whose device
 *  never told us its zone; states split across zones get their larger part. */
export function zoneForState(state: unknown): string | null {
  if (typeof state !== 'string') return null;
  return ZONE_BY_STATE[state.trim().toUpperCase()] ?? null;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** True for an IANA zone name this runtime knows ('America/Detroit'). */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    formatterFor(timeZone).format(0);
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts { y: number; m: number; d: number; hour: number; minute: number; weekday: number }

/** The wall clock in `timeZone` at the instant `ms`. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return {
    y, m, d,
    hour: get('hour') % 24,
    minute: get('minute'),
    weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
  };
}

/** Milliseconds `timeZone` is ahead of UTC at the instant `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, 0);
  return asUtc - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/** The instant a wall-clock time happens in `timeZone`. A time the clocks skip
 *  (spring forward) lands an hour later, as `new Date(...)` does; a time they
 *  repeat (fall back) takes the first of the two. Month/day may overflow
 *  (day 32 = next month's 1st). */
export function wallTimeToUtcMs(y: number, m: number, d: number, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  if (second === first) return first;
  // The offset differs on the two sides of a change. If the earlier guess is
  // consistent with its own offset it wins (the first of a repeated hour).
  const earlier = Math.min(first, second);
  const later = Math.max(first, second);
  return offsetAt(earlier, timeZone) === guess - earlier ? earlier : later;
}

// ── The playdate and its timeline ──────────────────────────────────────────────

export interface PlaydateFields {
  date: unknown;
  time?: unknown;
  place?: unknown;
}

export interface PlaydateStart {
  /** The start instant; noon local for a playdate with no time. */
  startMs: number;
  /** False for a date-only playdate: nothing counts down to a clock time. */
  hasTime: boolean;
  /** When the "how did it go?" prompt is first due, before the quiet-hours wait. */
  promptMs: number;
}

export function computePlaydateStart(playdate: PlaydateFields, timeZone: string): PlaydateStart | null {
  const date = parseIsoDate(playdate.date);
  if (!date) return null;
  const clock = parseClock(playdate.time);
  if (clock) {
    const startMs = wallTimeToUtcMs(date.y, date.m, date.d, clock.h, clock.min, timeZone);
    return { startMs, hasTime: true, promptMs: startMs + PROMPT_AFTER_START_MS };
  }
  return {
    startMs: wallTimeToUtcMs(date.y, date.m, date.d, NOMINAL_START_HOUR, 0, timeZone),
    hasTime: false,
    promptMs: wallTimeToUtcMs(date.y, date.m, date.d, NOMINAL_PROMPT_HOUR, 0, timeZone),
  };
}

/** The first moment at or after `ms` that is outside quiet hours (10 PM-8 AM local). */
export function afterQuietHours(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  if (p.hour >= QUIET_FROM_HOUR) return wallTimeToUtcMs(p.y, p.m, p.d + 1, QUIET_UNTIL_HOUR, 0, timeZone);
  if (p.hour < QUIET_UNTIL_HOUR) return wallTimeToUtcMs(p.y, p.m, p.d, QUIET_UNTIL_HOUR, 0, timeZone);
  return ms;
}

/** The end of a window that starts at `fromMs` (outside quiet hours): the
 *  window's length, but never into the evening quiet hours, so a late run can't
 *  push at 11 PM something that was due at 5 PM. */
function windowEnd(fromMs: number, windowMs: number, timeZone: string): number {
  const p = localParts(fromMs, timeZone);
  const quietStartMs = wallTimeToUtcMs(p.y, p.m, p.d, QUIET_FROM_HOUR, 0, timeZone);
  return quietStartMs > fromMs ? Math.min(fromMs + windowMs, quietStartMs) : fromMs + windowMs;
}

export interface ScheduledReminder {
  kind: ReminderKind;
  /** Due from here... */
  fromMs: number;
  /** ...until here (exclusive). */
  untilMs: number;
}

/**
 * Every reminder this playdate can still produce, with its window. A reminder
 * whose moment came before the playdate was confirmed is left out: the people
 * had just agreed to it, so "tomorrow" an hour after saying yes is noise.
 * Empty for a date that isn't a real ISO date.
 */
export function reminderSchedule(playdate: PlaydateFields, timeZone: string, confirmedAtMs: number): ScheduledReminder[] {
  const start = computePlaydateStart(playdate, timeZone);
  if (!start) return [];
  const out: ScheduledReminder[] = [];

  const dayBeforeMs = start.startMs - DAY_BEFORE_LEAD_MS;
  if (confirmedAtMs <= dayBeforeMs) {
    const fromMs = afterQuietHours(dayBeforeMs, timeZone);
    // Waiting for morning must not run into the 2-hour reminder's neighbourhood.
    if (fromMs <= start.startMs - 4 * HOUR_MS) {
      out.push({ kind: 'day_before', fromMs, untilMs: windowEnd(fromMs, REMINDER_WINDOWS_MS.day_before, timeZone) });
    }
  }

  if (start.hasTime) {
    const twoHoursMs = start.startMs - TWO_HOURS_LEAD_MS;
    if (confirmedAtMs <= twoHoursMs) {
      out.push({ kind: 'two_hours', fromMs: twoHoursMs, untilMs: twoHoursMs + REMINDER_WINDOWS_MS.two_hours });
    }
  }

  if (confirmedAtMs <= start.promptMs) {
    const fromMs = afterQuietHours(start.promptMs, timeZone);
    out.push({ kind: 'how_did_it_go', fromMs, untilMs: windowEnd(fromMs, REMINDER_WINDOWS_MS.how_did_it_go, timeZone) });
  }
  return out;
}

/** What should go out at `nowMs`. Whether it already did is the caller's
 *  marker check, not this function's business. */
export function dueReminders(playdate: PlaydateFields, timeZone: string, confirmedAtMs: number, nowMs: number): ReminderKind[] {
  return reminderSchedule(playdate, timeZone, confirmedAtMs)
    .filter((r) => nowMs >= r.fromMs && nowMs < r.untilMs)
    .map((r) => r.kind);
}

// ── Which playdate counts ──────────────────────────────────────────────────────

export interface ConfirmedMessage {
  id: string;
  date: unknown;
  time?: unknown;
  place?: unknown;
  /** When the confirmation was written (the document's server create time). Orders confirmations. */
  createdAtMs: number;
  /** The message's own createdAt field, if it has one. It is client-supplied, so
   *  it only ever counts when it is EARLIER than the create time (see confirmedAtMs). */
  claimedAtMs?: number;
  /** Set by the content filter, which also removes the playdate card. */
  moderated?: boolean;
}

/** When the people agreed to the playdate, for "was this confirmed before that
 *  reminder's moment". The server create time, or the message's own createdAt
 *  when that is earlier (a backfilled or imported message). Never later than the
 *  create time, so a client can't make a reminder fire that wouldn't have. */
export function confirmedAtMs(m: Pick<ConfirmedMessage, 'createdAtMs' | 'claimedAtMs'>): number {
  return typeof m.claimedAtMs === 'number' && Number.isFinite(m.claimedAtMs)
    ? Math.min(m.createdAtMs, m.claimedAtMs)
    : m.createdAtMs;
}

/** Same identity the chat uses for "is this proposal confirmed": date|time|place. */
export function playdateKey(p: PlaydateFields): string {
  return `${String(p.date ?? '')}|${String(p.time ?? '')}|${String(p.place ?? '')}`;
}

/** Newer by create time; within the same millisecond by the message's own
 *  createdAt, then by id, so every run (and every order) picks the same one. */
function isNewerConfirmation(a: ConfirmedMessage, b: ConfirmedMessage): boolean {
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs > b.createdAtMs;
  const claimedA = a.claimedAtMs ?? Number.NEGATIVE_INFINITY;
  const claimedB = b.claimedAtMs ?? Number.NEGATIVE_INFINITY;
  if (claimedA !== claimedB) return claimedA > claimedB;
  return a.id > b.id;
}

/**
 * The one confirmed playdate that counts for a match: the most recently
 * confirmed. A newer confirmation replaces an older one (a rescheduled
 * playdate), and two people accepting the same proposal at once leave two
 * confirmations of the same playdate, which are one. Moderated messages and
 * dates that aren't real ISO dates (older iPhone builds stored free text) are
 * ignored, like the chat does.
 */
export function latestConfirmedPlaydate(messages: ConfirmedMessage[]): ConfirmedMessage | null {
  let best: ConfirmedMessage | null = null;
  for (const m of messages) {
    if (m.moderated === true || parseIsoDate(m.date) === null) continue;
    if (best === null || isNewerConfirmation(m, best)) best = m;
  }
  return best;
}

// ── The notification ───────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clockText(h: number, min: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dayIndex(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / (24 * HOUR_MS));
}

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export interface ReminderPushInput {
  /** The OTHER dog in the match. Never an owner's name. */
  dogName: string;
  playdate: PlaydateFields;
  timeZone: string;
  nowMs: number;
}

/** Title and body. Names the other dog and the place the match itself agreed on;
 *  nothing else about either person. */
export function buildReminderPush(kind: ReminderKind, input: ReminderPushInput): { title: string; body: string } {
  const dog = clean(input.dogName, 40) || 'your match';
  const place = clean(input.playdate.place, 60);
  const date = parseIsoDate(input.playdate.date);
  const clock = parseClock(input.playdate.time);
  const where = place ? ` · ${place}` : '';

  if (kind === 'how_did_it_go') {
    return {
      title: `How did it go with ${dog}? 🐾`,
      body: 'Tell us how the playdate went. Your rating is private and helps keep playdates safe.',
    };
  }
  if (!date) return { title: `Playdate with ${dog}`, body: place };

  const weekday = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  const clockPart = clock ? clockText(clock.h, clock.min) : '';

  if (kind === 'two_hours') {
    return {
      title: `Playdate with ${dog} in about 2 hours 🐾`,
      body: `${clockPart}${where}`.replace(/^ · /, ''),
    };
  }

  // day_before: say "tomorrow" only when it is, in the person's own calendar.
  const today = localParts(input.nowMs, input.timeZone);
  const diff = dayIndex(date.y, date.m, date.d) - dayIndex(today.y, today.m, today.d);
  const rel = diff === 1 ? 'tomorrow' : diff === 0 ? 'today' : `on ${WEEKDAYS_LONG[weekday]}`;
  const when = `${WEEKDAYS[weekday]}, ${MONTHS[date.m - 1]} ${date.d}${clockPart ? ` at ${clockPart}` : ''}`;
  return {
    title: `Playdate with ${dog} ${rel} 🐾`,
    body: `${when}${where}`,
  };
}
