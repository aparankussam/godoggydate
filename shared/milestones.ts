// shared/milestones.ts
// The celebration engine — birthdays, Gotcha Days, and GoDoggyDate
// anniversaries, computed ONLY from real stored dates. No invented cadence:
// there is deliberately no "monthaversary" here, because manufacturing a
// monthly occasion out of nothing is exactly the fabricated-cadence trap the
// brand forbids. A dog has ~2-3 honest anchors a year; we celebrate those well.
//
// Birthdays fire by MONTH by default: many owners (especially of rescues) know
// the birth year and rough month but not the exact day, and birthYear alone is
// year-only — so "today is the birthday!" would be false precision. When the
// owner DOES supply an exact birthDay, we upgrade to a day-of celebration. Gotcha
// Day may likewise be exact ('YYYY-MM-DD') or month-only ('YYYY-MM'); the
// GoDoggyDate anniversary is a real timestamp, so it always fires on the day.


export type MilestoneKind = 'birthday' | 'gotcha' | 'godoggy_anniversary';

export interface Milestone {
  kind: MilestoneKind;
  emoji: string;
  title: string;
  subtitle: string;
  /** Unix ms at local midnight of the next occurrence (or the active day). */
  date: number;
  /** Whole days until the occurrence. 0 while active. */
  daysUntil: number;
  /** True while the celebration window is open (birthday = whole month; the
   *  dated anchors = the day itself). */
  isActive: boolean;
  /** Age turning, or years since — omitted when the base year is unknown. */
  years?: number;
}

export interface MilestoneInput {
  name?: string;
  birthYear?: number;
  birthMonth?: number;      // 1–12
  birthDay?: number;        // 1–31, optional — when known, the birthday fires on
                            // the exact day; otherwise it's a whole-month thing.
  adoptionDate?: string | null; // 'YYYY-MM-DD' (exact) OR 'YYYY-MM' (month only)
  createdAt?: number;       // unix ms — when the GoDoggyDate profile was made
}

function validMonth(m?: number): m is number { return typeof m === 'number' && m >= 1 && m <= 12; }
function validDay(d?: number): d is number { return typeof d === 'number' && d >= 1 && d <= 31; }

/** Parse 'YYYY-MM-DD' (exact) or 'YYYY-MM' (month-only) → parts, else null. */
function parseFlexibleDate(s?: string | null): { year: number; month: number; day: number | null } | null {
  if (!s) return null;
  const t = s.trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (full) return { year: +full[1], month: +full[2], day: +full[3] };
  const partial = /^(\d{4})-(\d{2})$/.exec(t);
  if (partial) return { year: +partial[1], month: +partial[2], day: null };
  return null;
}

function localMidnight(y: number, mZeroBased: number, d: number): number {
  return new Date(y, mZeroBased, d).getTime();
}

function daysBetween(fromMs: number, toMs: number): number {
  const day = 24 * 60 * 60 * 1000;
  const a = new Date(fromMs); const b = new Date(toMs);
  const fa = localMidnight(a.getFullYear(), a.getMonth(), a.getDate());
  const fb = localMidnight(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((fb - fa) / day);
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

/**
 * A whole-month celebration (active for the entire month) — used when we only
 * know the month, not the exact day: a birthday month, or a month-only Gotcha.
 */
function monthCelebration(
  kind: MilestoneKind,
  emoji: string,
  monthIdx: number,
  baseYear: number | undefined,
  titleFor: (years: number | undefined) => string,
  subtitleFor: (years: number | undefined) => string,
  now: Date,
): Milestone {
  const thisYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const activeThisMonth = currentMonth === monthIdx;
  const occursThisYear = monthIdx >= currentMonth;
  const year = occursThisYear ? thisYear : thisYear + 1;
  const date = localMidnight(year, monthIdx, 1);
  const years = typeof baseYear === 'number' ? year - baseYear : undefined;

  return {
    kind,
    emoji,
    title: titleFor(years),
    subtitle: subtitleFor(years),
    date,
    daysUntil: activeThisMonth ? 0 : daysBetween(now.getTime(), date),
    isActive: activeThisMonth,
    years,
  };
}

function birthdayMilestone(input: MilestoneInput, now: Date): Milestone | null {
  if (!validMonth(input.birthMonth)) return null;
  const name = input.name?.trim() || 'Your dog';
  const monthIdx = input.birthMonth - 1;

  // Subtitles stay time-neutral (no "today"/"this month") because the same
  // string is shown on both the active card and the "Coming up · in N days"
  // countdown — a relative-time word would contradict the countdown.
  // Exact day known → celebrate on the day itself (like a Gotcha Day).
  if (validDay(input.birthDay) && typeof input.birthYear === 'number') {
    return anchoredMilestone(
      'birthday', '🎂', localMidnight(input.birthYear, monthIdx, input.birthDay), 0,
      () => `${name}'s birthday`,
      (y) => y >= 1 ? `Turning ${y}` : `It's ${name}'s birthday!`,
      now,
    );
  }

  // Only the month is known → celebrate the whole birthday month.
  return monthCelebration(
    'birthday', '🎂', monthIdx, input.birthYear,
    () => `${name}'s birthday month`,
    (y) => typeof y === 'number' && y >= 1 ? `Turning ${y}` : 'It\'s their birthday month',
    now,
  );
}

function anchoredMilestone(
  kind: MilestoneKind,
  emoji: string,
  baseMs: number,
  minYears: number,
  titleFor: (years: number) => string,
  subtitleFor: (years: number) => string,
  now: Date,
): Milestone | null {
  const base = new Date(baseMs);
  const monthIdx = base.getMonth();
  const day = base.getDate();
  const thisYear = now.getFullYear();
  const todayMid = localMidnight(thisYear, now.getMonth(), now.getDate());

  const thisYearOccur = localMidnight(thisYear, monthIdx, day);
  const occurs = thisYearOccur >= todayMid ? thisYearOccur : localMidnight(thisYear + 1, monthIdx, day);
  const years = new Date(occurs).getFullYear() - base.getFullYear();
  if (years < minYears) return null;

  const daysUntil = daysBetween(now.getTime(), occurs);
  return {
    kind,
    emoji,
    title: titleFor(years),
    subtitle: subtitleFor(years),
    date: occurs,
    daysUntil,
    isActive: daysUntil === 0,
    years,
  };
}

export interface MilestoneResult {
  /** Any milestone whose window is open right now (celebrate these). */
  active: Milestone[];
  /** The soonest upcoming milestone (for a countdown), if any. */
  next: Milestone | null;
}

export function computeMilestones(
  input: MilestoneInput | null | undefined,
  nowMs: number = Date.now(),
): MilestoneResult {
  if (!input) return { active: [], next: null };
  const now = new Date(nowMs);
  const name = input.name?.trim() || 'Your dog';
  const list: Milestone[] = [];

  const birthday = birthdayMilestone(input, now);
  if (birthday) list.push(birthday);

  const adoption = parseFlexibleDate(input.adoptionDate);
  if (adoption) {
    if (adoption.day !== null) {
      // Exact Gotcha Day known → celebrate on the day.
      const m = anchoredMilestone(
        'gotcha', '🏡', localMidnight(adoption.year, adoption.month - 1, adoption.day), 1,
        () => `${name}'s Gotcha Day`,
        (y) => `${y} year${plural(y)} since ${name} came home`,
        now,
      );
      if (m) list.push(m);
    } else {
      // Only the month is known → celebrate the whole Gotcha month (once at
      // least a year has passed, mirroring the exact-day 1-year minimum).
      const m = monthCelebration(
        'gotcha', '🏡', adoption.month - 1, adoption.year,
        () => `${name}'s Gotcha month`,
        (y) => `${y} year${plural(y ?? 0)} since ${name} came home`,
        now,
      );
      if (typeof m.years === 'number' && m.years >= 1) list.push(m);
    }
  }

  if (typeof input.createdAt === 'number' && input.createdAt > 0) {
    const m = anchoredMilestone(
      'godoggy_anniversary', '🐾', input.createdAt, 1,
      (y) => `${name}'s GoDoggyDate anniversary`,
      (y) => `${y} year${plural(y)} on GoDoggyDate`,
      now,
    );
    if (m) list.push(m);
  }

  const active = list.filter((m) => m.isActive).sort((a, b) => a.date - b.date);
  const upcoming = list.filter((m) => !m.isActive).sort((a, b) => a.daysUntil - b.daysUntil);
  return { active, next: upcoming[0] ?? null };
}
