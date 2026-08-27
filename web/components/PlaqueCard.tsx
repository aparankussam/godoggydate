'use client';
import { formatUsMonthYear } from '../../shared/dates';
// web/components/PlaqueCard.tsx
// "EMPLOYEE OF THE MONTH" — a walnut-and-brass office plaque for a dog, built on
// top of its deterministic Dogtype (shared/dogtype.ts) and shared/plaque.ts. The
// job title ("Senior VP of Squirrel Surveillance") is picked from a hand-written
// bank keyed to the dog's 16-type code, hashed by name + current month, so it's
// stable for the month and rotates as the months turn. NO AI, no fabricated stat:
// the "performance highlights" are generic, obviously-in-on-the-joke corporate
// lines (naps, tennis balls, belly rubs), and the plaque is visually unmistakable
// as an office gag, never a real HR document.
//
// Self-contained: computes the plaque from the owner's own saved profile, renders
// the capturable card (brand + URL baked INTO the captured region so a reposted
// screenshot still carries the back-link), and offers a Share button — the same
// html2canvas path as WantedPosterWeb / DogtypeCard. Works at N=1.

import { forwardRef, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto, resolveHeroIndex, getHeroFocus } from '../lib/photos';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { computeDogtype } from '../../shared/dogtype';
import { computePlaque } from '../../shared/plaque';
import type { Plaque } from '../../shared/plaque';

interface Props {
  savedProfile: SavedDogProfile;
}

// Walnut + brass palette. Kept as inline hex (solid gradients, no backdrop-blur
// or oklch) so html2canvas captures it faithfully — same rationale as
// WantedPosterWeb's aged-parchment gradient.
const BRASS = 'linear-gradient(155deg, #F6DC93 0%, #D8B25C 42%, #A9832F 100%)';
const BRASS_INK = '#3A2A0E';
const BRASS_INK_SOFT = '#5E4718';
const ENGRAVE = '#E9D8B0'; // aged-brass lettering on the dark walnut

// ── The capturable plaque plate (forwardRef target for html2canvas) ──────────
interface PlateProps {
  plaque: Plaque;
  dogName: string;
  photoUrl?: string;
  photoFocus?: string;
}

const PlaquePlate = forwardRef<HTMLDivElement, PlateProps>(function PlaquePlate(
  { plaque, dogName, photoUrl, photoFocus },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative w-[340px] rounded-md overflow-hidden"
      // Dark walnut board with a subtle grain via layered solid gradients.
      style={{
        background:
          'linear-gradient(160deg, #4A3524 0%, #3A2817 55%, #2C1E11 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
      }}
    >
      {/* Brass outer bevel */}
      <div className="m-3 rounded-sm" style={{ border: '2px solid #B78E3E', padding: 2 }}>
        <div
          className="flex flex-col items-center px-5 py-5 rounded-sm"
          style={{ border: '1px solid #7A5C22' }}
        >
          {/* Etched header on the walnut */}
          <p
            className="font-display leading-none text-center"
            style={{ fontSize: 15, color: ENGRAVE, letterSpacing: 4 }}
          >
            EMPLOYEE
          </p>
          <p
            className="font-display leading-none text-center mt-0.5"
            style={{ fontSize: 12, color: ENGRAVE, letterSpacing: 6 }}
          >
            OF THE MONTH
          </p>
          <p className="mt-1" style={{ fontSize: 10, color: '#B9A578', letterSpacing: 2 }}>
            {plaque.monthLabel || '—'}
          </p>

          {/* Brass medallion with the dog's photo (emoji sits behind so an
              undecoded remote image still captures a meaningful badge). No
              crossOrigin — Firebase Storage isn't CORS-configured here;
              shareCard's html2canvas re-fetches with useCORS during capture. */}
          <div
            className="relative mt-4 flex items-center justify-center overflow-hidden rounded-full"
            style={{ width: 118, height: 118, border: '4px solid #C9A24B', backgroundColor: '#7A5C22' }}
          >
            <span style={{ fontSize: 52, lineHeight: 1 }} aria-hidden="true">
              {plaque.emoji}
            </span>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={dogName}
                className="absolute inset-0 w-full h-full object-cover"
                style={photoFocus ? { objectPosition: photoFocus } : undefined}
              />
            )}
          </div>

          {/* Brass nameplate — the engraved bar every plaque has */}
          <div
            className="w-full mt-4 rounded-sm text-center px-3 py-2"
            style={{ background: BRASS, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)' }}
          >
            <p
              className="font-display leading-tight"
              style={{ fontSize: 24, color: BRASS_INK, letterSpacing: 0.5 }}
            >
              {dogName}
            </p>
            <p
              className="font-semibold leading-snug mt-0.5"
              style={{ fontSize: 12.5, color: BRASS_INK_SOFT, letterSpacing: 0.3 }}
            >
              {plaque.title}
            </p>
          </div>

          {/* Performance highlights — obviously-playful corporate filler */}
          <p
            className="mt-4 self-start"
            style={{ fontSize: 9, color: '#B9A578', letterSpacing: 2 }}
          >
            PERFORMANCE HIGHLIGHTS
          </p>
          <div className="w-full mt-1.5 space-y-1">
            {plaque.highlights.map((h, i) => (
              <p key={i} className="leading-snug" style={{ fontSize: 11.5, color: ENGRAVE }}>
                <span style={{ color: '#D8B25C' }}>★</span> {h}
              </p>
            ))}
          </div>

          {/* Straight-faced "official" line — small, so no one mistakes the gag */}
          <p
            className="mt-4 italic text-center"
            style={{ fontSize: 9.5, color: '#9C8A5F', letterSpacing: 0.4 }}
          >
            Issued by the GoDoggyDate HR Dept. · Strictly ceremonial
          </p>

          {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
          <div
            className="w-full mt-3 pt-2 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(201,162,75,0.4)' }}
          >
            <p className="font-display" style={{ fontSize: 12, color: ENGRAVE }}>
              GoDoggyDate
            </p>
            <p style={{ fontSize: 9.5, color: '#9C8A5F' }}>godoggydate.com</p>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Self-contained profile-page section ──────────────────────────────────────
export default function PlaqueCard({ savedProfile }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const dogtype = computeDogtype(savedProfile);
  // Current month, computed once so it's stable across re-renders (and matches
  // between the visible card and the captured PNG). Date on the server and the
  // first client render agree except across a month boundary mid-request, which
  // is acceptable for a playful, monthly-rotating title.
  const [monthLabel] = useState(() =>
    formatUsMonthYear(new Date()),
  );

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const plaque = dogtype
    ? computePlaque({ dogtype, name: dogName, monthLabel })
    : null;
  if (!dogtype || !plaque) return null;

  const photo = getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile));
  const photoFocus = getHeroFocus(savedProfile);

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('plaque_share_click', { code: dogtype!.code });
    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-employee-of-the-month.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `${dogName}: Employee of the Month`,
          shareText: `${dogName} made Employee of the Month — ${plaque!.title} 🏆. Give your dog a job title on GoDoggyDate.`,
        },
      );
      trackEvent('plaque_shared', { method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">🏆 Employee of the Month</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          {dogName}&apos;s official (and entirely ceremonial) office plaque — a straight-faced job title picked from
          their Dogtype, plus some very serious performance highlights. Updates each month.
        </p>
      </div>

      {/* The plaque itself — this is what gets captured to PNG. */}
      <div className="flex justify-center">
        <PlaquePlate ref={cardRef} plaque={plaque} dogName={dogName} photoUrl={photo ?? undefined} photoFocus={photoFocus} />
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="btn-primary w-full mt-4 disabled:opacity-60"
      >
        {sharing ? 'Preparing…' : `Share ${dogName}'s plaque`}
      </button>

      <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
        A joke, not a job. The title comes from {dogName}&apos;s Dogtype and the highlights are all in good fun —
        no real performance review was harmed.
      </p>
    </section>
  );
}
