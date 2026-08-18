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
  /** Zoomies energy left (0..MAX_ENERGY) as of `energyAtMs`. */
  energy: number;
  /** Timestamp `energy` was accurate as of; regen accrues from here. */
  energyAtMs: number;
}

export interface BoopMilestone {
  count: number;
  title: string;
  emoji: string;
}

// ── Zoomies energy — a fun, HONEST cap ───────────────────────────────────────
// Booping spends the dog's "zoomies energy"; it refills on REAL elapsed clock
// time (computed from a stored timestamp, so it can't be gamed by reopening the
// app). Generous enough that casual play never hits it, but a marathon burst
// makes the dog "need a breather" — a playful limit, not a paywall.
export const MAX_ENERGY = 50;
export const ENERGY_REGEN_MS = 90 * 1000; // +1 every 90s → full refill in ~75 min

/** Current energy at `nowMs`, accounting for time-based regen (pure). */
export function computeEnergy(energy: number, energyAtMs: number, nowMs: number = Date.now()): number {
  const regen = Math.floor((nowMs - energyAtMs) / ENERGY_REGEN_MS);
  if (regen <= 0) return Math.max(0, Math.min(MAX_ENERGY, energy));
  return Math.max(0, Math.min(MAX_ENERGY, energy + regen));
}

/** ms until the next +1 energy tick (for a live "refills in…" readout). */
export function msToNextEnergy(energyAtMs: number, nowMs: number = Date.now()): number {
  const elapsed = (nowMs - energyAtMs) % ENERGY_REGEN_MS;
  return ENERGY_REGEN_MS - elapsed;
}

// ── Milestone stickers — earned decals you can place on your dog's photo ──────
export interface Sticker {
  id: string;
  emoji: string;
  label: string;
  /** All-time boops needed to unlock it (mirrors the milestone ladder). */
  unlockAt: number;
}

export const STICKERS: Sticker[] = [
  { id: 'paw', emoji: '🐾', label: 'Paw', unlockAt: 10 },
  { id: 'love', emoji: '💖', label: 'Love', unlockAt: 10 },
  { id: 'medal', emoji: '🎖️', label: 'Medal', unlockAt: 50 },
  { id: 'sparkle', emoji: '✨', label: 'Sparkle', unlockAt: 50 },
  { id: 'star', emoji: '⭐', label: 'Star', unlockAt: 150 },
  { id: 'party', emoji: '🎉', label: 'Party', unlockAt: 150 },
  { id: 'crown', emoji: '👑', label: 'Crown', unlockAt: 500 },
  { id: 'bone', emoji: '🦴', label: 'Bone', unlockAt: 500 },
  { id: 'trophy', emoji: '🏆', label: 'Trophy', unlockAt: 1500 },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow', unlockAt: 1500 },
];

/** Stickers unlocked at this all-time count. */
export function unlockedStickers(allTime: number): Sticker[] {
  return STICKERS.filter((s) => allTime >= s.unlockAt);
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
  const now = Date.now();
  const fresh = (): BoopState => ({ allTime: 0, todayCount: 0, todayDate: today, energy: MAX_ENERGY, energyAtMs: now });
  try {
    const raw = await AsyncStorage.getItem(KEY(dogId));
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<BoopState>;
    const allTime = typeof parsed.allTime === 'number' && parsed.allTime >= 0 ? Math.floor(parsed.allTime) : 0;
    // Roll the daily counter over if the stored day isn't today.
    const sameDay = parsed.todayDate === today;
    // Backfill energy for pre-energy saves; otherwise regen it to now.
    const storedEnergy = typeof parsed.energy === 'number' ? parsed.energy : MAX_ENERGY;
    const storedEnergyAt = typeof parsed.energyAtMs === 'number' ? parsed.energyAtMs : now;
    return {
      allTime,
      todayCount: sameDay && typeof parsed.todayCount === 'number' ? Math.floor(parsed.todayCount) : 0,
      todayDate: today,
      energy: computeEnergy(storedEnergy, storedEnergyAt, now),
      energyAtMs: now,
    };
  } catch {
    return fresh();
  }
}

export async function persistBoops(dogId: string, state: BoopState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(dogId), JSON.stringify(state));
  } catch {
    /* non-critical — the live in-memory count is what the user sees */
  }
}
