'use client';
// web/components/MomentsTimeline.tsx
// The Moments Diary — a warm keepsake timeline of a dog's past Pet Twin cards.
// Each row is a thought the twin has shared before: its mood emoji, the words,
// the source chip (the real thing it reacted to — the same honesty contract as
// PetTwinCard), and how long ago it landed. Read-only; it subscribes to the
// server-written history via onMomentHistory. The newest card lives in
// PetTwinCard above this, so the diary is the memory that compounds beneath it.

import { useEffect, useState } from 'react';
import { onMomentHistory, type PetTwinMoment } from '../lib/moments';

interface Props {
  dogId: string;
  /** How many past moments to keep in view (default 30). */
  max?: number;
}

/** "just now" / "3 hours ago" / "yesterday" / "5 days ago" / "Mar 14" —
 *  friendly for recent memories, an actual date once they're old enough to
 *  feel like diary entries. Guards against clock skew (future timestamps). */
function relativeDate(createdAt: number, nowMs: number): string {
  const diff = nowMs - createdAt;
  if (!Number.isFinite(createdAt) || diff < 0) return 'just now';
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 1) return 'just now';
  if (mins < 60) return mins === 1 ? 'a minute ago' : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const d = new Date(createdAt);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function MomentRow({ moment, nowMs, isLast }: { moment: PetTwinMoment; nowMs: number; isLast: boolean }) {
  return (
    <li className="relative pl-8">
      {/* Timeline spine + node — spine omitted on the last row so it doesn't
          dangle below the final entry (last:hidden never matched here). */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[9px] top-6 -bottom-5 w-px bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-cream-dark text-[13px] leading-none ring-2 ring-cream"
      >
        {moment.moodEmoji}
      </span>

      <div className="pb-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            {moment.mood}
          </span>
          <span className="text-[11px] text-brown-light">· {relativeDate(moment.createdAt, nowMs)}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-brown">&ldquo;{moment.thought}&rdquo;</p>
        {moment.sourceLabel && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-cream-dark px-2.5 py-1 text-[10px] font-semibold text-brown-mid">
            ✨ imagined from {moment.sourceLabel}
          </span>
        )}
      </div>
    </li>
  );
}

export default function MomentsTimeline({ dogId, max = 30 }: Props) {
  const [moments, setMoments] = useState<PetTwinMoment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!dogId) return;
    setLoaded(false);
    setNow(Date.now());
    return onMomentHistory(
      dogId,
      (list) => {
        setMoments(list);
        setLoaded(true);
      },
      max,
    );
  }, [dogId, max]);

  // Until the first snapshot lands, render nothing — PetTwinCard above already
  // owns the "meet your Pet Twin" call to action, so a diary skeleton here would
  // just be noise.
  if (!loaded) return null;

  // A single moment IS today's card (shown in PetTwinCard above); there's no
  // history to look back on yet, so keep the diary hidden until it has depth.
  if (moments.length < 2) {
    return (
      <section className="card rounded-[1.8rem] px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Moments Diary</p>
        <p className="mt-2 text-sm leading-relaxed text-brown-light">
          Every card your Pet Twin shares is kept here — a little diary of their days. Come back
          after a few more and you&apos;ll have a keepsake to look back on. 🐾
        </p>
      </section>
    );
  }

  return (
    <section className="card rounded-[1.8rem] px-5 py-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Moments Diary</p>
        <span className="text-[10px] font-semibold text-brown-light">
          {moments.length} {moments.length === 1 ? 'memory' : 'memories'}
        </span>
      </div>
      <p className="mt-1 font-display text-lg leading-tight text-brown">Days worth remembering</p>

      <ol className="mt-4">
        {moments.map((m, i) => (
          <MomentRow key={m.id} moment={m} nowMs={now} isLast={i === moments.length - 1} />
        ))}
      </ol>
    </section>
  );
}
