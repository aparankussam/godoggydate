'use client';
// web/components/EarnedStickers.tsx
// A small profile row — "Stickers earned" — showing the emoji decals the owner
// has genuinely unlocked by booping their dog's snoot (read from the local
// boop count via lib/boops.ts). This is the "sticker on your profile / stand
// out" the founder asked for: earned, not bought, and it links straight to the
// Sticker Studio to put them on a photo. Renders nothing until something's
// earned, so it never adds empty chrome.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadAllTime, unlockedStickers, nextSticker, type Sticker } from '../lib/boops';

interface Props {
  /** The owner's uid — the per-dog localStorage key for the boop count. */
  dogId: string;
}

export default function EarnedStickers({ dogId }: Props) {
  const [allTime, setAllTime] = useState<number | null>(null);

  useEffect(() => {
    if (!dogId) return;
    const read = () => setAllTime(loadAllTime(dogId));
    read();
    // Re-read when the tab regains focus (they may have booped on the toy and
    // come back) and on cross-tab storage writes.
    const onFocus = () => read();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === `godoggydate.boops.${dogId}`) read();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [dogId]);

  // Nothing earned yet (or not yet read) — render nothing.
  if (allTime === null || allTime <= 0) return null;
  const earned: Sticker[] = unlockedStickers(allTime);
  if (earned.length === 0) return null;

  const next = nextSticker(allTime);

  return (
    <section className="card rounded-[1.8rem] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Stickers earned</p>
          <p className="mt-0.5 text-sm text-brown-mid">
            Unlocked by booping — {allTime.toLocaleString()} boop{allTime === 1 ? '' : 's'} so far.
          </p>
        </div>
        <Link
          href="/app/fun/sticker-studio"
          className="shrink-0 rounded-full border border-primary px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 transition-colors"
        >
          Use them →
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {earned.map((s) => (
          <span
            key={s.id}
            title={s.label}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cream-dark/50 border border-border text-2xl"
          >
            {s.emoji}
          </span>
        ))}
      </div>

      {next && (
        <p className="mt-2.5 text-[12px] text-brown-light">
          Next up: {next.emoji} {next.label} at {next.unlockAt.toLocaleString()} boops.{' '}
          <Link href="/app/fun/snoot" className="text-primary font-bold hover:underline">Boop the snoot</Link>
        </p>
      )}
    </section>
  );
}
