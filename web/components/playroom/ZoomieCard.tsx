'use client';
// web/components/playroom/ZoomieCard.tsx
// One small card in the Playroom's "Zoomies" grid: a thumbnail or glyph, a name,
// and one line of real preview. A link when it opens another page, a button when
// it expands in place.

import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  glimpse: string;
  glyph: string;
  thumb?: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

export default function ZoomieCard({ label, glimpse, glyph, thumb, active, href, onClick }: Props) {
  const cls = `flex min-h-[132px] flex-col gap-1.5 rounded-[1.1rem] border-2 border-brown p-3 text-left shadow-[0_4px_0_rgba(42,31,74,0.12)] transition-colors ${
    active ? 'bg-note' : 'bg-paper hover:bg-cream-dark'
  }`;
  const inner = (
    <>
      <span className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border-2 border-brown bg-note text-2xl" aria-hidden="true">
        {thumb ?? glyph}
      </span>
      <span className="font-display text-lg leading-tight text-brown">{label}</span>
      <span className="text-[12.5px] font-semibold leading-snug text-brown-mid">{glimpse}</span>
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} className={cls} aria-label={`${label}. ${glimpse}`}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls} aria-label={`${label}. ${glimpse}`}>{inner}</button>
  );
}
