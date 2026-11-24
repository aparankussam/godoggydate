// firebase/functions/src/packGroupSchedule.ts
// Date math for recurring Pack Day groups, with NO imports so
// shared/packGroup.test.ts can import this very file (the functions package
// can't import shared/). Dates are wall-clock 'YYYY-MM-DD' strings, the same
// as packDays.localDate; only wallClockToUtcMs needs a time zone.

export type PackGroupFrequency = 'weekly' | 'biweekly' | 'monthly';
export const PACK_GROUP_FREQUENCIES: readonly PackGroupFrequency[] = ['weekly', 'biweekly', 'monthly'];

function parts(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar day ("2026-11-31" is not one). */
export function isRealDate(date: string): boolean {
  const p = parts(date);
  if (!p) return false;
  const rolled = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return rolled.getUTCMonth() === p.m - 1 && rolled.getUTCDate() === p.d;
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  const p = parts(date)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** Which week of the month the date falls in, capped at 4 so "5th Sunday"
 *  becomes "last-ish" and every month has one. */
export function ordinalOf(date: string): number {
  return Math.min(4, Math.ceil(parts(date)!.d / 7));
}

/** The occurrence after `date` (the previous scheduled date). Monthly keeps the
 *  weekday and week-of-month ("1st Sunday"). */
export function nextOccurrenceDate(frequency: PackGroupFrequency, date: string, ordinal: number): string {
  const p = parts(date)!;
  const day = Date.UTC(p.y, p.m - 1, p.d);
  if (frequency === 'weekly') return fmt(day + 7 * 86_400_000);
  if (frequency === 'biweekly') return fmt(day + 14 * 86_400_000);
  const weekday = new Date(day).getUTCDay();
  const firstOfNext = Date.UTC(p.y, p.m, 1);
  const firstWeekday = new Date(firstOfNext).getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return fmt(firstOfNext + (offset + (ordinal - 1) * 7) * 86_400_000);
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(f.find((x) => x.type === t)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - utcMs;
}

/** The UTC instant of a wall-clock date and 'HH:MM' in an IANA zone. Two passes
 *  so a time just after a daylight-saving change lands on the right offset. */
export function wallClockToUtcMs(date: string, time: string, timeZone: string): number {
  const p = parts(date)!;
  const [h, min] = time.split(':').map(Number);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, h, min);
  const first = asUtc - zoneOffsetMs(asUtc, timeZone);
  return asUtc - zoneOffsetMs(first, timeZone);
}

/** "Sun 12/06 · 9:00 AM" for push text (same look as shared formatPackDayWhen). */
export function whenLabel(date: string, time: string): string {
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(date)];
  const [h, m] = time.split(':').map(Number);
  return `${day} ${date.slice(5, 7)}/${date.slice(8, 10)} · ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
