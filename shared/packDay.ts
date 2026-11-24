// shared/packDay.ts
// Pack Day — an open group playdate any member can host at a PUBLIC place.
// Types, limits, copy, and pure helpers shared by the web routes. The Cloud
// Functions (firebase/functions/src/index.ts) enforce the same limits but are a
// separate deployable and cannot import this file — keep PACK_DAY_LIMITS in
// sync with the `PACK_DAY_*` constants there.
//
// WHY THE WALL-CLOCK STRINGS: an event is read by people in one community, so
// what they should see is the host's "Sat 11/21 · 9:00 AM", not a timezone
// conversion. localDate/localTime are stored beside startsAtMs and rendered with
// plain arithmetic — no Intl, which would differ between Next's server render
// and the browser (hydration mismatch) and between web and Hermes.

export type PackDayFormat = 'pack-walk' | 'small-dog' | 'slow-walk';

export const PACK_DAY_FORMATS: Record<PackDayFormat, { label: string; emoji: string; blurb: string }> = {
  'pack-walk': {
    label: 'Pack walk',
    emoji: '🦮',
    blurb: 'Everyone on leash, walking the same loop together. Easy first meetings.',
  },
  'small-dog': {
    label: 'Small-dog social',
    emoji: '🐩',
    blurb: 'Small dogs only, so nobody gets steamrolled.',
  },
  'slow-walk': {
    label: 'Slow parallel walk',
    emoji: '🐢',
    blurb: 'Dogs walk side by side with space between them. Made for nervous or reactive dogs.',
  },
};

export const PACK_DAY_FORMAT_KEYS = Object.keys(PACK_DAY_FORMATS) as PackDayFormat[];

export const PACK_DAY_LIMITS = {
  minCapacity: 4,
  maxCapacity: 12,
  defaultCapacity: 8,
  /** An event must start at least this far ahead, so attendees get notice. */
  minLeadMinutes: 60,
  maxLeadDays: 30,
  durationOptions: [45, 60, 90, 120] as const,
  defaultDurationMinutes: 60,
  /** Open (upcoming, not cancelled) events one host may have at a time. */
  maxOpenPerHost: 2,
  /** Upcoming events one member may be signed up for at a time. */
  maxActiveRsvpsPerMember: 5,
  maxTitleLength: 60,
  maxPlaceLength: 80,
  maxNoteLength: 280,
  /** Earliest and latest START time, as minutes after midnight on the host's
   *  wall clock: 6:00 AM to 9:45 PM, the hours public parks are open. The iPhone
   *  form offers exactly these chips; the web form and createPackDay hold the
   *  same line (firebase/functions/src/packDayWindow.ts mirrors these numbers,
   *  shared/packDay.test.ts checks the two agree). */
  earliestStartMinutes: 6 * 60,
  latestStartMinutes: 21 * 60 + 45,
  startStepMinutes: 15,
} as const;

function clockLabel(minutesAfterMidnight: number): string {
  const h = Math.floor(minutesAfterMidnight / 60);
  const m = minutesAfterMidnight % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const PACK_DAY_START_WINDOW_MESSAGE =
  `Pack Days start between ${clockLabel(PACK_DAY_LIMITS.earliestStartMinutes)} and ${clockLabel(PACK_DAY_LIMITS.latestStartMinutes)}, when public parks are open.`;

/** Every start time a host can pick, 'HH:MM' (24h) with its 12-hour label. */
export function packDayStartTimes(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (
    let m = PACK_DAY_LIMITS.earliestStartMinutes;
    m <= PACK_DAY_LIMITS.latestStartMinutes;
    m += PACK_DAY_LIMITS.startStepMinutes
  ) {
    out.push({ value: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, label: clockLabel(m) });
  }
  return out;
}

/** Why a start time ('HH:MM') can't be hosted, or null. Format first, then the window. */
export function packDayStartTimeProblem(localTime: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) return 'Pick a start time.';
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < PACK_DAY_LIMITS.earliestStartMinutes || minutes > PACK_DAY_LIMITS.latestStartMinutes) {
    return PACK_DAY_START_WINDOW_MESSAGE;
  }
  return null;
}

/** What the host and every attendee agrees to. Shown verbatim and recorded as accepted. */
export const PACK_DAY_RULES: readonly string[] = [
  'Dogs stay on leash until the host says otherwise.',
  'Only bring a dog that is up to date on vaccines and comfortable around other dogs.',
  'You supervise your own dog the whole time and clean up after it.',
  'If your dog is stressed or play turns rough, leave. Nobody will mind.',
];

export type PackDayStatus = 'open' | 'cancelled';

export interface PackDay {
  id: string;
  hostUid: string;
  hostDogName: string;
  title: string;
  format: PackDayFormat;
  /** UTC epoch ms — drives sorting, reminders and "is it over". */
  startsAtMs: number;
  durationMinutes: number;
  /** Host's wall clock, 'YYYY-MM-DD' and 'HH:MM' (24h). Display and .ics only. */
  localDate: string;
  localTime: string;
  placeName: string;
  city: string;
  state: string;
  note: string;
  capacity: number;
  attendeeUids: string[];
  status: PackDayStatus;
  /** Founder-hosted event. Set only by the Admin SDK; clients can never write it. */
  official: boolean;
  /** The host's first ever Pack Day (a "Founding Host" badge). Set only by createPackDay. */
  foundingHost?: boolean;
  /** Set on meetups generated by a recurring group (shared/packGroup.ts). */
  groupId?: string;
  /** Group meetups can be small-dogs-only; rsvpPackDay enforces it. */
  smallDogsOnly?: boolean;
}

// ── Check-in ────────────────────────────────────────────────────────────────
// packDays/{eventId}/checkins/{uid} = { uid, dogId, at, method }. firestore.rules
// enforces the same window with the same numbers (packDayCheckins block);
// shared/packDay.test.ts checks the rules file still contains them.

export type CheckinMethod = 'qr' | 'location';

/** Check-in opens this long before the start and closes when the event ends. */
export const CHECKIN_OPENS_BEFORE_MS = 30 * 60_000;

export function isCheckinOpen(
  event: Pick<PackDay, 'startsAtMs' | 'durationMinutes' | 'status'>,
  nowMs: number,
): boolean {
  return event.status === 'open' && nowMs >= event.startsAtMs - CHECKIN_OPENS_BEFORE_MS && !isPast(event, nowMs);
}

/** Distinct dogs checked in. A dog's owner and a household member can both tap "I'm here". */
export function checkedInDogCount(checkins: ReadonlyArray<{ dogId: string }>): number {
  return new Set(checkins.map((c) => c.dogId)).size;
}

/** Location is stored by city, so the "location" check is: the phone is in the event's city. */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
  return norm(a) !== '' && norm(a) === norm(b);
}

export function spotsLeft(event: Pick<PackDay, 'capacity' | 'attendeeUids'>): number {
  return Math.max(0, event.capacity - event.attendeeUids.length);
}

export function isPast(event: Pick<PackDay, 'startsAtMs' | 'durationMinutes'>, nowMs: number): boolean {
  return nowMs >= event.startsAtMs + event.durationMinutes * 60_000;
}

/** "3 of 8 dogs going", "3 of 8 dogs going · Full", or "Cancelled". A cancelled
 *  event used to keep showing its head count, which read as still on. */
export function goingSummary(
  event: Pick<PackDay, 'capacity' | 'status'> & { attendeeUids?: readonly string[]; attendeeCount?: number },
): string {
  if (event.status === 'cancelled') return 'Cancelled';
  const going = event.attendeeCount ?? event.attendeeUids?.length ?? 0;
  return `${going} of ${event.capacity} dogs going${going >= event.capacity ? ' · Full' : ''}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseLocalDate(localDate: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function parseLocalTime(localTime: string): { h: number; min: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) return null;
  return { h: Number(match[1]), min: Number(match[2]) };
}

/** "Sat 11/21 · 9:00 AM" — pure arithmetic so server and client render identically. */
export function formatPackDayWhen(event: Pick<PackDay, 'localDate' | 'localTime'>): string {
  const date = parseLocalDate(event.localDate);
  const time = parseLocalTime(event.localTime);
  if (!date || !time) return '';
  // Weekday from the calendar date alone; UTC avoids any local-zone shift.
  const weekday = WEEKDAYS[new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()];
  const hour12 = time.h % 12 === 0 ? 12 : time.h % 12;
  const suffix = time.h < 12 ? 'AM' : 'PM';
  return `${weekday} ${String(date.m).padStart(2, '0')}/${String(date.d).padStart(2, '0')} · ${hour12}:${String(time.min).padStart(2, '0')} ${suffix}`;
}

/** Search link for the place. We store a name, never coordinates or a street address. */
export function mapsSearchUrl(event: Pick<PackDay, 'placeName' | 'city' | 'state'>): string {
  const query = [event.placeName, event.city, event.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function utf8Size(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

/** RFC 5545 §3.1: content lines are folded at 75 octets (CRLF + one space),
 *  never in the middle of a UTF-8 character. Strict calendar apps (Outlook,
 *  some CalDAV servers) drop or garble a long SUMMARY/DESCRIPTION otherwise.
 *  Counts UTF-8 bytes by hand: no TextEncoder, which older Hermes lacks. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // Continuation lines start with a space, which counts toward their 75.
  let limit = 75;
  for (const char of line) {
    const size = utf8Size(char);
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** A single-event .ics using floating local time (no zone), so it lands at the
 *  host's wall-clock time on the attendee's calendar. */
export function buildPackDayIcs(event: PackDay, url: string): string | null {
  const date = parseLocalDate(event.localDate);
  const time = parseLocalTime(event.localTime);
  if (!date || !time) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${date.y}${pad(date.m)}${pad(date.d)}T${pad(time.h)}${pad(time.min)}00`;
  const endUtc = new Date(Date.UTC(date.y, date.m - 1, date.d, time.h, time.min + event.durationMinutes));
  const end = `${endUtc.getUTCFullYear()}${pad(endUtc.getUTCMonth() + 1)}${pad(endUtc.getUTCDate())}T${pad(endUtc.getUTCHours())}${pad(endUtc.getUTCMinutes())}00`;
  const stamp = new Date(event.startsAtMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GoDoggyDate//Pack Day//EN',
    'BEGIN:VEVENT',
    `UID:packday-${event.id}@godoggydate.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(`${event.title} (Pack Day)`)}`,
    `LOCATION:${icsEscape([event.placeName, event.city, event.state].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsEscape(`${PACK_DAY_FORMATS[event.format].label} with GoDoggyDate. Details and RSVP: ${url}`)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldIcsLine).join('\r\n') + '\r\n';
}
