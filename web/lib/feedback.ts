'use client';
// web/lib/feedback.ts
// Tiny synthesized sound + haptics feedback layer. NO asset files — every cue
// is a short WebAudio oscillator envelope, so this adds zero network weight.
//
// Design notes:
//  - SSR-safe: every browser API (window/document/navigator/AudioContext) is
//    guarded with a typeof check and the whole module no-ops server-side.
//  - A single AudioContext is created lazily on the first real user gesture
//    (browsers block audio created before one), then reused + resumed.
//  - Mute is an explicit user choice persisted in localStorage — NOT tied to
//    prefers-reduced-motion. Reduced-motion callers should still hear cues if
//    they want them; what reduced-motion suppresses here is only haptics
//    (vibration is a motion), matching platform expectations.
//
// Usage:
//   import { feedback } from '../lib/feedback';
//   <button onClick={() => { feedback.tap(); doThing(); }} />

const MUTE_KEY = 'godoggydate.feedback.muted';

type CueName = 'tap' | 'pop' | 'squeak' | 'success' | 'boop';

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function prefersReducedMotion(): boolean {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mute toggle (persisted, user-controlled)
// ---------------------------------------------------------------------------

export function isMuted(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  if (!hasWindow()) return;
  try {
    if (muted) window.localStorage.setItem(MUTE_KEY, '1');
    else window.localStorage.removeItem(MUTE_KEY);
  } catch {
    // Private-mode / storage-disabled — silently ignore.
  }
}

/** Flip mute and return the new state. Handy for a settings toggle button. */
export function toggleMuted(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

// ---------------------------------------------------------------------------
// Lazy singleton AudioContext
// ---------------------------------------------------------------------------

type WindowWithAudio = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!hasWindow()) return null;
  const w = window as WindowWithAudio;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  // Autoplay policy: a context created/left before a gesture is 'suspended'.
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

// ---------------------------------------------------------------------------
// Tone synthesis
// ---------------------------------------------------------------------------

interface Tone {
  freq: number;
  /** End frequency for a glide; defaults to freq (steady pitch). */
  toFreq?: number;
  duration: number; // seconds
  type?: OscillatorType;
  gain?: number; // peak gain, 0..1
}

function playTone(ctx: AudioContext, tone: Tone, startAt: number): void {
  const { freq, toFreq = freq, duration, type = 'sine', gain = 0.14 } = tone;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  if (toFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, toFreq),
      startAt + duration,
    );
  }

  // Quick attack + exponential decay for a soft "pop", no click at the tail.
  amp.gain.setValueAtTime(0.0001, startAt);
  amp.gain.exponentialRampToValueAtTime(gain, startAt + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(amp).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function playCue(tones: Tone[]): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  let cursor = now;
  for (const tone of tones) {
    playTone(ctx, tone, cursor);
    // Chime notes overlap slightly for a legato feel.
    cursor += tone.duration * 0.6;
  }
}

// ---------------------------------------------------------------------------
// Haptics (suppressed under reduced-motion — vibration is a motion)
// ---------------------------------------------------------------------------

function vibrate(pattern: number | number[]): void {
  if (!hasWindow()) return;
  if (isMuted()) return;
  if (prefersReducedMotion()) return;
  const nav = window.navigator;
  if (nav && typeof nav.vibrate === 'function') {
    try {
      nav.vibrate(pattern);
    } catch {
      // Unsupported / blocked — ignore.
    }
  }
}

// ---------------------------------------------------------------------------
// Public cues
// ---------------------------------------------------------------------------

export const feedback = {
  /** Light UI acknowledgement — a crisp short tick. Good default for buttons. */
  tap(): void {
    playCue([{ freq: 320, toFreq: 260, duration: 0.05, type: 'triangle', gain: 0.1 }]);
    vibrate(8);
  },

  /** Bubbly "pop" — selecting, adding, opening. */
  pop(): void {
    playCue([{ freq: 520, toFreq: 900, duration: 0.09, type: 'sine', gain: 0.16 }]);
    vibrate(12);
  },

  /** Playful dog-toy "squeak" — delight moments (like, superlike, match tease). */
  squeak(): void {
    playCue([{ freq: 900, toFreq: 1500, duration: 0.11, type: 'square', gain: 0.08 }]);
    vibrate([10, 20, 10]);
  },

  /** Three-note ascending chime — completion / share success / celebration. */
  success(): void {
    playCue([
      { freq: 523.25, duration: 0.12, type: 'triangle', gain: 0.14 }, // C5
      { freq: 659.25, duration: 0.12, type: 'triangle', gain: 0.14 }, // E5
      { freq: 783.99, duration: 0.2, type: 'triangle', gain: 0.14 }, // G5
    ]);
    vibrate([15, 30, 15, 30, 25]);
  },

  /** Single soft "boop" at an optional pitch (Hz, default 440). */
  boop(pitch = 440): void {
    const freq = Number.isFinite(pitch) && pitch > 0 ? pitch : 440;
    playCue([{ freq, toFreq: freq * 0.85, duration: 0.12, type: 'sine', gain: 0.15 }]);
    vibrate(10);
  },

  /** Fire any cue by name — convenient for data-driven wiring. */
  play(name: CueName, pitch?: number): void {
    if (name === 'boop') this.boop(pitch);
    else this[name]();
  },

  // Re-exported so callers can wire a mute button from the same import.
  isMuted,
  setMuted,
  toggleMuted,
};

export type { CueName, Tone };
export default feedback;
