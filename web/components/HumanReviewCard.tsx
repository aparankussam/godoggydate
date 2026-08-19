'use client';
// web/components/HumanReviewCard.tsx
// The shareable "My Human: A Review" card — styled like a customer-review-site
// entry (avatar, star row, verdict headline, Pros / Areas-for-improvement
// columns) except the reviewer is a dog and the establishment is its human.
// Openly a joke: it carries a "playful AI read" label baked INTO the card and
// the star row is captioned "playful, not a real score".
//
// Exported to PNG via the same html2canvas path as ApologyCard/DogtypeCard, so
// colours are inline hex (no oklch / backdrop-blur) and the brand + URL are
// baked INSIDE the captured region — a reposted screenshot keeps the back-link.

import { forwardRef } from 'react';

interface Props {
  stars: number;
  headline: string;
  pros: string[];
  improvements: string[];
  verdict: string;
  dogName: string;
  dateLabel?: string;
}

// Review-site-ish palette, kept as literal hex for faithful html2canvas capture.
const PAPER = '#FFFDF9';
const INK = '#1F1B16';
const INK_SOFT = '#8A8378';
const RULE = '#ECE6DA';
const ACCENT = '#E8633A'; // brand primary-ish, for the brand mark
const STAR_ON = '#F4B740';
const STAR_OFF = '#E5DECF';
const PRO_GREEN = '#2F7A4B';
const IMPROVE_AMBER = '#B9791C';

/** Ten-segment star row that renders halves faithfully in html2canvas (no
 *  clip-path / mask — just five glyphs, each full / half / empty via overlay). */
function StarRow({ value }: { value: number }) {
  const clamped = Math.min(5, Math.max(0, value));
  return (
    <div style={{ display: 'flex', gap: 2 }} aria-label={`${clamped} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, clamped - i)); // 0, 0.5, or 1
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block', width: 18, height: 18, lineHeight: '18px', fontSize: 18 }}>
            <span style={{ color: STAR_OFF }}>★</span>
            {fill > 0 && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${fill * 100}%`,
                  overflow: 'hidden',
                  color: STAR_ON,
                  whiteSpace: 'nowrap',
                }}
              >
                ★
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

const HumanReviewCard = forwardRef<HTMLDivElement, Props>(function HumanReviewCard(
  { stars, headline, pros, improvements, verdict, dogName, dateLabel },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative w-[340px] rounded-[1.6rem] overflow-hidden"
      style={{ background: PAPER, border: `1px solid ${RULE}`, boxShadow: '0 10px 30px rgba(31,27,22,0.14)' }}
    >
      {/* Review-site chrome */}
      <div className="flex items-center justify-between px-5 pt-4">
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: ACCENT, textTransform: 'uppercase' }}>
          My Human · A Review
        </span>
        <span style={{ fontSize: 11, color: INK_SOFT }}>Verified pack member</span>
      </div>

      <div className="px-5 pt-3 pb-5">
        {/* Reviewer row — the dog is the reviewer */}
        <div className="flex items-center gap-3">
          <div
            className="shrink-0 flex items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: 14, background: '#F3ECDD', fontSize: 22 }}
            aria-hidden="true"
          >
            🐕
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
              Reviewed by {dogName}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <StarRow value={stars} />
              <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{stars.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 10, color: INK_SOFT, marginTop: 6 }}>
          {dateLabel ? `${dateLabel} · ` : ''}playful, not a real score
        </p>

        {/* Headline */}
        <p className="font-display leading-tight" style={{ fontSize: 20, color: INK, marginTop: 12 }}>
          “{headline}”
        </p>

        <div className="my-3.5" style={{ height: 1, background: RULE }} />

        {/* Pros */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: PRO_GREEN }}>
          Pros
        </p>
        <ul style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pros.map((p, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45, color: INK }}>
              <span style={{ color: PRO_GREEN }} aria-hidden="true">＋</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        {/* Areas for improvement */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: IMPROVE_AMBER, marginTop: 12 }}>
          Areas for improvement
        </p>
        <ul style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {improvements.map((p, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45, color: INK }}>
              <span style={{ color: IMPROVE_AMBER }} aria-hidden="true">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        {/* Verdict */}
        <div className="mt-3.5" style={{ borderTop: `1px solid ${RULE}`, paddingTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: INK_SOFT }}>
            Verdict
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: INK, marginTop: 4 }}>{verdict}</p>
        </div>

        {/* Honest "playful AI read" stamp — baked in, always visible in the PNG */}
        <div className="mt-3 flex items-center gap-2">
          <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">🐾</span>
          <span style={{ fontSize: 11, fontStyle: 'italic', color: INK_SOFT }}>
            A playful AI read in {dogName}&apos;s voice — not a real rating
          </span>
        </div>

        {/* Baked-in brand + URL — a reposted PNG still carries the back-link. */}
        <div
          className="mt-5 pt-3 flex items-center justify-between"
          style={{ borderTop: `1px solid ${RULE}` }}
        >
          <p className="font-display" style={{ fontSize: 13, color: INK }}>GoDoggyDate</p>
          <p style={{ fontSize: 10, color: INK_SOFT }}>godoggydate.com</p>
        </div>
      </div>
    </div>
  );
});

export default HumanReviewCard;
