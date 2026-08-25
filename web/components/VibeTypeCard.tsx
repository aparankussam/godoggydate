'use client';
// web/components/VibeTypeCard.tsx
// Decodes the Vibe Check archetype into a tappable "type" card. Reused on a
// dog's own profile and on a matched dog's profile — same data, same shape,
// only ever rendered as a static pill before this (name only, no code, no
// description — the two most distinctive fields the model generates were
// thrown away).

import { useState } from 'react';
import type { DogArchetype } from '../../shared/types';

interface Props {
  archetype: DogArchetype;
}

export default function VibeTypeCard({ archetype }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="w-full text-left rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 to-primary/5 px-4 py-3 transition-colors hover:from-gold/15"
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-2xl" aria-hidden="true">✨</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-brown leading-tight truncate">{archetype.name}</p>
          <p className="text-[11px] text-brown-light">Tap to see why</p>
        </div>
        <span className="shrink-0 text-brown-light text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gold/20">
          <p className="text-sm text-brown-mid leading-relaxed">{archetype.description}</p>
        </div>
      )}
    </button>
  );
}
