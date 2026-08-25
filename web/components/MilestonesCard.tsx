'use client';
// web/components/MilestonesCard.tsx
// The celebration surface — birthdays, Gotcha Days, GoDoggyDate anniversaries.
// When one is active it becomes a shareable celebration card; otherwise it's a
// quiet countdown to the next real occasion. Every date here is one the owner
// actually entered — no invented monthaversaries.

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { computeMilestones, type Milestone } from '../../shared/milestones';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { toDogSlug } from '../lib/dogSlug';

interface Props {
  savedProfile: SavedDogProfile;
  userId: string;
}

function CelebrationCard({
  milestone,
  dogName,
  innerRef,
}: {
  milestone: Milestone;
  dogName: string;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      className="rounded-2xl p-6 text-center text-white"
      style={{ background: 'linear-gradient(155deg, #B45309 0%, #E8633A 55%, #F5B731 100%)' }}
    >
      <div className="text-5xl" aria-hidden="true">{milestone.emoji}</div>
      <p className="mt-2 font-display text-2xl leading-tight">{milestone.title}</p>
      <p className="mt-1 text-sm text-white/90">{milestone.subtitle}</p>
      <p className="mt-4 pt-3 border-t border-white/20 text-[11px] text-white/70">
        🐾 {dogName} on GoDoggyDate
      </p>
    </div>
  );
}

export default function MilestonesCard({ savedProfile, userId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const { active, next } = computeMilestones({
    name: savedProfile.name,
    birthYear: savedProfile.birthYear,
    birthMonth: savedProfile.birthMonth,
    birthDay: savedProfile.birthDay,
    adoptionDate: savedProfile.adoptionDate,
    createdAt: savedProfile.createdAt,
  });

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const celebrating = active[0] ?? null;

  async function handleShare() {
    if (!cardRef.current || sharing || !celebrating) return;
    setSharing(true);
    trackEvent('milestone_share_click', { kind: celebrating.kind });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const publicUrl = `${origin}/d/${toDogSlug(dogName, userId)}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-${celebrating.kind}.png`,
        {
          publicUrl,
          dogName,
          shareTitle: celebrating.title,
          shareText: `${celebrating.title} — ${celebrating.subtitle} 🎉`,
        },
      );
      trackEvent('milestone_shared', { kind: celebrating.kind, method: result });
    } catch {
      /* non-critical */
    } finally {
      setSharing(false);
    }
  }

  // Nothing real to celebrate or count down to — render nothing.
  if (!celebrating && !next) return null;

  if (celebrating) {
    return (
      <section className="card rounded-[1.8rem] px-5 py-5 flex flex-col gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary self-start">
          🎉 Today
        </p>
        <CelebrationCard milestone={celebrating} dogName={dogName} innerRef={cardRef} />
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="btn-primary py-2.5 text-sm disabled:opacity-60"
        >
          {sharing ? 'Rendering…' : `Share ${dogName}'s ${celebrating.kind === 'birthday' ? 'birthday' : 'day'}`}
        </button>
        {active.length > 1 && (
          <p className="text-center text-[11px] text-brown-light">
            +{active.length - 1} more to celebrate this month
          </p>
        )}
      </section>
    );
  }

  // Countdown to the next real occasion.
  return (
    <section className="card rounded-[1.8rem] px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brown-light">Coming up</p>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">{next!.emoji}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-brown truncate">{next!.title}</p>
          <p className="text-xs text-brown-light">
            {next!.subtitle} · {next!.daysUntil === 1 ? 'tomorrow' : `in ${next!.daysUntil} days`}
          </p>
        </div>
      </div>
    </section>
  );
}
