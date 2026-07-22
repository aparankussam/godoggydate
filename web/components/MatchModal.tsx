'use client';
// web/components/MatchModal.tsx
// Full-screen celebration overlay fired when a mutual like is detected.
// Shown from SwipeStack's onMatch callback in app/app/page.tsx.

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { CompatibilityResult } from '../shared/types';
import { getPrimaryRenderablePhoto } from '../lib/photos';
import { getChatUnlockPitch } from '../shared/utils/stripe';

const MATCH_HEADLINES = ["It's a Match!", 'MUTUAL WOOF'];

interface MatchDog {
  id: string;
  name: string;
  breed: string;
  photos?: string[];
  distanceMiles?: number;
  location?: string;
  compat: CompatibilityResult;
}

interface Props {
  dog: MatchDog;
  matchId: string;
  onKeepSwiping: () => void;
}

export default function MatchModal({ dog, matchId, onKeepSwiping }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const photo = getPrimaryRenderablePhoto(dog.photos);
  const topReasons = dog.compat.reasons.slice(0, 3);
  const topWarning = dog.compat.warnings[0];
  const distanceSummary =
    typeof dog.distanceMiles === 'number' && dog.distanceMiles >= 0
      ? `${dog.distanceMiles.toFixed(1)} mi apart`
      : dog.location ?? 'Nearby';
  const headline = useMemo(
    () => MATCH_HEADLINES[Math.floor(Math.random() * MATCH_HEADLINES.length)],
    [],
  );
  // Falling paw-print confetti — deterministic per mount, no library needed.
  const confetti = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 7) * 0.15}s`,
      duration: `${2.4 + (i % 5) * 0.3}s`,
      size: 16 + (i % 3) * 8,
    })),
    [],
  );

  // Trap focus inside modal
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    el.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center gap-6 outline-none"
      style={{
        background: 'linear-gradient(160deg, #3D1F0A 0%, #B45309 60%, #92400E 100%)',
      }}
      aria-modal="true"
      role="dialog"
      aria-label="It's a Match!"
    >
      {/* Animated paw burst */}
      <div className="text-7xl animate-bounce select-none" aria-hidden="true">
        🐕&nbsp;💛&nbsp;🐶
      </div>

      <h2 className="font-display text-5xl text-white leading-tight">
        {headline}
      </h2>

      {/* Dog photo + score */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gold shadow-xl">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={dog.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gold to-primary flex items-center justify-center text-5xl">
              🐕
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-display text-3xl text-white">{dog.name}</p>
          <p className="text-white/90 text-lg font-semibold">
            wants to sniff you out.
          </p>
          <p className="text-white/70 text-sm">
            {dog.breed} · {dog.compat.label} · {distanceSummary}
          </p>
        </div>

        {/* Compat score badge */}
        <div className="score-ring w-14 h-14 text-lg border-gold" style={{ color: '#F59E0B', borderColor: '#F59E0B' }}>
          {dog.compat.score}
        </div>
      </div>

      <div className="w-full max-w-sm rounded-[1.75rem] border border-white/12 bg-white/12 px-5 py-5 text-left shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-md">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Why you&apos;ll click</p>
        <p className="mt-2 text-lg font-semibold text-white">{dog.compat.label}</p>

        {topReasons.length > 0 && (
          <div className="mt-4 space-y-2.5">
            {topReasons.map((reason) => (
              <p key={reason} className="text-sm leading-relaxed text-white/90">
                <span className="mr-2 font-bold text-gold">•</span>
                {reason}
              </p>
            ))}
          </div>
        )}

        {topWarning && (
          <div className="mt-4 rounded-2xl bg-black/15 px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Worth knowing</p>
            <p className="mt-1 text-sm text-white/88">{topWarning}</p>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href={`/app/messages/${matchId}`}
          className="w-full bg-gold text-brown font-bold rounded-full px-8 py-4 text-lg shadow-xl hover:scale-105 transition-transform text-center"
        >
          💬 Say hi to {dog.name}
        </Link>
        <p className="text-center text-sm leading-relaxed text-white/72">
          {getChatUnlockPitch()}
        </p>
        <p className="text-center text-xs leading-relaxed text-white/58">
          Safety tip: start with a public dog park or another busy public place for your first meetup.
        </p>
        <button
          onClick={onKeepSwiping}
          className="text-white/60 text-sm hover:text-white/90 transition-colors py-2"
        >
          Keep swiping →
        </button>
      </div>

      {/* Floating paw prints decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {['top-12 left-8 text-3xl opacity-20 rotate-12', 'top-20 right-10 text-2xl opacity-15 -rotate-6',
          'bottom-32 left-6 text-4xl opacity-20 rotate-45', 'bottom-20 right-8 text-3xl opacity-15 -rotate-12'].map((cls, i) => (
          <span key={i} className={`absolute ${cls} select-none`}>🐾</span>
        ))}
      </div>

      {/* Falling paw-print confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {confetti.map((piece, i) => (
          <span
            key={i}
            className="absolute select-none animate-paw-fall"
            style={{
              left: piece.left,
              top: '-2rem',
              fontSize: piece.size,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
            }}
          >
            🐾
          </span>
        ))}
      </div>
    </div>
  );
}
