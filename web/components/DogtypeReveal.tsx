'use client';
// web/components/DogtypeReveal.tsx
// The one-time celebratory REVEAL of a dog's Dogtype — shown right after the
// owner finishes onboarding / completes their profile. It's the emotional
// payoff before the shareable DogtypeCard: a short, self-contained CSS
// sequence (suspense build → the emoji + name + tagline burst in big → the four
// personality trait chips stagger in) capped by a "See my Dogtype" button.
// The memorable identity is the NAME + EMOJI; the personality is the 4 traits —
// there is deliberately no cryptic letter code anywhere in the reveal.
//
// It reads ONLY from a Dogtype already produced by computeDogtype (the same
// deterministic type the profile page will show), so it never invents a
// result of its own. Nothing here writes anywhere or claims a stat.
//
// Accessibility: honors prefers-reduced-motion by skipping the whole staged
// sequence and simply cross-fading the final state in. SSR-safe — every
// window/matchMedia touch is inside useEffect or a typeof guard.

import { useEffect, useRef, useState } from 'react';
import type { Dogtype } from '../../shared/dogtype';

interface Props {
  dogtype: Dogtype;
  /** Called when the owner taps "See my Dogtype" (or the reveal is dismissed). */
  onDone: () => void;
  /** Optional — personalizes the intro line ("Bella, meet your Dogtype"). */
  dogName?: string;
}

// Same spark/zen split the DogtypeCard uses, so the reveal's colorway matches
// the card the owner is about to see. Spark dogs (code starts with 'E') get the
// fiery gradient; everyone else the warm calm one. The code is used ONLY behind
// the scenes here to pick the colorway — it is never shown.
function gradientFor(code: string): string {
  const spark = code[0] === 'E';
  return spark
    ? 'linear-gradient(160deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)'
    : 'linear-gradient(160deg, #241A2E 0%, #5C3D2E 50%, #C98A5E 100%)';
}

// Animation anchors (ms). Kept in JS so the "reveal button" timer below stays in
// lockstep with the CSS animation-delays. The emoji + name land first (the
// payoff), then the four trait chips stagger in one after another.
const EMOJI_AT = 520;
const NAME_AT = 760;
const TAGLINE_AT = 980;
const CHIP_START = 1220;
const CHIP_STEP = 140;

export default function DogtypeReveal({ dogtype, onDone, dogName }: Props) {
  const [reduced, setReduced] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const axes = dogtype.axes;
  const intro = dogName?.trim() ? `${dogName.trim()}, meet your Dogtype` : 'Meet your Dogtype';

  useEffect(() => {
    // Detect reduced-motion once on mount (SSR-safe: only runs client-side).
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setReduced(true);
      setShowButton(true);
      return;
    }

    // Full sequence: reveal the button only after the last trait chip has landed,
    // so the owner watches the whole payoff before being offered the exit.
    const sequenceEnd = CHIP_START + axes.length * CHIP_STEP + 700;
    const t = setTimeout(() => setShowButton(true), sequenceEnd);
    timers.current.push(t);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [axes.length]);

  // Always dismissible (Escape) even before the button appears, and lock
  // background scroll while the full-screen overlay is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      if (typeof document !== 'undefined') document.body.style.overflow = prevOverflow;
    };
  }, [onDone]);

  const anim = (name: string, delayMs: number): React.CSSProperties =>
    reduced ? { opacity: 1 } : { animation: `${name} 600ms ease-out ${delayMs}ms both` };

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-6 text-center text-white select-none"
      style={{
        background: gradientFor(dogtype.code),
        animation: reduced
          ? 'dtrFade 320ms ease-out both'
          : 'dtrFade 400ms ease-out both',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Your Dogtype is ${dogtype.name}`}
    >
      {/* Scoped keyframes — self-contained so the component needs no globals.css
          edit. All are opacity/transform only, so they're cheap and GPU-friendly. */}
      <style>{`
        @keyframes dtrFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dtrGlow {
          0%, 100% { opacity: 0.35; transform: scale(0.9) }
          50%      { opacity: 0.7;  transform: scale(1.05) }
        }
        @keyframes dtrChip {
          0%   { opacity: 0; transform: scale(0.6) translateY(8px) }
          70%  { opacity: 1; transform: scale(1.08) translateY(0) }
          100% { opacity: 1; transform: scale(1) translateY(0) }
        }
        @keyframes dtrBurst {
          0%   { opacity: 0; transform: scale(0.4) }
          70%  { opacity: 1; transform: scale(1.12) }
          100% { opacity: 1; transform: scale(1) }
        }
        @keyframes dtrRise {
          from { opacity: 0; transform: translateY(14px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      {/* Suspense glow behind the code — a soft pulsing halo during the build. */}
      {!reduced && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute h-72 w-72 rounded-full bg-white/25 blur-3xl"
          style={{ animation: 'dtrGlow 1.6s ease-in-out 2', top: '28%' }}
        />
      )}

      {/* Intro line */}
      <p
        className="relative text-[11px] font-bold uppercase tracking-[0.28em] text-white/80"
        style={anim('dtrRise', reduced ? 0 : 120)}
      >
        {intro}
      </p>

      {/* The payoff — emoji + name burst in big, the memorable identity. */}
      <div
        className="relative mt-6 text-7xl leading-none sm:text-8xl"
        aria-hidden="true"
        style={anim('dtrBurst', reduced ? 0 : EMOJI_AT)}
      >
        {dogtype.emoji}
      </div>
      <h2
        className="relative mt-4 font-display text-4xl leading-tight sm:text-5xl"
        style={anim('dtrRise', reduced ? 0 : NAME_AT)}
      >
        {dogtype.name}
      </h2>
      <p
        className="relative mt-2 max-w-xs text-base font-semibold italic text-white/90"
        style={anim('dtrRise', reduced ? 0 : TAGLINE_AT)}
      >
        {dogtype.tagline}
      </p>

      {/* The personality — the four trait chips stagger in one after another,
          the warm, self-explanatory read that replaces the old letter code. */}
      <div className="relative mt-6 flex max-w-xs flex-wrap items-center justify-center gap-2">
        {axes.map((a, i) => (
          <span
            key={a.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white"
            style={anim('dtrChip', reduced ? 0 : CHIP_START + i * CHIP_STEP)}
          >
            <span aria-hidden="true">{a.pole.emoji}</span> {a.pole.label}
          </span>
        ))}
      </div>

      {/* Exit — appears once the burst has landed (immediately in reduced mode). */}
      <button
        type="button"
        onClick={onDone}
        className={`relative mt-10 rounded-full bg-white px-8 py-3 font-bold text-brown shadow-lg transition-all hover:scale-105 active:scale-95 ${
          showButton ? '' : 'pointer-events-none'
        }`}
        style={{
          ...(reduced
            ? { opacity: showButton ? 1 : 0 }
            : { animation: showButton ? 'dtrRise 400ms ease-out both' : undefined, opacity: showButton ? 1 : 0 }),
        }}
        tabIndex={showButton ? 0 : -1}
        aria-hidden={!showButton}
      >
        See my Dogtype
      </button>
    </div>
  );
}
