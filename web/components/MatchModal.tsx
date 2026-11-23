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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { CompatibilityResult } from '../../shared/types';
import { getPrimaryRenderablePhoto } from '../lib/photos';
import { getVaccinationStatus } from '../../shared/profile';
import { getChatUnlockPitch } from '../shared/utils/stripe';
import CompatBreakdown from './CompatBreakdown';
import DogtypeRevealCard, { type RevealVariant } from './dogtype/DogtypeRevealCard';
import DogtypeSheet from './dogtype/DogtypeSheet';
import { getFirebase } from '../shared/utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { formatDistanceMiles } from '../../shared/utils/matchingEngine';


interface MatchDog {
  id: string;
  name: string;
  breed: string;
  photos?: string[];
  distanceMiles?: number;
  locality?: 'near' | 'city' | 'state';
  location?: string;
  vaccinated?: boolean | null;
  rabiesExpiry?: string;
  compat: CompatibilityResult;
}

export interface MatchReveal {
  ownCode: string;
  otherCode: string;
  ownName: string;
  discovered: number;
  variant: RevealVariant;
  /** Same type as yours but your own reveal is unwatched: name nothing. */
  sealed: boolean;
}

interface Props {
  dog: MatchDog;
  matchId: string;
  /** The Dogtype reveal for this match, when both types are known. */
  reveal?: MatchReveal | null;
  onKeepSwiping: () => void;
}

export default function MatchModal({ dog, matchId, reveal = null, onKeepSwiping }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const photo = getPrimaryRenderablePhoto(dog.photos);
  const isBlocked = dog.compat.quality === 'blocked';
  const topReasons = dog.compat.reasons.slice(0, 2);
  // Everything the owners declared (tripped or not), once each. See OwnerLimits.
  const vaccination = getVaccinationStatus(dog);

  // milesBetween() returns -1 when either dog has no coords. Asserting "Nearby"
  // for a dog whose location we don't know is the same overclaim the engine
  // used to make by scoring that -1 as maximum proximity. Without a measured
  // distance, say what we do know: the place, and that it is the same city/state.
  const knownDistance = formatDistanceMiles(dog.distanceMiles);
  const place = dog.location && dog.location !== 'Location not shared' ? dog.location : '';
  const distanceSummary = knownDistance
    ? `${knownDistance} apart`
    : dog.locality === 'city'
      ? `${place || 'Your city'}${place ? ' · same city' : ''}`
      : dog.locality === 'state'
        ? `${place || 'Your state'}${place ? ' · same state' : ''}`
        : place || 'Location not shared';

  // The stamp is always MUTUAL WOOF; a blocked pairing never celebrates, and
  // its dialog name says so, so it reads the same on every mount.
  const headline = isBlocked ? 'You both said WOOF, read this first' : 'MUTUAL WOOF';

  // The viewer's own dog for the second polaroid. Discover does not pass it, so
  // read dogs/{uid} once; any failure just leaves the neutral "Your dog" card.
  const [myDog, setMyDog] = useState<{ name: string; photo: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      getDoc(doc(db, 'dogs', uid))
        .then((snap) => {
          if (cancelled || !snap.exists()) return;
          const d = snap.data() as { name?: string; photos?: string[] };
          setMyDog({ name: d.name || 'Your dog', photo: getPrimaryRenderablePhoto(d.photos) || null });
        })
        .catch(() => { /* offline: keep the neutral card */ });
    } catch { /* firebase not ready */ }
    return () => { cancelled = true; };
  }, []);

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

  // Owner-attributed lines. Limits are only ever the owner's word; a limit the
  // engine tripped against the viewer's dog is the one thing marked amber.
  const limitItems = dog.compat.limits ? dog.compat.limits.items : null;
  const theirLimits = limitItems ? limitItems.filter((i) => i.side === 'theirs') : [];
  const yourLimits = limitItems ? limitItems.filter((i) => i.side === 'yours') : [];
  const fallbackWarnings = limitItems ? [] : dog.compat.warnings;
  const vaccLine =
    dog.vaccinated === false
      ? `${dog.name}'s owner marked them NOT currently vaccinated`
      : vaccination.tone === 'dated' || vaccination.tone === 'expired'
        ? `${dog.name}'s owner entered a rabies date (${vaccination.label.replace(/^Rabies: /, '')})`
        : dog.vaccinated === true
          ? `${dog.name}'s owner marked them vaccinated`
          : `${dog.name}'s owner didn't say about vaccination`;
  const vaccCaution = dog.vaccinated === false || vaccination.tone === 'expired';

  const bullet = (key: string, node: ReactNode, amber = false) => (
    <li key={key} className="flex gap-2.5 text-sm font-extrabold leading-snug">
      <span
        aria-hidden="true"
        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${amber ? 'bg-amber' : 'bg-brown'}`}
      />
      <span className={amber ? 'text-brown' : ''}>{node}</span>
    </li>
  );

  const pinkBtn =
    'btn-primary flex h-14 w-full items-center justify-center gap-2.5 px-4 pb-1 text-[25px] leading-none';

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto bg-sky bg-gingham text-brown outline-none"
      aria-modal="true"
      role="dialog"
      aria-label={headline}
    >
      {/* Centring lives on this inner wrapper, not the scrolling overlay: justify-center
          on an overflow-y-auto flex column pushes the overflow off the TOP edge where it
          can't be scrolled to. min-h-full still centres a short modal; a tall one scrolls. */}
      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col items-stretch justify-center px-[18px] pb-6 pt-5">
        {!isBlocked && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {confetti.map((piece, i) => (
              <span
                key={i}
                className="absolute animate-paw-fall select-none opacity-40"
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
        )}
        {/* The stamp */}
        <div className="relative z-10 flex justify-center">
          <div className="-rotate-[2.5deg] rounded-lg border-[2.5px] border-brown bg-cream p-[3px] shadow-[0_4px_0_rgba(42,31,74,0.26)]">
            <div className="flex items-center gap-3 rounded-[5px] border-2 border-brown px-4 pb-[7px] pt-[5px]">
              <PawGlyph />
              <h2 className="whitespace-nowrap font-display text-[33px] leading-none tracking-[1px]">
                {isBlocked ? 'READ FIRST' : 'MUTUAL WOOF'}
              </h2>
              <PawGlyph />
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
          <p className="text-base font-black leading-none">You both said WOOF.</p>
          <span className="inline-flex max-w-full -rotate-[1.5deg] items-center gap-1.5 rounded-full border-2 border-brown bg-kraft px-3 py-1 text-[13px] font-black leading-tight shadow-[0_2px_0_rgba(42,31,74,0.22)] [overflow-wrap:anywhere]">
            <svg aria-hidden="true" width="12" height="15" viewBox="0 0 16 20" fill="#2A1F4A" className="shrink-0">
              <path d="M8 0C3.6 0 0 3.5 0 7.9 0 13.2 8 20 8 20s8-6.8 8-12.1C16 3.5 12.4 0 8 0z" />
              <circle cx="8" cy="7.7" r="3" fill="#E6CFA6" />
            </svg>
            {distanceSummary}
          </span>
        </div>

        {/* Two taped polaroids */}
        <div className="relative z-10 mt-4 flex items-start justify-center gap-2">
          <div
            aria-hidden="true"
            className="absolute -top-[5px] left-1/2 z-[5] -ml-[38px] h-[22px] w-[76px] -rotate-[5deg]"
            style={{
              background:
                'repeating-linear-gradient(115deg, rgba(217,188,140,.94) 0 7px, rgba(230,207,166,.94) 7px 14px)',
              clipPath:
                'polygon(0 0,3% 17%,0 33%,3% 50%,0 67%,3% 83%,0 100%,100% 100%,97% 83%,100% 67%,97% 50%,100% 33%,97% 17%,100% 0)',
            }}
          />
          <Polaroid
            z="z-[2]"
            rotate="-rotate-[2.5deg]"
            name={dog.name}
            sub={dog.breed}
            photo={photo}
            alt={`${dog.name}, ${dog.breed}`}
          />
          <Polaroid
            z="z-[1]"
            rotate="rotate-3"
            offset
            name={myDog?.name ?? 'Your dog'}
            sub="That's you"
            photo={myDog?.photo ?? null}
            alt={myDog ? `${myDog.name}, your dog` : 'Your dog'}
            mine
          />
        </div>

        {/* Fit sticker + the top reasons, on a little note */}
        <div
          role="group"
          aria-label={`Fit with your dog: ${dog.compat.score} out of 100, ${dog.compat.label}`}
          className="relative z-10 mt-5 flex items-center justify-center"
        >
          <span
            className={`relative z-[2] flex h-[84px] w-[84px] shrink-0 -rotate-[5deg] flex-col items-center justify-center rounded-full border-[2.5px] border-brown shadow-[0_3px_7px_rgba(42,31,74,0.28)] ${
              isBlocked ? 'bg-kraft' : 'bg-fit'
            }`}
          >
            <span className="font-display text-[30px] leading-[0.9]">{dog.compat.score}</span>
            <span className="max-w-[72px] text-center text-xs font-black leading-[1.05]">
              {dog.compat.label}
            </span>
          </span>
          {topReasons.length > 0 && (
            <span className="-ml-2 min-w-0 flex-1 rotate-[1.5deg] rounded-lg border-2 border-brown bg-cream py-2 pl-5 pr-3 text-[13px] font-black leading-snug shadow-[0_2px_0_rgba(42,31,74,0.22)]">
              {topReasons.map((r, i) => (
                <span key={r} className="block [overflow-wrap:anywhere]">
                  {r}
                  {i < topReasons.length - 1 ? ' ·' : ''}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Dogtype reveal: after the fit sticker on a normal pairing; a blocked
            pairing reads the safety slip first (below). */}
        {!isBlocked && reveal && (
          <div className="relative z-10 mt-5">
            <DogtypeRevealCard
              ownName={reveal.ownName}
              ownCode={reveal.ownCode}
              otherName={dog.name}
              otherCode={reveal.otherCode}
              discovered={reveal.discovered}
              variant={reveal.variant}
              sealed={reveal.sealed}
              compact
              onOpenMore={() => setSheetOpen(true)}
            />
          </div>
        )}

        {/* Before you meet: calm slip, owner-attributed */}
        <div className="relative z-10 mt-5 rounded-l rounded-r-xl border-l-4 border-brown bg-cream-dark px-4 pb-3.5 pt-3.5">
          <h3 className="mb-1.5 text-[15px] font-black leading-tight">
            {isBlocked ? 'Why this pairing needs care' : 'Before you meet'}
          </h3>
          <ul className="space-y-1.5">
            {bullet('vacc', vaccLine, vaccCaution)}
            {theirLimits.length === 0 && limitItems
              ? bullet('nolimits', `${dog.name}'s owner listed no limits`)
              : theirLimits.map((i) =>
                  bullet(
                    i.id,
                    <>
                      {i.text}
                      {i.severity === 'caution' && i.detail ? ` (${i.detail})` : ''}
                    </>,
                    i.severity === 'caution',
                  ),
                )}
            {yourLimits.map((i) =>
              bullet(
                i.id,
                <>
                  You said: {i.chip}
                  {i.severity === 'caution' && i.detail ? ` (${i.detail})` : ''}
                </>,
                i.severity === 'caution',
              ),
            )}
            {fallbackWarnings.map((w) => bullet(w, w, true))}
            {bullet(
              'neutral',
              <>
                <span className="font-black">Meet somewhere neutral and public</span> the first time, not
                either dog&apos;s home or regular park.{' '}
                <Link href="/playdate-safety" className="underline underline-offset-2">
                  How to run a first meeting
                </Link>
              </>,
            )}
          </ul>
          <p className="mt-2.5 text-xs font-extrabold leading-snug text-brown-mid">
            Everything here comes from what each owner typed in. GoDoggyDate doesn&apos;t verify it.
          </p>
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="mt-1 min-h-[44px] text-xs font-black text-brown-mid underline underline-offset-2"
            aria-expanded={showBreakdown}
          >
            {showBreakdown ? 'Hide the math' : 'How this was calculated'}
          </button>
          {showBreakdown && (
            <div className="mt-1">
              <CompatBreakdown breakdown={dog.compat.breakdown} score={dog.compat.score} />
            </div>
          )}
        </div>

        {isBlocked && acknowledged && reveal && (
          <div className="relative z-10 mt-5">
            <DogtypeRevealCard
              ownName={reveal.ownName}
              ownCode={reveal.ownCode}
              otherName={dog.name}
              otherCode={reveal.otherCode}
              discovered={reveal.discovered}
              variant={reveal.variant}
              sealed={reveal.sealed}
              compact
              onOpenMore={() => setSheetOpen(true)}
            />
          </div>
        )}

        {/* CTAs: exactly one pink, pinned so "Say hi" never scrolls out of reach */}
        <div className={`mt-5 flex flex-col gap-3 ${isBlocked && !acknowledged ? 'relative z-10' : 'sticky bottom-0 z-20 -mx-[18px] border-t-2 border-brown bg-sky px-[18px] pb-5 pt-3'}`}>
          {isBlocked && !acknowledged ? (
            <button type="button" onClick={() => setAcknowledged(true)} className={pinkBtn}>
              Got it, I&apos;ve read this
            </button>
          ) : (
            <Link href={`/app/messages/${matchId}`} className={pinkBtn}>
              <ChatGlyph />
              <span className="min-w-0 truncate">Say hi to {dog.name}</span>
            </Link>
          )}
          {chatUnlocked && (
            <p className="-mt-1 text-center text-[13px] font-extrabold leading-snug text-brown-mid">
              {getChatUnlockPitch()}
            </p>
          )}
          <button
            type="button"
            onClick={onKeepSwiping}
            className="btn-secondary flex h-[50px] w-full items-center justify-center px-4 pb-1 text-base font-black"
          >
            Keep swiping
          </button>
        </div>

      </div>
      {reveal && (
        <DogtypeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          code={reveal.otherCode}
          ownCode={reveal.ownCode}
          ownName={reveal.ownName}
          matches={[]}
          showMatches={false}
        />
      )}
    </div>
  );
}

function PawGlyph() {
  return (
    <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="#2A1F4A" className="shrink-0">
      <ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" />
      <ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" />
      <ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" />
      <ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" />
      <path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" />
    </svg>
  );
}

function ChatGlyph() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" className="shrink-0">
      <path d="M4.5 3.5h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-7l-4.6 3.7c-.6.5-1.6.1-1.6-.7v-3h-.2a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z" fill="#2A1F4A" />
      <circle cx="8.3" cy="10.5" r="1.5" fill="#FF5C8D" />
      <circle cx="12" cy="10.5" r="1.5" fill="#FF5C8D" />
      <circle cx="15.7" cy="10.5" r="1.5" fill="#FF5C8D" />
    </svg>
  );
}

function Polaroid({
  name, sub, photo, alt, rotate, z, offset, mine,
}: {
  name: string; sub: string; photo: string | null; alt: string;
  rotate: string; z: string; offset?: boolean; mine?: boolean;
}) {
  return (
    <div
      className={`relative ${z} ${rotate} ${offset ? 'mt-4' : ''} w-[44%] max-w-[170px] rounded-md bg-cream px-[7px] pt-[7px] shadow-[0_0_0_1.5px_#2A1F4A,0_10px_18px_rgba(42,31,74,0.26)]`}
    >
      <div className="flex aspect-[148/120] items-center justify-center overflow-hidden rounded-[3px] border-[1.5px] border-brown bg-note">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={alt} className="h-full w-full object-cover" draggable={false} />
        ) : mine ? (
          <DogFace />
        ) : (
          <span className="text-5xl" aria-hidden="true">🐕</span>
        )}
      </div>
      <p className="px-0.5 pb-2 pt-1 text-center">
        <span className="block font-display text-[25px] leading-none [overflow-wrap:anywhere]">{name}</span>
        <span className="mt-px block text-xs font-extrabold leading-tight text-brown-mid [overflow-wrap:anywhere]">{sub}</span>
      </p>
    </div>
  );
}

function DogFace() {
  return (
    <svg aria-hidden="true" width="76" height="76" viewBox="0 0 48 48">
      <g fill="#2A1F4A" stroke="#2A1F4A" strokeWidth="7.2" strokeLinejoin="round">
        <path d="M17 12.5C11.5 10.8 6 14 6 20.2c0 4.6 1.5 7.8 4 9.3 3-1.8 5-5.3 5.8-9.5z" />
        <path d="M31 12.5c5.5-1.7 11 1.5 11 7.7 0 4.6-1.5 7.8-4 9.3-3-1.8-5-5.3-5.8-9.5z" />
        <ellipse cx="24" cy="26" rx="13.5" ry="12.5" />
      </g>
      <g fill="#FFF9EC" stroke="#FFF9EC" strokeWidth="4.2" strokeLinejoin="round">
        <path d="M17 12.5C11.5 10.8 6 14 6 20.2c0 4.6 1.5 7.8 4 9.3 3-1.8 5-5.3 5.8-9.5z" />
        <path d="M31 12.5c5.5-1.7 11 1.5 11 7.7 0 4.6-1.5 7.8-4 9.3-3-1.8-5-5.3-5.8-9.5z" />
        <ellipse cx="24" cy="26" rx="13.5" ry="12.5" />
      </g>
      <ellipse cx="24" cy="26" rx="13.5" ry="12.5" fill="#FFF1D6" />
      <path d="M17 12.5C11.5 10.8 6 14 6 20.2c0 4.6 1.5 7.8 4 9.3 3-1.8 5-5.3 5.8-9.5z" fill="#C98A4E" />
      <path d="M31 12.5c5.5-1.7 11 1.5 11 7.7 0 4.6-1.5 7.8-4 9.3-3-1.8-5-5.3-5.8-9.5z" fill="#C98A4E" />
      <ellipse cx="24" cy="32" rx="7.6" ry="6" fill="#FFFFFF" />
      <circle cx="18.3" cy="24.6" r="2.1" fill="#2A1F4A" />
      <circle cx="29.7" cy="24.6" r="2.1" fill="#2A1F4A" />
      <ellipse cx="24" cy="29" rx="3.1" ry="2.3" fill="#2A1F4A" />
      <path d="M24 31.2v2.3m0 0c-1.3 1.7-3.6 1.5-4.2-.2m4.2.2c1.3 1.7 3.6 1.5 4.2-.2" fill="none" stroke="#2A1F4A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
