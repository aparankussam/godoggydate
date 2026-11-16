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
} as const;

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
}

export function spotsLeft(event: Pick<PackDay, 'capacity' | 'attendeeUids'>): number {
  return Math.max(0, event.capacity - event.attendeeUids.length);
}

export function isPast(event: Pick<PackDay, 'startsAtMs' | 'durationMinutes'>, nowMs: number): boolean {
  return nowMs >= event.startsAtMs + event.durationMinutes * 60_000;
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
  ].join('\r\n');
}
