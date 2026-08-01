'use client';
// web/components/PlaydateMemoryCard.tsx
// Shareable artifact minted right after a playdate rating — the "boss
// reward" of the Playdate Payout. Reuses the trading-card visual language.

import { getPrimaryRenderablePhoto } from '../lib/photos';

interface Props {
  dogName: string;
  dogBreed?: string;
  photos?: string[];
  /** null = this playdate has no rating. Renders no star row and no verdict
   *  line rather than inventing either. */
  stars: number | null;
  innerRef?: React.Ref<HTMLDivElement>;
}

/** The card used to hardcode "It went great." under every rating, so a
 *  1-star playdate still minted a card claiming it went great — a shareable
 *  artifact contradicting what the owner actually said. Say only what the
 *  rating supports, and say nothing when it supports nothing. */
function verdictLine(stars: number | null): string | null {
  if (stars === null) return null;
  if (stars >= 5) return 'Best playdate yet.';
  if (stars === 4) return 'It went great.';
  if (stars === 3) return 'A good hang.';
  return null;
}

export default function PlaydateMemoryCard({ dogName, dogBreed, photos, stars, innerRef }: Props) {
  const photo = getPrimaryRenderablePhoto(photos);
  const clampedStars = stars === null ? null : Math.max(0, Math.min(5, stars));
  const verdict = verdictLine(clampedStars);

  return (
    <div
      ref={innerRef}
      className="relative w-[340px] aspect-[9/16] rounded-[2rem] overflow-hidden shadow-2xl"
      style={{ background: 'linear-gradient(160deg, #3D1F0A 0%, #B45309 55%, #E8633A 100%)' }}
    >
      <div className="absolute top-5 left-5 z-10 rounded-full bg-black/25 backdrop-blur-sm px-3 py-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Playdate Confirmed</p>
      </div>
      <div className="absolute top-5 right-5 z-10 text-2xl select-none" aria-hidden="true">🎾</div>

      <div className="absolute inset-0">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          // No crossOrigin here — Firebase Storage isn't CORS-configured for
          // this origin, so requesting the image as CORS makes the browser
          // refuse to load it at all (the card rendered with an empty photo).
          // shareCard.ts re-fetches with its own useCORS during html2canvas
          // capture, independent of this element. Same fix as DogTradingCard.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={dogName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl">🐕</div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(45,26,14,0.95) 0%, rgba(45,26,14,0.5) 40%, transparent 75%)' }}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-10">
        {clampedStars !== null && clampedStars > 0 && (
          <p className="text-3xl mb-2" aria-hidden="true">
            {'⭐'.repeat(clampedStars)}
          </p>
        )}
        <h3 className="font-display text-3xl text-white leading-tight">
          Playdate with {dogName}
        </h3>
        {dogBreed && <p className="mt-1 text-white/70 text-xs">{dogBreed}</p>}
        {verdict && <p className="mt-3 text-white/85 text-sm font-semibold">Our dogs played. {verdict}</p>}

        <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
          <p className="font-display text-sm text-white">GoDoggyDate</p>
          <p className="text-[10px] text-white/50">godoggydate.com</p>
        </div>
      </div>
    </div>
  );
}
