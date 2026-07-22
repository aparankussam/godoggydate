'use client';
// web/components/PlaydateMemoryCard.tsx
// Shareable artifact minted right after a playdate rating — the "boss
// reward" of the Playdate Payout. Reuses the trading-card visual language.

import { getPrimaryRenderablePhoto } from '../lib/photos';

interface Props {
  dogName: string;
  dogBreed?: string;
  photos?: string[];
  stars: number;
  innerRef?: React.Ref<HTMLDivElement>;
}

export default function PlaydateMemoryCard({ dogName, dogBreed, photos, stars, innerRef }: Props) {
  const photo = getPrimaryRenderablePhoto(photos);

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
          <img src={photo} alt={dogName} className="w-full h-full object-cover" crossOrigin="anonymous" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl">🐕</div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(45,26,14,0.95) 0%, rgba(45,26,14,0.5) 40%, transparent 75%)' }}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-10">
        <p className="text-3xl mb-2" aria-hidden="true">
          {'⭐'.repeat(Math.max(1, Math.min(5, stars)))}
        </p>
        <h3 className="font-display text-3xl text-white leading-tight">
          Playdate with {dogName}
        </h3>
        {dogBreed && <p className="mt-1 text-white/70 text-xs">{dogBreed}</p>}
        <p className="mt-3 text-white/85 text-sm font-semibold">Our dogs played. It went great.</p>

        <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
          <p className="font-display text-sm text-white">GoDoggyDate</p>
          <p className="text-[10px] text-white/50">godoggydate.com</p>
        </div>
      </div>
    </div>
  );
}
