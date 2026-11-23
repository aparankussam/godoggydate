'use client';
// web/components/DogtypeCompatCard.tsx
// The two-dog "do our dogs get along?" card — the web twin of
// mobile/components/DogtypeCompatCard.tsx, and the app's one true invite loop
// (sharing it invites a second owner to find their dog's type and compare).
// Deterministic + honest: a playful vibe verdict from shared/dogtypeCompat,
// never a fabricated match %.
//
// Captured for sharing via web/lib/shareCard.ts's html2canvas path, so — like
// every other keepsake — every colour is a literal hex (html2canvas can't
// render oklch / Tailwind arbitrary colours), and the "A × B → verdict" layout
// is itself the attribution signature, with only a small brand handle at the
// bottom.

import { forwardRef } from 'react';
import type { Dogtype, DogtypeCompat } from '../../shared/dogtype';

interface Props {
  aType: Dogtype;
  bType: Dogtype;
  aName: string;
  bName?: string;
  compat: DogtypeCompat;
}

// Sticker Book palette: paper card, ink outline and text (solid colours so
// html2canvas captures it exactly).
const INK = '#2A1F4A';
const INK_SOFT = '#4A3F6E';
const INK_FAINT = '#5E5380';
const RULE = '#E3D6BA';

function DogPole({ type, name }: { type: Dogtype; name: string }) {
  return (
    <div style={{ width: 116, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: 46,
          background: '#DCEEFB',
          border: '2px solid #2A1F4A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden="true"
      >
        <span style={{ fontSize: 52, lineHeight: 1 }}>{type.emoji}</span>
      </div>
      <p
        style={{ marginTop: 8, fontFamily: 'var(--font-display, system-ui, sans-serif)', fontSize: 18, color: INK, textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {name}
      </p>
      <p
        style={{ marginTop: 1, fontSize: 11, fontWeight: 600, color: INK_SOFT, textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {type.name}
      </p>
    </div>
  );
}

const DogtypeCompatCard = forwardRef<HTMLDivElement, Props>(function DogtypeCompatCard(
  { aType, bType, aName, bName, compat },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        width: 340,
        borderRadius: 24,
        overflow: 'hidden',
        padding: '22px 20px 18px',
        background: '#FFF9EC',
        border: '2.5px solid #2A1F4A',
      }}
    >
      <p style={{ color: INK_SOFT, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}>
        Do our dogs get along?
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
        <DogPole type={aType} name={aName} />
        <div style={{ width: 48, display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontSize: 34, lineHeight: 1 }}>{compat.emoji}</span>
        </div>
        <DogPole type={bType} name={bName || bType.name} />
      </div>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: INK, fontFamily: 'var(--font-display, system-ui, sans-serif)', fontSize: 24, lineHeight: 1.12, textAlign: 'center' }}>
          {compat.headline}
        </p>
        <p style={{ color: INK_SOFT, fontSize: 14, lineHeight: 1.43, textAlign: 'center', marginTop: 8 }}>
          {compat.note}
        </p>
        <p style={{ color: INK_FAINT, fontSize: 10, fontStyle: 'italic', textAlign: 'center', marginTop: 10 }}>
          a playful vibe from their Dogtypes — not a score
        </p>
      </div>

      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: INK, fontFamily: 'var(--font-display, system-ui, sans-serif)', fontSize: 14 }}>GoDoggyDate</p>
        <p style={{ color: INK_FAINT, fontSize: 10 }}>What&apos;s your dog? · godoggydate.com/dogtype</p>
      </div>
    </div>
  );
});

export default DogtypeCompatCard;
