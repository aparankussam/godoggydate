'use client';
// web/components/playroom/ToyBox.tsx
// A colored "toy bin" around a Playroom section: shows the first 4 cards and
// tucks the rest behind "Show all N", which grows the same box in place.
// Mirrors mobile/components/playroom/ToyBox.tsx.

import { Children, useState, type ReactNode } from 'react';

const VISIBLE = 4;

interface Props {
  title: string;
  emoji: string;
  // Tailwind background class for the bin, e.g. 'bg-gold-light'.
  tint: string;
  // 'grid' = 2-column cards (tilted like stickers); 'stack' = full-width rows.
  layout: 'grid' | 'stack';
  children: ReactNode;
}

export default function ToyBox({ title, emoji, tint, layout, children }: Props) {
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  const extra = items.length - VISIBLE;
  const shown = all ? items : items.slice(0, VISIBLE);
  const body =
    layout === 'grid'
      ? 'grid grid-cols-2 gap-3 [&>*:nth-child(odd)]:-rotate-1 [&>*:nth-child(even)]:rotate-1 [&>*]:transition-transform [&>*:hover]:-translate-y-0.5 [&>*:active]:rotate-0 [&>*:active]:scale-95'
      : 'space-y-2.5';
  return (
    <section className={`rounded-[1.5rem] border-2 border-brown p-3.5 shadow-[0_6px_0_rgba(42,31,74,0.14)] ${tint}`}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-[26px] leading-none text-brown">
        <span aria-hidden="true" className="inline-block -rotate-6 text-[28px]">{emoji}</span>
        {title}
      </h2>
      <div className={body}>{shown}</div>
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mt-3.5 flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-brown bg-paper px-4 font-display text-lg text-brown transition-transform active:scale-95"
        >
          {all ? 'Show less ▲' : `Show all ${items.length} ▼`}
        </button>
      )}
    </section>
  );
}
