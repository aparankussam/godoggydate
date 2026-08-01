'use client';
// web/components/MatchModal.tsx
// Full-screen overlay fired when a mutual like is detected.
// Shown from SwipeStack's onMatch callback in app/app/page.tsx.
//
// This screen used to celebrate identically no matter what the engine thought.
// It was the only compat consumer in web/ that ignored compat.quality — so a
// pairing calculateCompatibility() itself labels 'Safety mismatch' (score < 45,
// or an owner who declared their dog isn't currently vaccinated) got the same
// bouncing emoji, falling confetti and "It's a Match!" as a perfect one. The
// blocked branch below is deliberately sober: same information, no party.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CompatibilityResult } from '../../shared/types';
import { getPrimaryRenderablePhoto } from '../lib/photos';
import { getChatUnlockPitch } from '../shared/utils/stripe';
import CompatBreakdown, { QUALITY_STYLES } from './CompatBreakdown';

const MATCH_HEADLINES = ["It's a Match!", 'MUTUAL WOOF'];

interface MatchDog {
  id: string;
  name: string;
  breed: string;
  photos?: string[];
  distanceMiles?: number;
  location?: string;
  vaccinated?: boolean | null;
  compat: CompatibilityResult;
}

interface Props {
  dog: MatchDog;
  matchId: string;
  onKeepSwiping: () => void;
}

export default function MatchModal({ dog, matchId, onKeepSwiping }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const photo = getPrimaryRenderablePhoto(dog.photos);
  const isBlocked = dog.compat.quality === 'blocked';
  const topReasons = dog.compat.reasons.slice(0, 3);
  const warnings = dog.compat.warnings;
  const qualityStyle = QUALITY_STYLES[dog.compat.quality];

  // milesBetween() returns -1 when either dog has no coords. Asserting "Nearby"
  // for a dog whose location we don't know is the same overclaim the engine
  // used to make by scoring that -1 as maximum proximity.
  const distanceSummary =
    typeof dog.distanceMiles === 'number' && dog.distanceMiles >= 0
      ? `${dog.distanceMiles.toFixed(1)} mi apart`
      : dog.location ?? 'Location not shared';

  // The blocked branch never randomizes — a safety message that reads
  // differently on each mount can't be reported or reproduced.
  const headline = useMemo(
    () =>
      isBlocked
        ? 'You both said WOOF — read this first'
        : MATCH_HEADLINES[Math.floor(Math.random() * MATCH_HEADLINES.length)],
    [isBlocked],
  );

  // Falling paw-print confetti — celebration only. Values are fixed per mount
  // (the index arithmetic below is deterministic) so a given mount animates the
  // same way twice.
  const confetti = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 7) * 0.15}s`,
      duration: `${2.4 + (i % 5) * 0.3}s`,
      size: 16 + (i % 3) * 8,
    })),
    [],
  );

  // Focus trap. The previous version's comment promised one but only called
  // focus() — a keyboard user Tabbed straight out of a fixed inset-0 overlay
  // into the swipe deck behind it.
  //
  // Bound to the document, not to the overlay via onKeyDown: acknowledging a
  // blocked pairing unmounts the button that had focus, which drops focus to
  // <body> — outside the overlay's React subtree — and a subtree handler then
  // never sees another keystroke. Escape has to keep working after that.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onKeepSwiping();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = overlayRef.current;
      if (!el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => n.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Focus outside the overlay (or on the overlay itself) — pull it back in.
      if (!el.contains(document.activeElement) || document.activeElement === el) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeepSwiping]);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  // Acknowledging swaps the button for a link, so put focus somewhere real
  // instead of letting it fall to <body>.
  useEffect(() => {
    if (acknowledged) overlayRef.current?.focus();
  }, [acknowledged]);

  // A blocked pairing shouldn't make "Say hi" the default gold action before
  // the owner has seen why it's flagged.
  const chatUnlocked = !isBlocked || acknowledged;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto px-8 py-10 text-center outline-none"
      style={{
        background: isBlocked
          ? 'linear-gradient(160deg, #1F2937 0%, #334155 60%, #1E293B 100%)'
          : 'linear-gradient(160deg, #3D1F0A 0%, #B45309 60%, #92400E 100%)',
      }}
      aria-modal="true"
      role="dialog"
      aria-label={headline}
    >
      {!isBlocked && (
        <div className="text-7xl animate-bounce select-none" aria-hidden="true">
          🐕&nbsp;💛&nbsp;🐶
        </div>
      )}

      <h2 className="font-display text-4xl sm:text-5xl text-white leading-tight">
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
          {/* "wants to sniff you out" asserted intent from a swipe. The only
              underlying datum is a decision doc with action:'like'. */}
          <p className="text-white/90 text-lg font-semibold">You both said WOOF.</p>
          <p className="text-white/70 text-sm">
            {dog.breed} · {distanceSummary}
          </p>
          {/* The verdict gets its own line in its tier colour — it's a
              conclusion, not a peer of breed and distance. */}
          <p className="text-sm font-bold" style={{ color: qualityStyle?.ringHex ?? '#F59E0B' }}>
            {dog.compat.label}
          </p>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div
            className={`score-ring w-14 h-14 text-lg ring-2 ${qualityStyle?.ring ?? ''}`}
            style={{ borderColor: qualityStyle?.ringHex }}
          >
            {dog.compat.score}
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
            fit score
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-[1.75rem] border border-white/12 bg-white/12 px-5 py-5 text-left shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-md">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
          {isBlocked
            ? 'Why this pairing needs care'
            : warnings.length > 0
              ? 'What lines up, and what to watch'
              : 'What lines up'}
        </p>

        {/* When there's something to be careful about, it goes FIRST. */}
        {warnings.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl border border-amber-300/60 bg-amber-950/55 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white">
              Before you meet
            </p>
            {warnings.map((warning) => (
              <p key={warning} className="mt-1 text-sm leading-relaxed text-white">{warning}</p>
            ))}
          </div>
        )}

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

        {/* Vaccination was visible while swiping and then disappeared at the
            moment the user decides to meet. null means nobody answered. */}
        <p className="mt-3 text-sm text-white/90">
          <span className="mr-2 font-bold text-gold">•</span>
          {dog.vaccinated === true
            ? `${dog.name}'s owner marked them vaccinated`
            : dog.vaccinated === false
              ? `${dog.name}'s owner marked them NOT currently vaccinated`
              : `Vaccination: not stated`}
        </p>

        {/* Same size and contrast as the reasons above it — a disclosure set in
            smaller, dimmer type is a disclaimer, not a disclosure. */}
        <p className="mt-4 border-t border-white/15 pt-3 text-sm leading-relaxed text-white/90">
          Everything here comes from what each owner typed in. GoDoggyDate doesn&apos;t
          verify breed, vaccination, or temperament.
        </p>

        <button
          onClick={() => setShowBreakdown((v) => !v)}
          className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-gold underline underline-offset-2"
          aria-expanded={showBreakdown}
        >
          {showBreakdown ? 'Hide the math' : 'How this was calculated'}
        </button>
        {showBreakdown && (
          <div className="mt-3">
            <CompatBreakdown breakdown={dog.compat.breakdown} score={dog.compat.score} />
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {isBlocked && !acknowledged ? (
          <button
            onClick={() => setAcknowledged(true)}
            className="w-full rounded-full bg-white/90 px-8 py-4 text-base font-bold text-slate-900 shadow-xl transition-transform hover:scale-105"
          >
            Got it — I&apos;ve read the above
          </button>
        ) : (
          <Link
            href={`/app/messages/${matchId}`}
            className="w-full bg-gold text-brown font-bold rounded-full px-8 py-4 text-lg shadow-xl hover:scale-105 transition-transform text-center"
          >
            💬 Say hi to {dog.name}
          </Link>
        )}
        {/* Safety guidance outranks the payment pitch. */}
        <p className="text-center text-sm leading-relaxed text-white/85">
          Meet somewhere neutral and public the first time — not either dog&apos;s home or
          regular park.{' '}
          <Link href="/playdate-safety" className="font-semibold underline underline-offset-2">
            How to run a first meeting
          </Link>
        </p>
        {chatUnlocked && (
          <p className="text-center text-sm leading-relaxed text-white/72">
            {getChatUnlockPitch()}
          </p>
        )}
        <button
          onClick={onKeepSwiping}
          className="text-white/70 text-sm hover:text-white transition-colors py-2"
        >
          Keep swiping →
        </button>
      </div>

      {!isBlocked && (
        <>
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
        </>
      )}
    </div>
  );
}
