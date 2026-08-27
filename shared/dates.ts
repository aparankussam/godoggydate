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
  const text = (raw ?? '').trim();
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

// ── Input masking ────────────────────────────────────────────────────────────

/**
 * Sanitise what the owner is typing in a US date box: keep digits and the
 * slashes THEY type, cap each segment, and otherwise leave the value alone.
 *
 * It deliberately does NOT auto-insert slashes. Auto-insertion has to guess how
 * many parts the value will end up with, and that guess makes the two SHORTER
 * shapes these boxes explicitly advertise impossible to type: rebuilding from
 * digits alone turns "062021" (June 2021) into "06/20/21" and "2021" into
 * "20/21", both of which then fail to parse. A month-only Gotcha Day and a
 * year-only birthday are the whole point of accepting partial dates, so the
 * mask must never stand between the owner and them.
 *
 * Segment caps: month 2, middle 4 (it is either a 1–2 digit day or a 4-digit
 * year), year 4. With no slash yet the single segment allows 4, since it may be
 * a bare "YYYY" rather than a month being typed.
 */
export function maskUsDateInput(raw: string): string {
  const cleaned = (raw ?? '').replace(/[^\d/]/g, '').replace(/\/{2,}/g, '/');
  const parts = cleaned.split('/').slice(0, 3);
  if (parts.length === 1) return parts[0].slice(0, 4);
  parts[0] = parts[0].slice(0, 2);
  parts[1] = parts[1].slice(0, 4);
  if (parts.length === 3) parts[2] = parts[2].slice(0, 4);
  return parts.join('/');
}
