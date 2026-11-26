'use client';
// web/components/playroom/TreatRow.tsx
// One line in "Treat Lab": a title and a short glimpse. Opens that maker in place.
// The maker (an AI generator) only runs on a tap inside the open view.

import type { ReactNode } from 'react';
import { Icon } from '../icons';

interface Props {
  title: string;
  glimpse: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function TreatRow({ title, glimpse, open, onToggle, children }: Props) {
  return (
    <div className="overflow-hidden rounded-[1.1rem] border-2 border-brown bg-paper">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[64px] w-full items-center gap-3 p-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[20px] leading-tight text-brown">{title}</span>
          <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-brown-mid">{glimpse}</span>
        </span>
        <span className="text-[13px] font-black text-rose" aria-hidden="true"><Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} /></span>
      </button>
      {open ? <div className="px-2 pb-3">{children}</div> : null}
    </div>
  );
}
