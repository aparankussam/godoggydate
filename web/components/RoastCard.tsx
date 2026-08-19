'use client';
// web/components/RoastCard.tsx
// The shareable "Roast My Dog (Certified Affectionate)" card — a 9:16 comedy-
// club poster. The dog sits on a stool under a spotlight; three roast lines land
// as the set, and one warm compliment closes it out. Deliberately styled like a
// stand-up flyer ("TONIGHT ONLY", spotlight, brick-red stage) so it reads as an
// affectionate roast at a glance — never as a real judgement of the dog.
//
// It carries an "affectionate roast · written by AI" label baked INTO the
// captured region, alongside the GoDoggyDate + URL back-link, so a reposted
// screenshot still shows both that it's AI comedy and where it came from.
//
// Renders at a 540×960 base (9:16) and exports via the same html2canvas path as
// every other card (shareCard.ts), which at scale:2 lands on the 1080×1920 story
// canvas. Colours are inline hex (no oklch / backdrop-blur) for faithful capture.

import { forwardRef } from 'react';

interface Props {
  dogName: string;
  /** Exactly 3 affectionate roast lines. */
  lines: string[];
  /** The mandatory warm closing compliment. */
  compliment: string;
}

// Comedy-club palette, literal hex for faithful html2canvas capture.
const STAGE = '#241014'; // deep brick-red house
const STAGE_2 = '#3A1A18';
const SPOT = '#F5B731'; // spotlight gold
const CREAM = '#FDF6EE';
const CREAM_SOFT = '#E9D9C6';
const PRIMARY = '#E8633A';
const INK_SOFT = 'rgba(253,246,238,0.62)';

const RoastCard = forwardRef<HTMLDivElement, Props>(function RoastCard(
  { dogName, lines, compliment },
  ref,
) {
  const three = (lines ?? []).slice(0, 3);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden"
      style={{
        width: 540,
        aspectRatio: '9 / 16',
        background: `radial-gradient(120% 60% at 50% 8%, ${STAGE_2} 0%, ${STAGE} 55%, #180A0D 100%)`,
        color: CREAM,
      }}
    >
      {/* Spotlight cone from the top, behind the dog. */}
      <div
        className="absolute"
        style={{
          top: -60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 460,
          height: 520,
          background: `radial-gradient(60% 70% at 50% 0%, rgba(245,183,49,0.32) 0%, rgba(245,183,49,0.10) 42%, rgba(245,183,49,0) 70%)`,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col items-center h-full px-9 pt-10 pb-9">
        {/* Marquee eyebrow */}
        <p
          className="font-bold uppercase text-center"
          style={{ fontSize: 15, letterSpacing: 5, color: SPOT }}
        >
          ★ Tonight Only ★
        </p>

        {/* The dog on a stool, under the spotlight. */}
        <div className="relative mt-4 flex flex-col items-center" aria-hidden="true">
          <span style={{ fontSize: 96, lineHeight: 1 }}>🐕</span>
          <span style={{ fontSize: 64, lineHeight: 0.7, marginTop: -8 }}>🪑</span>
        </div>

        <h2
          className="font-display text-center leading-[1.02] mt-4"
          style={{ fontSize: 46, color: CREAM }}
        >
          Roasting {dogName}
        </h2>
        <p
          className="text-center mt-1.5"
          style={{ fontSize: 15, color: INK_SOFT, letterSpacing: 0.5 }}
        >
          A certified affectionate roast
        </p>

        {/* The three-beat set. */}
        <div className="w-full mt-6 flex flex-col gap-3">
          {three.map((line, i) => (
            <div key={i} className="flex items-start gap-3">
              <span
                className="font-display shrink-0"
                style={{ fontSize: 26, color: PRIMARY, lineHeight: 1.05, width: 26 }}
              >
                {i + 1}
              </span>
              <p style={{ fontSize: 19, lineHeight: 1.34, color: CREAM }}>{line}</p>
            </div>
          ))}
        </div>

        {/* The warm landing. Pushed toward the bottom so it reads as the closer. */}
        <div
          className="w-full mt-auto"
          style={{
            marginTop: 24,
            borderRadius: 18,
            border: `1px solid rgba(245,183,49,0.35)`,
            background: 'rgba(245,183,49,0.10)',
            padding: '16px 18px',
          }}
        >
          <p
            className="font-bold uppercase"
            style={{ fontSize: 12, letterSpacing: 2, color: SPOT, marginBottom: 6 }}
          >
            But honestly —
          </p>
          <p style={{ fontSize: 18, lineHeight: 1.36, color: CREAM }}>{compliment}</p>
        </div>

        {/* Baked-in AI label + brand + URL — a reposted PNG still shows it's AI
            comedy and still carries the back-link. */}
        <div
          className="w-full mt-5 pt-4 flex items-center justify-between"
          style={{ borderTop: `1px solid rgba(253,246,238,0.18)` }}
        >
          <p style={{ fontSize: 12, color: CREAM_SOFT }}>affectionate roast · written by AI</p>
          <div className="text-right">
            <p className="font-display" style={{ fontSize: 15, color: CREAM }}>GoDoggyDate</p>
            <p style={{ fontSize: 11, color: INK_SOFT }}>godoggydate.com</p>
          </div>
        </div>
      </div>
    </div>
  );
});

export default RoastCard;
