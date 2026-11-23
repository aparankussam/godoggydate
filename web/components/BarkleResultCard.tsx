'use client';
// web/components/BarkleResultCard.tsx
// The shareable Barkle result — web port of mobile/components/BarkleResultCard.
// SPOILER-FREE: it shows only the puzzle number, the score and the warmth emoji
// grid, never the breed name or its emoji, so a repost can't spoil the day for
// anyone who hasn't played. Exported to PNG via lib/shareCard (html2canvas),
// so it sticks to solid gradients (no backdrop-blur), and the brand + the
// godoggydate.com/barkle back-link are baked INSIDE the captured region.

import { forwardRef } from 'react';
import { MAX_TRIES, tileForGuess, type GuessResult } from '../../shared/barkle';

interface Props {
  puzzleNumber: number;
  results: GuessResult[];
  won: boolean;
}

// Sticker Book look: a paper card with an ink outline. Solid colours only, so
// html2canvas captures it exactly.

const BarkleResultCard = forwardRef<HTMLDivElement, Props>(function BarkleResultCard(
  { puzzleNumber, results, won },
  ref,
) {
  const score = won ? `${results.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  const grid = results.map(tileForGuess).join('');

  return (
    <div
      ref={ref}
      className="relative w-[320px] rounded-[28px] overflow-hidden text-[#2A1F4A]"
      style={{ background: '#FFF9EC', border: '2.5px solid #2A1F4A' }}
    >
      <div className="flex flex-col items-center px-6 py-[30px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.27em]" style={{ color: '#B8214F' }}>The daily dog game</p>
        <p className="mt-1.5 font-display text-[30px] leading-tight text-center">Barkle #{puzzleNumber}</p>

        <div className="mt-4 rounded-full px-[18px] py-2" style={{ backgroundColor: won ? '#6FDB9C' : '#F3ECDC', border: '2px solid #2A1F4A' }}>
          <p className="text-sm font-bold tracking-wide">
            {won ? `Solved in ${score}` : `Out of guesses · ${score}`}
          </p>
        </div>

        {/* Six tiles at 34px are wider than the 272px content box in emoji fonts
            with wide glyphs (Noto, Apple), so the sixth wrapped onto its own row
            in the shared PNG. Shrink for a full row and never wrap. */}
        <p
          className="mt-5 text-center"
          style={{
            fontSize: results.length > 5 ? 28 : 34,
            lineHeight: 1.2,
            letterSpacing: results.length > 5 ? 2 : 4,
            whiteSpace: 'nowrap',
          }}
          aria-label={`Result grid ${grid}`}
        >
          {grid}
        </p>

        <p className="mt-[18px] text-[13px] font-semibold text-center" style={{ color: '#4A3F6E' }}>Guess the mystery breed in six tries.</p>

        <div
          className="mt-[22px] -mx-6 -mb-[30px] self-stretch flex items-center justify-between px-6 py-3"
          style={{ backgroundColor: '#2A1F4A', color: '#FFF9EC' }}
        >
          <p className="font-display text-[15px]">GoDoggyDate</p>
          <p className="text-[11px] font-bold">godoggydate.com/barkle</p>
        </div>
      </div>
    </div>
  );
});

export default BarkleResultCard;
