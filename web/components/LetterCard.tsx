'use client';
// web/components/LetterCard.tsx
// The shareable "Gotcha Day Letter" — a sealed-letter keepsake on warm
// parchment: a wax-seal header, the occasion, and a handwritten-feeling note
// from the dog to its human.
//
// Renders in two variants from the SAME letter data (see LetterSection):
//  - 'screen': the full letter, unclipped, sized to its natural content
//    height so the profile page can scroll it. No text is ever trimmed here.
//  - 'capture': the fixed 9:16 keepsake that actually gets captured for
//    sharing (web/lib/shareCard.ts's html2canvas path). A long letter would
//    overflow a fixed 9:16 box, so this variant measures itself and steps the
//    body text down through a small size ladder until it fits; only in the
//    rare case where even the smallest size still overflows does it fall back
//    to trimming the body at the last full sentence (never mid-word), marked
//    with an ellipsis. This variant must never sit inside a CSS transform —
//    html2canvas measures the captured node's own POST-transform bounding
//    box, so a scale() ancestor silently exports at the shrunk size (verified:
//    a scale(0.6) ancestor shrank the export from the intended 1080x1920 down
//    to ~650x1150, a ~65% resolution loss on every letter shared before this).
//
// Because html2canvas can't render oklch / backdrop-blur, every colour here is
// a literal hex. Two things are baked INTO the pixels so a reposted screenshot
// keeps them: the honesty label ("written with AI, from real moments") and the
// brand + URL ("GoDoggyDate · godoggydate.com").

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  /** 'screen' = full letter, natural height, page scrolls it — never trimmed.
   *  'capture' = the fixed 9:16 keepsake that gets captured/shared; auto-fits
   *  the body text down before ever trimming it. */
  variant: 'screen' | 'capture';
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

// Font-size/line-height ladder the CAPTURE variant steps down through before
// ever trimming a word. Tuned so most real letters (AI target ~150 words,
// hard cap ~235) fit within the first step or two.
const FIT_LADDER: { fontSize: number; lineHeight: number }[] = [
  { fontSize: 17, lineHeight: 1.62 },
  { fontSize: 16, lineHeight: 1.55 },
  { fontSize: 15, lineHeight: 1.48 },
  { fontSize: 14, lineHeight: 1.42 },
];

/** Floor on the trim budget, so the fit loop is always bounded. */
const MIN_BUDGET = 60;

/** Trim `text` to at most `maxChars`, cutting at the last full sentence
 *  inside that budget — never mid-word — and marking the cut with an
 *  ellipsis. Falls back to the last whole word if no sentence boundary falls
 *  within a reasonable share of the budget. */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const sentenceMatch = slice.match(/^[\s\S]*[.!?](?=\s|$)/);
  let cut = sentenceMatch ? sentenceMatch[0].trim() : '';
  if (cut.length < maxChars * 0.4) {
    cut = slice.replace(/\s+\S*$/, '').trim();
  }
  return cut.replace(/[.!?]+$/, '') + '…';
}

const LetterCard = forwardRef<HTMLDivElement, Props>(function LetterCard(
  { variant, salutation, body, signOff, dogName, occasion, occasionSubtitle },
  ref,
) {
  const isCapture = variant === 'capture';
  const middleRef = useRef<HTMLDivElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [displayBody, setDisplayBody] = useState(body);
  const [budget, setBudget] = useState(body.length);

  // Reset the fit whenever the underlying letter text changes.
  useLayoutEffect(() => {
    setStepIndex(0);
    setDisplayBody(body);
    setBudget(body.length);
  }, [body]);

  // Synchronous fit pass — runs before paint so there's no visible flicker.
  // Only the CAPTURE variant measures/shrinks; the screen variant always
  // shows the full letter at full size and lets the page scroll it.
  useLayoutEffect(() => {
    if (!isCapture) return;
    const el = middleRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight > el.clientHeight + 1; // +1px subpixel slack
    if (!overflowing) return;
    if (stepIndex < FIT_LADDER.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    // Smallest font and still overflowing — trim the text instead. Keep
    // stepping the budget until the rendered string ACTUALLY changes:
    // truncateAtSentence snaps to a sentence boundary, so a smaller budget can
    // yield the very same string, and setting identical state bails out of the
    // re-render — which would leave this effect un-rerun and the letter still
    // overflowing. Bounded by MIN_BUDGET, and always cuts at a sentence
    // boundary, never mid-word.
    let nextBudget = budget;
    let nextBody = displayBody;
    while (nextBudget > MIN_BUDGET && nextBody === displayBody) {
      nextBudget = Math.max(MIN_BUDGET, Math.floor(nextBudget * 0.85));
      nextBody = truncateAtSentence(body, nextBudget);
    }
    if (nextBody !== displayBody) {
      setBudget(nextBudget);
      setDisplayBody(nextBody);
    }
    // These deps are exactly the inputs that change the middle box's layout
    // (font rung, rendered text, variant), so the effect re-measures after
    // each shrink and stops as soon as it fits. It terminates because the
    // ladder is finite and the budget strictly decreases to MIN_BUDGET.
  }, [isCapture, stepIndex, displayBody, budget, body]);

  const fit = FIT_LADDER[stepIndex];
  const shownBody = isCapture ? displayBody : body;

  return (
    <div
      ref={ref}
      className={
        isCapture
          ? 'relative w-[540px] aspect-[9/16] overflow-hidden flex flex-col'
          : 'relative w-full max-w-[540px] flex flex-col'
      }
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

      {/* The letter itself. CAPTURE: min-h-0 lets this box actually respect
          its flex allocation instead of CSS min-height:auto growing it past
          the card (that's what used to push the sign-off/footer out of
          frame) — the same clamp is also what makes scrollHeight >
          clientHeight a reliable overflow signal for the fit pass above.
          SCREEN: no flex constraint at all — it just sizes to its content and
          the page scrolls it, so the full letter is always shown intact. */}
      <div
        ref={middleRef}
        className={isCapture ? 'flex-1 min-h-0 flex flex-col justify-center' : 'flex flex-col'}
        style={{ paddingLeft: 48, paddingRight: 48, paddingTop: 24, paddingBottom: 20 }}
      >
        <p style={{ fontSize: 18, fontStyle: 'italic', color: INK }}>{salutation}</p>
        <p
          style={{
            marginTop: 12,
            fontSize: isCapture ? fit.fontSize : 17,
            lineHeight: isCapture ? fit.lineHeight : 1.62,
            color: INK,
            whiteSpace: 'pre-line',
          }}
        >
          {shownBody}
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
