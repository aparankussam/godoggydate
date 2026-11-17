'use client';
// web/lib/boops.ts
// Snoot Boop's counter — LOCAL-FIRST via localStorage (web port of
// mobile/lib/boops.ts, which is AsyncStorage-backed). Booping is a rapid-fire
// gesture, so the network must never be in the tap loop: the count lives in
// component state at 60fps and the component debounces persistence through here.
// The number shown is a literal count of the user's own taps, nothing about the
// dog is asserted, so it's honest by construction.
//
// Synced across devices (lib/progressSync): each save marks progress dirty, and
// a sync a couple of seconds later merges the count with users/{uid}/private/
// progress, keeping the higher all-time count.
//
// SSR-safe: every window/localStorage access is guarded, so importing or
// calling these on the server just returns fresh state / no-ops.

import { applyBoopWrite, progressKeys, readBoopCounts } from '../../shared/progress';
import { markProgressDirty } from './progressSync';

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
// page). Generous enough that casual play never hits it, but a marathon burst
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

/** The next locked sticker to chase, or null once they're all unlocked. */
export function nextSticker(allTime: number): Sticker | null {
  return STICKERS.find((s) => allTime < s.unlockAt) ?? null;
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

const KEY = progressKeys.boops;

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

// ── localStorage persistence (SSR-safe, synchronous) ─────────────────────────

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function freshBoops(nowMs: number = Date.now()): BoopState {
  return { allTime: 0, todayCount: 0, todayDate: localDateStr(nowMs), energy: MAX_ENERGY, energyAtMs: nowMs };
}

// The all-time count the Snoot Boop screen last loaded or saved, per dog. A save
// adds the taps made since then on top of what's stored, so a sync that raised
// the stored count while the screen was open isn't overwritten.
const writeBase = new Map<string, number>();

function readStored(dogId: string): unknown {
  const raw = window.localStorage.getItem(KEY(dogId));
  return raw ? JSON.parse(raw) : null;
}

function readState(dogId: string): BoopState {
  const now = Date.now();
  const today = localDateStr(now);
  if (!dogId || !hasStorage()) return freshBoops(now);
  try {
    const parsed = readStored(dogId) as Partial<BoopState> | null;
    if (!parsed) return freshBoops(now);
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
    return freshBoops(now);
  }
}

/** Read + normalize the stored state (rolls the daily counter, regens energy). */
export function loadBoops(dogId: string): BoopState {
  const state = readState(dogId);
  if (dogId) writeBase.set(dogId, state.allTime);
  return state;
}

/** All-time boop count for a dog — the cheap read used by the profile badge. */
export function loadAllTime(dogId: string): number {
  return readState(dogId).allTime;
}

/** Write immediately. Prefer `saveBoopsDebounced` in a tap loop. */
export function persistBoops(dogId: string, state: BoopState): void {
  if (!dogId || !hasStorage()) return;
  const base = writeBase.get(dogId);
  writeBase.set(dogId, state.allTime);
  try {
    let stored: unknown = null;
    try {
      stored = readStored(dogId);
    } catch {
      /* corrupt — overwrite it */
    }
    const counts = applyBoopWrite(readBoopCounts(stored), state, base);
    window.localStorage.setItem(
      KEY(dogId),
      JSON.stringify({ ...counts, energy: state.energy, energyAtMs: state.energyAtMs }),
    );
  } catch {
    /* private-mode / quota — the live in-memory count is what the user sees */
  }
  markProgressDirty(dogId);
}

// ── Debounced saver — never write on every tap ───────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { dogId: string; state: BoopState } | null = null;

export function saveBoopsDebounced(dogId: string, state: BoopState, delayMs = 400): void {
  pending = { dogId, state };
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pending) persistBoops(pending.dogId, pending.state);
    pending = null;
  }, delayMs);
}

/** Force any pending debounced write out now (call on unmount / pagehide). */
export function flushBoops(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (pending) { persistBoops(pending.dogId, pending.state); pending = null; }
}
