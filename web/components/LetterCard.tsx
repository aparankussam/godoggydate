'use client';
// web/components/LetterCard.tsx
// The shareable "Gotcha Day Letter" — a 9:16 keepsake styled as a sealed letter
// on warm parchment: a wax-seal header, the occasion, and a handwritten-feeling
// note from the dog to its human. It renders at a 540×960 base (9:16) and, like
// every other card, exports through the html2canvas path in web/lib/shareCard.ts
// at scale:2 — landing exactly on the 1080×1920 story canvas.
//
// Because html2canvas can't render oklch / backdrop-blur, every colour here is a
// literal hex. Two things are baked INTO the pixels so a reposted screenshot
// keeps them: the honesty label ("written with AI, from real moments") and the
// brand + URL ("GoDoggyDate · godoggydate.com").

import { forwardRef } from 'react';

interface Props {
  salutation: string;
  body: string;
  signOff: string;
  dogName: string;
  /** The real occasion, e.g. "Rex's Gotcha Day". */
  occasion: string;
  /** The honest subtitle, e.g. "3 years since Rex came home". */
  occasionSubtitle?: string;
}

// Warm parchment palette, kept as literal hex for faithful html2canvas capture.
const PAPER = '#FBF3E2';
const PAPER_EDGE = '#F2E6CC';
const INK = '#2B2015';
const INK_SOFT = '#8C7A5E';
const RULE = '#E6D6B6';
const WAX = '#B23A2E';
const WAX_DARK = '#8E2B22';
const GOLD = '#B07D1A';

const LetterCard = forwardRef<HTMLDivElement, Props>(function LetterCard(
  { salutation, body, signOff, dogName, occasion, occasionSubtitle },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative w-[540px] aspect-[9/16] overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(160deg, ${PAPER} 0%, ${PAPER_EDGE} 100%)`,
        border: `1px solid ${RULE}`,
      }}
    >
      {/* Header — wax seal + occasion */}
      <div className="flex flex-col items-center" style={{ paddingTop: 44, paddingLeft: 48, paddingRight: 48 }}>
        {/* Wax seal */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 84,
            height: 84,
            background: `radial-gradient(circle at 38% 34%, ${WAX} 0%, ${WAX_DARK} 100%)`,
            boxShadow: '0 6px 16px rgba(142,43,34,0.35)',
          }}
          aria-hidden="true"
        >
          <span style={{ fontSize: 40, lineHeight: 1 }}>🐾</span>
        </div>
        <p
          className="text-center"
          style={{ marginTop: 20, fontSize: 13, fontWeight: 700, letterSpacing: 3, color: GOLD, textTransform: 'uppercase' }}
        >
          A Letter From {dogName}
        </p>
        <p className="font-display text-center leading-tight" style={{ marginTop: 8, fontSize: 30, color: INK }}>
          {occasion}
        </p>
        {occasionSubtitle && (
          <p className="text-center" style={{ marginTop: 4, fontSize: 14, color: INK_SOFT }}>
            {occasionSubtitle}
          </p>
        )}
        <div style={{ marginTop: 22, width: 64, height: 2, background: RULE }} />
      </div>

      {/* The letter itself — the flexible middle so short (sparse) and long
          letters both sit centred between header and footer. */}
      <div
        className="flex-1 flex flex-col justify-center"
        style={{ paddingLeft: 48, paddingRight: 48, paddingTop: 24, paddingBottom: 20 }}
      >
        <p style={{ fontSize: 18, fontStyle: 'italic', color: INK }}>{salutation}</p>
        <p style={{ marginTop: 12, fontSize: 17, lineHeight: 1.62, color: INK, whiteSpace: 'pre-line' }}>
          {body}
        </p>
        <p style={{ marginTop: 18, fontSize: 18, fontWeight: 600, fontStyle: 'italic', color: INK }}>
          {signOff}
        </p>
      </div>

      {/* Footer — baked-in honesty label + brand/URL. */}
      <div style={{ paddingLeft: 48, paddingRight: 48, paddingBottom: 40 }}>
        <p style={{ fontSize: 12, fontStyle: 'italic', color: INK_SOFT, textAlign: 'center' }}>
          Written with AI, from {dogName}&apos;s real moments — nothing invented.
        </p>
        <div
          className="flex items-center justify-between"
          style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${RULE}` }}
        >
          <p className="font-display" style={{ fontSize: 16, color: INK }}>GoDoggyDate</p>
          <p style={{ fontSize: 12, color: INK_SOFT }}>godoggydate.com</p>
        </div>
      </div>
    </div>
  );
});

export default LetterCard;
