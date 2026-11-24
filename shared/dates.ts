// shared/dates.ts
// ONE place for US date entry (MM/DD/YYYY) and US date display, shared by web
// and mobile so the two platforms can never again teach different formats for
// the same Firestore field.
//
// THE RULE THAT SHAPES THIS FILE: what is STORED never changes. birthYear /
// birthMonth / birthDay stay three separate numbers, adoptionDate stays
// 'YYYY-MM-DD' | 'YYYY-MM', rabiesExpiry stays 'YYYY-MM-DD'. Existing profiles,
// firestore.rules, shared/milestones.ts, shared/lifeStage.ts and the celebration
// Cloud Function all keep reading exactly what they read today. Only what the
// owner TYPES and what they SEE becomes US-formatted.
//
// NO Intl / toLocaleDateString anywhere in here, for two independent reasons
// already documented in shared/profile.ts: (1) these strings render on Next's
// SSR path, and a locale that differs between server and client is a hydration
// mismatch; (2) Hermes/React Native's ICU support is build-flag dependent, so
// the same call can format differently on a phone. MM/DD/YYYY is pure
// arithmetic + padStart, so avoiding Intl costs nothing.

/** A date the owner may only partly know — a rescue owner often has the year,
 *  sometimes the month, rarely the exact day. */
export interface PartialDate {
  year: number;
  month: number | null; // 1–12
  day: number | null; // 1–31
}

export type ParseFailure = 'empty' | 'unrecognized' | 'impossible';

export type ParseResult =
  | { ok: true; value: PartialDate }
  | { ok: false; reason: ParseFailure };

/** Fixed English month names — see the no-Intl note above. */
export const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * True only if y/m(1–12)/d is a REAL calendar date. JS rolls 2026-02-30 forward
 * to March 2nd rather than rejecting it, so round-trip the parts.
 *
 * This is the one canonical implementation; it replaces the copies that had
 * drifted across ProfileEditor, DogProfileForm, DiptychSection, RemindersSection
 * and parseLocalIsoDate. Year BOUNDS are deliberately NOT baked in — callers
 * genuinely differ (reminders want future dates, birthdays want 1990..today),
 * so bounds stay a caller concern.
 */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * Parse what the owner typed into a US date box. Accepts, with or without
 * zero-padding: 'MM/DD/YYYY', 'MM/YYYY', 'YYYY'.
 *
 * DEGRADES rather than rejects — this preserves today's behaviour exactly:
 * '02/31/2021' keeps year+month and drops only the impossible day, because the
 * owner clearly knows the month and losing that would be worse than ignoring a
 * typo'd day. A wholly unrecognisable string is a hard failure so the caller can
 * show an error instead of silently writing null over a good stored date.
 */
export function parseUsDateInput(raw: string | null | undefined): ParseResult {
  // A trailing slash is just a separator the owner hasn't followed yet — and a
  // trailing space (which the mask turns into one) is easy to leave behind on a
  // phone keyboard. "2021 " / "06/2021/" are the date they obviously meant, not
  // an error.
  const text = (raw ?? '').trim().replace(/\/+$/, '');
  if (!text) return { ok: false, reason: 'empty' };

  const parts = text.split('/').map((p) => p.trim());
  if (parts.some((p) => p !== '' && !/^\d+$/.test(p))) {
    return { ok: false, reason: 'unrecognized' };
  }

  let year: number;
  let month: number | null = null;
  let day: number | null = null;

  if (parts.length === 1) {
    // 'YYYY'
    if (!/^\d{4}$/.test(parts[0])) return { ok: false, reason: 'unrecognized' };
    year = Number(parts[0]);
  } else if (parts.length === 2) {
    // 'MM/YYYY'
    if (!/^\d{1,2}$/.test(parts[0]) || !/^\d{4}$/.test(parts[1])) {
      return { ok: false, reason: 'unrecognized' };
    }
    month = Number(parts[0]);
    year = Number(parts[1]);
  } else if (parts.length === 3) {
    // 'MM/DD/YYYY'
    if (
      !/^\d{1,2}$/.test(parts[0]) ||
      !/^\d{1,2}$/.test(parts[1]) ||
      !/^\d{4}$/.test(parts[2])
    ) {
      return { ok: false, reason: 'unrecognized' };
    }
    month = Number(parts[0]);
    day = Number(parts[1]);
    year = Number(parts[2]);
  } else {
    return { ok: false, reason: 'unrecognized' };
  }

  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    return { ok: false, reason: 'unrecognized' };
  }
  if (month !== null && (month < 1 || month > 12)) {
    return { ok: false, reason: 'impossible' };
  }
  // A day the calendar doesn't have (Feb 31) drops to null but keeps year+month.
  if (day !== null && (month === null || !isRealCalendarDate(year, month, day))) {
    day = null;
  }

  return { ok: true, value: { year, month, day } };
}

// ── Display ──────────────────────────────────────────────────────────────────

/** '08/26/2026' — the app's one absolute-date format. */
export function formatUsDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${two(date.getMonth() + 1)}/${two(date.getDate())}/${date.getFullYear()}`;
}

/** Strict 'YYYY-MM-DD' → '08/26/2026'. Returns null for anything else, so a
 *  malformed stored value is never rendered as a fake date. */
export function formatUsIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealCalendarDate(year, month, day)) return null;
  return `${two(month)}/${two(day)}/${year}`;
}

/** 'August 2026' — for month-granular labels ("Member since…"), where a bare
 *  '08/2026' reads worse than a spelled month. Fixed table, never Intl. */
export function formatUsMonthYear(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${MONTH_NAMES_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** Render a PartialDate back into the box the owner types in:
 *  '06/14/2021' | '06/2021' | '2021' | ''. */
export function formatUsPartial(partial: PartialDate | null | undefined): string {
  if (!partial || !Number.isInteger(partial.year)) return '';
  const { year, month, day } = partial;
  if (month === null) return String(year);
  if (day === null) return `${two(month)}/${year}`;
  return `${two(month)}/${two(day)}/${year}`;
}

// ── Birthday bridge (three stored numbers ⇄ one input box) ────────────────────

/** The lower bound shared/lifeStage.ts enforces (`birthYear < 1990` → no life
 *  stage). Keeping the input in step with it means a saved birthday always
 *  actually powers the Life Stage card. */
export const MIN_BIRTH_YEAR = 1990;

export interface BirthFields {
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
}

/** Stored numbers → the input box's value. */
export function partialFromBirthFields(
  birthYear?: number | null,
  birthMonth?: number | null,
  birthDay?: number | null,
): PartialDate | null {
  if (typeof birthYear !== 'number' || !Number.isInteger(birthYear)) return null;
  const month = typeof birthMonth === 'number' && birthMonth >= 1 && birthMonth <= 12 ? birthMonth : null;
  const day =
    month !== null &&
    typeof birthDay === 'number' &&
    isRealCalendarDate(birthYear, month, birthDay)
      ? birthDay
      : null;
  return { year: birthYear, month, day };
}

/**
 * The input box's value → the three stored numbers, applying the SAME rules the
 * two save paths already applied: the year must sit in 1990..thisYear, and the
 * day survives only when a valid year AND month make a real calendar date.
 * Out-of-range input yields all-null (the caller blocks the save and shows an
 * error rather than writing that null — see the validation note in the forms).
 */
export function birthFieldsFromPartial(
  partial: PartialDate | null | undefined,
  now: Date = new Date(),
): BirthFields {
  const empty: BirthFields = { birthYear: null, birthMonth: null, birthDay: null };
  if (!partial) return empty;
  const { year, month, day } = partial;
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > now.getFullYear()) return empty;
  const safeMonth = month !== null && month >= 1 && month <= 12 ? month : null;
  const safeDay =
    safeMonth !== null && day !== null && isRealCalendarDate(year, safeMonth, day) ? day : null;
  return { birthYear: year, birthMonth: safeMonth, birthDay: safeDay };
}

/** True when a birth year is outside the range shared/lifeStage.ts accepts. */
export function isBirthYearInRange(year: number, now: Date = new Date()): boolean {
  return Number.isInteger(year) && year >= MIN_BIRTH_YEAR && year <= now.getFullYear();
}

/**
 * True when a (possibly partial) date lies after today. A year-only date is in
 * the future only if the YEAR is; a month+year only if that MONTH hasn't begun;
 * a full date only if the DAY hasn't arrived. So 11/2026 is fine on 11/20/2026
 * (the month is under way) but 12/2026 is not.
 */
export function isPartialDateInFuture(partial: PartialDate, now: Date = new Date()): boolean {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (partial.year !== y) return partial.year > y;
  if (partial.month === null) return false;
  if (partial.month !== m) return partial.month > m;
  if (partial.day === null) return false;
  return partial.day > d;
}

/**
 * Why a typed birthday can't be saved, as the message to show, or null if it
 * can. Two separate failures: the year is outside what Life Stage understands
 * (before 1990), and the date simply hasn't happened yet — a dog can't have been
 * born after today, and a "birthday" of 12/25 typed in November would otherwise
 * count down to a first birthday that is really a birth.
 */
export function birthDateProblem(partial: PartialDate, now: Date = new Date()): string | null {
  if (!isBirthYearInRange(partial.year, now)) {
    return `Year must be between ${MIN_BIRTH_YEAR} and ${now.getFullYear()}`;
  }
  if (isPartialDateInFuture(partial, now)) return "That date hasn't happened yet";
  return null;
}

/**
 * Same idea for Gotcha Day ("the day they came home"): not before 1990, and not
 * in the future. A future Gotcha Day was silently accepted and then did nothing
 * (milestones needs a full year to pass).
 */
export function adoptionDateProblem(partial: PartialDate, now: Date = new Date()): string | null {
  if (!isBirthYearInRange(partial.year, now)) {
    return `Year must be between ${MIN_BIRTH_YEAR} and ${now.getFullYear()}`;
  }
  if (isPartialDateInFuture(partial, now)) return "Gotcha Day can't be in the future";
  return null;
}

/** How far ahead a rabies expiry may sit. Rabies certificates run 1–3 years; a
 *  typo like 2207 for 2027 would otherwise print "valid through 04/18/2207" on
 *  the public profile for ever. */
export const MAX_RABIES_YEARS_AHEAD = 10;

/** Why a typed rabies expiry can't be saved, or null. A PAST expiry is valid —
 *  "expired" is exactly what this field exists to show — but not an absurd one. */
export function rabiesExpiryProblem(partial: PartialDate, now: Date = new Date()): string | null {
  const maxYear = now.getFullYear() + MAX_RABIES_YEARS_AHEAD;
  if (!Number.isInteger(partial.year) || partial.year < MIN_BIRTH_YEAR || partial.year > maxYear) {
    return `Year must be between ${MIN_BIRTH_YEAR} and ${maxYear}`;
  }
  return null;
}

/**
 * Where to put the caret after the mask rewrote what the owner just typed.
 *
 * A controlled <input> whose value is changed under it sends the caret to the
 * END, so editing mid-string (insert a digit, backspace over a slash) used to
 * fling the caret away and turn the next keystroke into garbage. Typing at the
 * end is unchanged. Elsewhere the caret keeps its place among the DIGITS: the
 * same number of digits sit to its left as before, and a separator the owner
 * just typed is stepped over.
 */
export function maskedCaretPosition(raw: string, caret: number, masked: string): number {
  if (caret >= raw.length) return masked.length;
  const before = raw.slice(0, caret);
  const digits = (before.match(/\d/g) ?? []).length;
  let pos = 0;
  let seen = 0;
  while (pos < masked.length && seen < digits) {
    if (/\d/.test(masked[pos])) seen += 1;
    pos += 1;
  }
  // The owner's last keystroke was a separator ("06/" with more after it), so
  // the caret belongs after that slash, not before it.
  if (before.length > 0 && !/\d/.test(before[before.length - 1]) && masked[pos] === '/') pos += 1;
  return pos;
}

// ── Gotcha Day bridge (one polymorphic string ⇄ one input box) ────────────────

/**
 * The input box's value → the stored string, ALWAYS zero-padded.
 *
 * Zero-padding is load-bearing, not cosmetic: shared/milestones.ts's parser and
 * the web form's rehydrate both match `^\d{4}-\d{2}(-\d{2})?$`, and the
 * celebration Cloud Function demands the same shape. An unpadded '2021-8' would
 * be silently unreadable — the field would render blank and the owner's next
 * save would write null over it.
 *
 * Returns null when there is no month: adoptionDate has NO year-only stored
 * form, and inventing one (e.g. 'YYYY-01') would fabricate a January Gotcha Day
 * and fire a wrong celebration push.
 */
export function toAdoptionDateIso(partial: PartialDate | null | undefined): string | null {
  if (!partial || !Number.isInteger(partial.year)) return null;
  const { year, month, day } = partial;
  if (month === null || month < 1 || month > 12) return null;
  if (day !== null && isRealCalendarDate(year, month, day)) {
    return `${year}-${two(month)}-${two(day)}`;
  }
  return `${year}-${two(month)}`;
}

/** The stored string → the input box's value. Accepts both stored shapes. */
export function partialFromAdoptionDate(iso: string | null | undefined): PartialDate | null {
  if (!iso) return null;
  const text = iso.trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (full) {
    const [year, month, day] = [Number(full[1]), Number(full[2]), Number(full[3])];
    if (!isRealCalendarDate(year, month, day)) return null;
    return { year, month, day };
  }
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(text);
  if (monthOnly) {
    const [year, month] = [Number(monthOnly[1]), Number(monthOnly[2])];
    if (month < 1 || month > 12) return null;
    return { year, month, day: null };
  }
  return null;
}

/** A full 'YYYY-MM-DD' from the input box (rabies expiry — always exact). */
export function toIsoDate(partial: PartialDate | null | undefined): string | null {
  if (!partial || partial.month === null || partial.day === null) return null;
  const { year, month, day } = partial;
  if (!isRealCalendarDate(year, month, day)) return null;
  return `${year}-${two(month)}-${two(day)}`;
}

/** 'YYYY-MM-DD' → the input box's value. */
export function partialFromIsoDate(iso: string | null | undefined): PartialDate | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealCalendarDate(year, month, day)) return null;
  return { year, month, day };
}

// ── Reminder due-date wording ────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start of the LOCAL calendar day containing `ms` — the same rule
 * completeReminder() and TodayPanel already use to judge on-time. "Due today"
 * is a wall-clock idea in the owner's own timezone, so every surface must agree
 * about which day it is.
 */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** How far a reminder's due date may sit from today. A booster really can be a
 *  few months overdue, but "45,979 days overdue" (a typed 0001) is nobody's
 *  reminder, and Firestore refuses a Timestamp past year 9999. */
export const REMINDER_MAX_YEARS_BACK = 5;
export const REMINDER_MAX_YEARS_AHEAD = 30;

/** Why a reminder due date (unix ms) can't be saved, as the message to show, or null. */
export function reminderDueDateProblem(dueDate: number, now: number = Date.now()): string | null {
  if (!Number.isFinite(dueDate)) return 'Pick a valid date';
  const today = new Date(now);
  const earliest = new Date(today.getFullYear() - REMINDER_MAX_YEARS_BACK, 0, 1).getTime();
  const latest = new Date(today.getFullYear() + REMINDER_MAX_YEARS_AHEAD + 1, 0, 1).getTime();
  if (dueDate < earliest || dueDate >= latest) {
    return `Pick a date between ${today.getFullYear() - REMINDER_MAX_YEARS_BACK} and ${today.getFullYear() + REMINDER_MAX_YEARS_AHEAD}`;
  }
  return null;
}

/** Whole local calendar days from today to the due date. 0 = today, -1 = yesterday. */
export function calendarDaysUntil(dueDate: number, now: number = Date.now()): number {
  // `|| 0` normalises -0 (Math.round of a small negative) to 0, so callers can
  // compare with === and never render "-0 days".
  return Math.round((startOfLocalDay(dueDate) - startOfLocalDay(now)) / DAY_MS) || 0;
}

/**
 * The one wording ladder for a reminder's due date, so the same reminder can't
 * describe itself two different ways on two tabs. This was triplicated across
 * web/components/RemindersSection, web/components/TodayPanel and
 * web/components/HandoffCard (each carrying a comment saying they must stay in
 * sync) plus a fourth copy on mobile.
 *
 * Counts whole LOCAL CALENDAR days, not elapsed 24h blocks: a reminder due at
 * 9am tomorrow is "Due tomorrow", not "Due today" because it is 23 hours out.
 *
 * The absolute fallback now carries a YEAR. Without it a booster due in 14
 * months read identically to one due in 2 — the exact case this field exists
 * to disambiguate.
 */
export function reminderDueLabel(
  dueDate: number,
  now: number = Date.now(),
): { text: string; urgent: boolean; days: number } {
  const days = calendarDaysUntil(dueDate, now);
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `${n} day${n === 1 ? '' : 's'} overdue`, urgent: true, days };
  }
  if (days === 0) return { text: 'Due today', urgent: true, days };
  if (days === 1) return { text: 'Due tomorrow', urgent: true, days };
  if (days <= 7) return { text: `Due in ${days} days`, urgent: false, days };
  return { text: `Due ${formatUsDate(new Date(dueDate))}`, urgent: false, days };
}

/**
 * The next moment the local clock reads hour:minute: later today if that's
 * still ahead, otherwise tomorrow. A daily medicine's first due time.
 */
export function nextDoseAt(hour: number, minute: number, now: number = Date.now()): number {
  const d = new Date(now);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** "8:00 AM" — the time of day a dose is due. */
export function formatDoseTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** True when `then` falls on the same local calendar day as `now`. */
export function isSameLocalDay(then: number | undefined, now: number = Date.now()): boolean {
  return then !== undefined && calendarDaysUntil(then, now) === 0;
}

// ── Input masking ────────────────────────────────────────────────────────────

// A segment is "complete" when no further digit can belong to it, so the next
// digit starts the next segment. These decide where a slash goes when the owner
// types digits only.
//
// The hard part is the two SHORTER shapes the boxes advertise: "2021" (year
// only) and "06/2021" (month + year). A mask that blindly rebuilt MM/DD/YY from
// digits turned "062021" into "06/20/21" and "2021" into "20/21", which broke
// both. So the rules below only split where the digits themselves settle it,
// and otherwise wait for more.

/** A year in this app starts 19 or 20, so those two digits can't be a month. */
const isYearPrefix = (two: string) => two === '19' || two === '20';

/** Month segment: '3'–'9' can only be a one-digit month, '00'–'12' a two-digit
 *  one. '1' and '2' stay open (they may start 10–12 or 19xx/20xx), and '13'+
 *  is a year being typed, not a month. */
function monthIsComplete(seg: string): boolean {
  if (seg.length === 1) return seg >= '3';
  if (seg.length === 2) return Number(seg) <= 12;
  return false;
}

/** Middle segment: '4'–'9' can only be a one-digit day, and any other two
 *  digits are a day (even an impossible 32, which stays visible in the box and
 *  is dropped on save, same as when typed with slashes) — except '19' and '20',
 *  which are just as likely the start of a year ("06/2021"), so those wait for
 *  more digits. */
function dayIsComplete(seg: string): boolean {
  if (seg.length === 1) return seg >= '4';
  if (seg.length === 2) return !isYearPrefix(seg);
  return false;
}

/**
 * Shape what the owner is typing in a US date box into MM/DD/YYYY.
 *
 * - Slashes they type are kept. Dashes, dots and spaces count as slashes, and a
 *   complete 'YYYY-MM-DD' is turned around into MM/DD/YYYY.
 * - Typing DIGITS ONLY works too, which matters because a phone's numeric
 *   keypad has no "/" key: "06142021" becomes "06/14/2021", "062021" becomes
 *   "06/2021", and "2021" stays "2021". Typed this way, months 1–2 and days 1–3
 *   need their leading zero ("01", "03"): a bare 1, 2 or 3 could be the start
 *   of a two-digit number or a year. Months 3–9 and days 4–9 don't.
 * - A slash is only added when the NEXT digit arrives, never at the end, so
 *   backspacing over one always works.
 * - Each segment is capped (month 2, day 2, year 4), and the value is stable:
 *   masking an already-masked value changes nothing.
 *
 * The one visible wobble: a day of 19 or 20 typed digits-only shows as
 * "06/2020" until the fifth digit shows it was a day, then re-splits to
 * "06/20/202". Typing the slash yourself avoids it.
 */
export function maskUsDateInput(raw: string): string {
  const text = raw ?? '';

  // 'YYYY-MM-DD' (pasted from a form or spreadsheet). Only once complete, so
  // nobody typing it digit by digit is flipped halfway through.
  const iso = /^\s*(\d{4})[-./\s](\d{2})[-./\s](\d{2})\s*$/.exec(text);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;

  const cleaned = text
    .replace(/[-.\s]+/g, '/')
    .replace(/[^\d/]/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\//, '');

  const segs: string[] = [''];
  for (const ch of cleaned) {
    const i = segs.length - 1;
    const cur = segs[i];

    if (ch === '/') {
      if (cur !== '' && segs.length < 3) segs.push('');
      continue;
    }

    if (i === 0) {
      // Month, or a bare year.
      if (monthIsComplete(cur)) segs.push(ch);
      else if (cur.length < 4) segs[0] = cur + ch;
    } else if (i === 1) {
      // Day, or the year of "MM/YYYY".
      if (dayIsComplete(cur)) {
        segs.push(ch);
      } else if (cur.length < 4) {
        segs[1] = cur + ch;
      } else {
        // A fifth digit: those four were a day plus the start of a year.
        segs[1] = cur.slice(0, 2);
        segs.push((cur.slice(2) + ch).slice(0, 4));
      }
    } else if (cur.length < 4) {
      segs[2] = cur + ch;
    }
  }
  return segs.join('/');
}
