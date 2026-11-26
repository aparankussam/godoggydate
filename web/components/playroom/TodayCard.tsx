'use client';
// web/components/playroom/TodayCard.tsx
// The Playroom's first and only card: today's Barkle (the daily habit), then
// one untried toy featured in the dog's own voice, and a thin row of dots for
// how many of the 15 toys have been tried. Replaces the old two-card layout
// (a Barkle card plus a 15-slot Collar of Charms grid), which put a checklist
// above the daily habit. Mirrors mobile/components/playroom/TodayCard.tsx.

import Link from 'next/link';
import { CHARM_LIST, charmLabel, charmVoiceLine, type CharmInfo } from '../../../shared/charms';
import { Icon } from '../icons';

export default function TodayCard({
  dogName,
  streakLine,
  onPlayBarkle,
  pick,
  onTryPick,
  earned,
}: {
  dogName: string;
  streakLine: string;
  onPlayBarkle: () => void;
  pick: CharmInfo | null;
  onTryPick: (charm: CharmInfo) => void;
  earned: string[];
}) {
  return (
    <section className="space-y-2.5 rounded-[1.5rem] border-2 border-brown bg-paper p-4 shadow-[0_6px_0_rgba(42,31,74,0.14)]">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-rose">Today in the Playroom</p>

      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 font-display text-xl leading-tight text-brown">{streakLine}</h2>
        <Link href="/barkle" onClick={onPlayBarkle} className="btn-primary px-5 py-2 text-sm">
          Play
        </Link>
      </div>

      <div className="border-t-2 border-border" />

      {pick ? (
        <>
          <p className="text-[15px] font-black text-brown">{dogName}&apos;s pick: {charmLabel(pick, dogName)}</p>
          <p className="text-[13px] italic leading-snug text-brown-mid">&ldquo;{charmVoiceLine(pick, dogName)}&rdquo;</p>
          <div className="flex items-center justify-between gap-3">
            <Dots earned={earned} />
            <button type="button" onClick={() => onTryPick(pick)} className="btn-secondary px-4 py-1.5 text-sm">
              Try it
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-black text-brown">
            <Icon name="trophy" size={18} className="shrink-0 text-rose" />
            {dogName} has tried every toy here
          </p>
          <Dots earned={earned} />
        </div>
      )}
    </section>
  );
}

function Dots({ earned }: { earned: string[] }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${earned.length} of ${CHARM_LIST.length} toys tried`}>
      {CHARM_LIST.map((c) => (
        <span
          key={c.id}
          aria-hidden="true"
          className={`h-2 w-2 rounded-full border ${earned.includes(c.id) ? 'border-brown bg-gold-light' : 'border-brown-mid'}`}
        />
      ))}
    </div>
  );
}
