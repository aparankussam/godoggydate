'use client';
// web/components/DiptychCard.tsx
// The DAY 1 vs DAY N diptych — a "then vs now" share card for National Dog Day.
// Two REAL photos from the owner's own profile sit side by side (earliest on the
// left, latest on the right) with a big, honest day-count between them. Works at
// N=1: reads nothing but the owner's own photos and a date they confirm.
//
// HONEST by construction: the number is labelled "days since your earliest
// photo" — it is (today − the earliest date the owner entered), never a birth,
// age, or "days alive" claim. The card is captured to PNG via the same
// html2canvas path as the other shareable cards, with the brand + URL baked
// INTO the captured region so a reposted screenshot still carries the back-link.
//
// forwardRef exposes the capturable card node to shareOrDownloadCard.

import { forwardRef } from 'react';

interface Props {
  dogName: string;
  /** Earliest ("Day 1") photo URL. */
  earliestUrl?: string;
  /** Latest ("Day N") photo URL. */
  latestUrl?: string;
  /** CSS object-position for the earliest crop; defaults to centre. */
  earliestFocus?: string;
  /** CSS object-position for the latest crop; defaults to centre. */
  latestFocus?: string;
  /** Whole days since the earliest photo — the honest count shown in the middle. */
  days: number;
  /** Human-readable earliest date, e.g. "Mar 2022" — printed under Day 1. */
  earliestLabel?: string;
}

// On-brand palette baked as inline hex (solid gradient, no oklch / backdrop-blur)
// so html2canvas captures it faithfully — same rationale as WantedPosterWeb.
const BROWN = '#2D1A0E';
const BROWN_MID = '#5C3D2E';
const BROWN_LIGHT = '#9B7560';
const PRIMARY = '#E8633A';
const BORDER = '#EAD9C8';
const CREAM = '#FDF6EE';

function Panel({
  url,
  focus,
  label,
  sub,
}: {
  url?: string;
  focus?: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center" style={{ width: 150 }}>
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{
          width: 150,
          height: 150,
          borderRadius: 18,
          border: `3px solid ${BORDER}`,
          backgroundColor: '#E7D3BE',
        }}
      >
        <span style={{ fontSize: 64, lineHeight: 1 }} aria-hidden="true">
          🐶
        </span>
        {url && (
          // No crossOrigin (Firebase Storage isn't CORS-configured for this
          // origin); shareCard's html2canvas re-fetches with useCORS during
          // capture — same rationale as WantedPosterWeb / DogtypeCard.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
            style={focus ? { objectPosition: focus } : undefined}
          />
        )}
      </div>
      <p
        className="font-display mt-2.5 leading-none"
        style={{ fontSize: 20, color: BROWN }}
      >
        {label}
      </p>
      {sub && (
        <p className="mt-0.5 leading-none" style={{ fontSize: 11, color: BROWN_LIGHT }}>
          {sub}
        </p>
      )}
    </div>
  );
}

const DiptychCard = forwardRef<HTMLDivElement, Props>(function DiptychCard(
  { dogName, earliestUrl, latestUrl, earliestFocus, latestFocus, days, earliestLabel },
  ref,
) {
  const safeDays = Math.max(0, Math.floor(days));

  return (
    <div
      ref={ref}
      className="relative overflow-hidden"
      style={{
        width: 360,
        borderRadius: 28,
        background: `linear-gradient(160deg, ${CREAM} 0%, #F7EADB 55%, #F1DFC9 100%)`,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div className="flex flex-col items-center px-5 pt-5 pb-5">
        <p
          className="font-bold uppercase text-center"
          style={{ fontSize: 11, letterSpacing: 2.4, color: PRIMARY }}
        >
          National Dog Day 🐾
        </p>
        <h3
          className="font-display text-center leading-tight mt-1"
          style={{ fontSize: 24, color: BROWN }}
        >
          Day 1 &rarr; Day {safeDays.toLocaleString()}
        </h3>

        {/* The two real photos, then vs now. */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <Panel url={earliestUrl} focus={earliestFocus} label="Day 1" sub={earliestLabel} />
          <span
            className="font-display self-start"
            style={{ fontSize: 30, color: BROWN_LIGHT, marginTop: 56 }}
            aria-hidden="true"
          >
            &rarr;
          </span>
          <Panel url={latestUrl} focus={latestFocus} label={`Day ${safeDays.toLocaleString()}`} sub="today" />
        </div>

        {/* The honest count. */}
        <div className="w-full mt-5 flex flex-col items-center">
          <p
            className="font-display leading-none"
            style={{ fontSize: 64, color: PRIMARY }}
          >
            {safeDays.toLocaleString()}
          </p>
          <p
            className="font-bold uppercase mt-1 text-center"
            style={{ fontSize: 12, letterSpacing: 1.6, color: BROWN }}
          >
            days you&apos;ve known this face
          </p>
          <p className="mt-1 text-center" style={{ fontSize: 11, color: BROWN_LIGHT }}>
            since your earliest photo of {dogName}
          </p>
        </div>

        {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
        <div
          className="w-full mt-5 pt-3 flex items-center justify-between"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <p className="font-display" style={{ fontSize: 13, color: BROWN }}>
            GoDoggyDate
          </p>
          <p style={{ fontSize: 10, color: BROWN_MID }}>godoggydate.com</p>
        </div>
      </div>
    </div>
  );
});

export default DiptychCard;
