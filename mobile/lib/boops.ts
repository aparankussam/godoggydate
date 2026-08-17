// mobile/lib/boops.ts
// Snoot Boop's counter — LOCAL-FIRST via AsyncStorage. Booping is a rapid-fire
// gesture, so the network must never be in the tap loop (a per-tap Firestore
// write would be laggy and costly). The count lives in component state at 60fps;
// the component debounces persistence through here. On-device only in v1 — the
// number shown is a literal count of the user's own taps, nothing about the dog
// is asserted, so it's honest by construction.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BoopState {
  allTime: number;
  todayCount: number;
  /** Local YYYY-MM-DD the todayCount belongs to. */
  todayDate: string;
}

export interface BoopMilestone {
  count: number;
  title: string;
  emoji: string;
}

// Tightened early ladder so the FIRST reward lands fast (the critique's note —
// 1000 was a grind almost nobody reaches).
export const BOOP_MILESTONES: BoopMilestone[] = [
  { count: 10, title: 'Snoot Cadet', emoji: '🐾' },
  { count: 50, title: 'Certified Booper', emoji: '🎖️' },
  { count: 150, title: 'Boop Captain', emoji: '⭐' },
  { count: 500, title: 'Boop Baron', emoji: '👑' },
  { count: 1500, title: 'Snoot Sovereign', emoji: '🏆' },
];

const KEY = (dogId: string) => `godoggydate.boops.${dogId}`;

export function localDateStr(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Highest milestone reached at this all-time count, or null before the first. */
export function milestoneAt(allTime: number): BoopMilestone | null {
  let hit: BoopMilestone | null = null;
  for (const m of BOOP_MILESTONES) if (allTime >= m.count) hit = m;
  return hit;
}

/** The next milestone to chase, or null once they're all unlocked. */
export function nextMilestone(allTime: number): BoopMilestone | null {
  return BOOP_MILESTONES.find((m) => allTime < m.count) ?? null;
}

/** True if crossing from `before` to `after` unlocked a new milestone. */
export function crossedMilestone(before: number, after: number): BoopMilestone | null {
  const m = BOOP_MILESTONES.find((x) => before < x.count && after >= x.count);
  return m ?? null;
}

export async function loadBoops(dogId: string): Promise<BoopState> {
  const today = localDateStr();
  try {
    const raw = await AsyncStorage.getItem(KEY(dogId));
    if (!raw) return { allTime: 0, todayCount: 0, todayDate: today };
    const parsed = JSON.parse(raw) as Partial<BoopState>;
    const allTime = typeof parsed.allTime === 'number' && parsed.allTime >= 0 ? Math.floor(parsed.allTime) : 0;
    // Roll the daily counter over if the stored day isn't today.
    const sameDay = parsed.todayDate === today;
    return {
      allTime,
      todayCount: sameDay && typeof parsed.todayCount === 'number' ? Math.floor(parsed.todayCount) : 0,
      todayDate: today,
    };
  } catch {
    return { allTime: 0, todayCount: 0, todayDate: today };
  }
}

export async function persistBoops(dogId: string, state: BoopState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(dogId), JSON.stringify(state));
  } catch {
    /* non-critical — the live in-memory count is what the user sees */
  }
}
