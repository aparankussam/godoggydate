'use client';
// web/components/DogtypeCard.tsx
// The shareable Dogtype identity card — a 9:16 artifact that says, in one
// glance, "my dog is a Zoomie Menace 🌪️". Works at N=1 (no other users), reads
// only from the owner's own profile, and exports to PNG via the same
// html2canvas path as DogTradingCard. This is the free acquisition hook: the
// social object a stranger sees and wants for their own dog.

import type { Dogtype } from '../../shared/dogtype';

interface Props {
  dogtype: Dogtype;
  dogName: string;
  photoUrl?: string;
  /** Forwarded ref target for html2canvas capture — wraps the whole card. */
  innerRef?: React.Ref<HTMLDivElement>;
}

// Spark dogs get a fiery gradient, Zen dogs a warm calm one — collectible
// variety while staying inside the brand palette. Kept to solid gradients (no
// backdrop-blur) so html2canvas captures them faithfully.
function gradientFor(code: string): string {
  const spark = code[0] === 'E';
  return spark
    ? 'linear-gradient(160deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)'
    : 'linear-gradient(160deg, #241A2E 0%, #5C3D2E 50%, #C98A5E 100%)';
}

export default function DogtypeCard({ dogtype, dogName, photoUrl, innerRef }: Props) {
  return (
    <div
      ref={innerRef}
      className="relative w-[360px] aspect-[9/16] rounded-[2rem] overflow-hidden shadow-2xl text-white"
      style={{ background: gradientFor(dogtype.code) }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 pt-5 z-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">Dogtype</p>
        <p className="font-mono text-sm font-bold tracking-[0.28em] text-white/90 bg-black/25 rounded-md px-2.5 py-1.5">
          {dogtype.code}
        </p>
      </div>

      {/* Hero */}
      <div className="absolute inset-x-0 top-[14%] flex flex-col items-center px-6">
        <div
          className="flex items-center justify-center rounded-full bg-white/12 border border-white/25 overflow-hidden"
          style={{ width: 156, height: 156 }}
        >
          {photoUrl ? (
            // No crossOrigin (Firebase Storage isn't CORS-configured for this
            // origin); shareCard's html2canvas re-fetches with useCORS during
            // capture — same rationale as DogTradingCard.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={dogName} className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontSize: 92, lineHeight: 1 }} aria-hidden="true">{dogtype.emoji}</span>
          )}
        </div>
        {photoUrl && (
          <div
            className="absolute rounded-full bg-black/40 flex items-center justify-center"
            style={{ width: 56, height: 56, top: 116, right: 92, fontSize: 32 }}
            aria-hidden="true"
          >
            {dogtype.emoji}
          </div>
        )}
      </div>

      {/* Info panel */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">{dogName}&apos;s Dogtype</p>
        <h3 className="font-display text-[2.1rem] leading-[1.05] text-white mt-0.5">{dogtype.name}</h3>
        <p className="mt-1 text-white/85 text-sm font-semibold italic">{dogtype.tagline}</p>
        <p className="mt-2 text-white/80 text-[13px] leading-snug">{dogtype.blurb}</p>

        {/* Axis readout — the four real dimensions, straight from the profile */}
        <div className="mt-4 grid grid-cols-2 gap-1.5">
          {dogtype.axes.map((a) => (
            <div
              key={a.key}
              className="rounded-xl bg-white/12 border border-white/15 px-2.5 py-1.5 flex items-center gap-1.5"
            >
              <span style={{ fontSize: 16 }} aria-hidden="true">{a.pole.emoji}</span>
              <span className="text-[11px] font-bold text-white">{a.pole.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
          <p className="font-display text-sm text-white">GoDoggyDate</p>
          <p className="text-[10px] text-white/60">godoggydate.com/dogtype/{dogtype.code}</p>
        </div>
      </div>
    </div>
  );
}
