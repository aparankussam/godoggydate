// shared/milestones.ts
// The celebration engine — birthdays, Gotcha Days, and GoDoggyDate
// anniversaries, computed ONLY from real stored dates. No invented cadence:
// there is deliberately no "monthaversary" here, because manufacturing a
// monthly occasion out of nothing is exactly the fabricated-cadence trap the
// brand forbids. A dog has ~2-3 honest anchors a year; we celebrate those well.
//
// Birthdays are celebrated by MONTH: many owners (especially of rescues) know
// the birth year and rough month but not the exact day, and birthYear alone is
// year-only — so "today is the birthday!" would be false precision. Gotcha Day
// and the GoDoggyDate anniversary are real exact dates, so those fire on the day.

import { parseLocalIsoDate } from './profile';

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
  adoptionDate?: string | null; // 'YYYY-MM-DD'
  createdAt?: number;       // unix ms — when the GoDoggyDate profile was made
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

function birthdayMilestone(input: MilestoneInput, now: Date): Milestone | null {
  if (typeof input.birthMonth !== 'number' || input.birthMonth < 1 || input.birthMonth > 12) return null;
  const name = input.name?.trim() || 'Your dog';
  const monthIdx = input.birthMonth - 1;
  const thisYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Next occurrence: the 1st of the birth month, this year if it hasn't passed,
  // else next year. "Active" for the whole month.
  const activeThisMonth = currentMonth === monthIdx;
  const occursThisYear = monthIdx >= currentMonth;
  const year = occursThisYear ? thisYear : thisYear + 1;
  const date = localMidnight(year, monthIdx, 1);

  const years = typeof input.birthYear === 'number' ? year - input.birthYear : undefined;
  const subtitle = typeof years === 'number' && years >= 0
    ? `Turning ${years} this month`
    : 'It\'s their birthday month';

  return {
    kind: 'birthday',
    emoji: '🎂',
    title: `${name}'s birthday month`,
    subtitle,
    date,
    daysUntil: activeThisMonth ? 0 : daysBetween(now.getTime(), date),
    isActive: activeThisMonth,
    years,
  };
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

  const adoption = parseLocalIsoDate(input.adoptionDate);
  if (adoption) {
    const m = anchoredMilestone(
      'gotcha', '🏡', adoption.getTime(), 1,
      (y) => `${name}'s Gotcha Day`,
      (y) => `${y} year${plural(y)} since ${name} came home`,
      now,
    );
    if (m) list.push(m);
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
