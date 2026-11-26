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
import { publicDogUrl } from '../lib/dogSlug';
import { Icon } from './icons';

interface Props {
  savedProfile: SavedDogProfile;
  userId: string;
  /** Owner view: offers "Add date" for a missing birthday or Gotcha Day (opens Edit at the dates). */
  onAddDate?: () => void;
}

const MILESTONE_ICONS = { birthday: 'cake-variant', gotcha: 'home', godoggy_anniversary: 'paw' } as const;

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
      className="rounded-2xl border-[2.5px] border-brown p-6 text-center text-brown"
      style={{ background: '#FFF9EC' }}
    >
      <div className="text-5xl" aria-hidden="true">{milestone.emoji}</div>
      <p className="mt-2 font-display text-2xl leading-tight">{milestone.title}</p>
      <p className="mt-1 text-[15px] font-extrabold text-brown-mid">{milestone.subtitle}</p>
      <p className="mt-4 pt-3 border-t-2 border-brown/20 text-sm font-extrabold text-brown-mid">
        {dogName} on GoDoggyDate
      </p>
    </div>
  );
}

export default function MilestonesCard({ savedProfile, userId, onAddDate }: Props) {
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
      const publicUrl = publicDogUrl(origin, dogName, userId, savedProfile.publicPage);
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
  // Real dates only, never samples: a missing one is shown as a gap to fill.
  const missing = onAddDate
    ? [
        !savedProfile.birthMonth && { key: 'birthday' as const, title: `${dogName}'s birthday` },
        !savedProfile.adoptionDate && { key: 'gotcha' as const, title: 'Gotcha Day' },
      ].filter((m): m is { key: 'birthday' | 'gotcha'; title: string } => !!m)
    : [];

  if (!celebrating && !next && missing.length === 0) return null;

  if (celebrating) {
    return (
      <section className="card rounded-[1.8rem] px-5 py-5 flex flex-col gap-3">
        <p className="text-xs font-bold text-brown self-start">
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
          <p className="text-center text-xs text-brown-mid">
            +{active.length - 1} more to celebrate this month
          </p>
        )}
      </section>
    );
  }

  // Countdown to the next real occasion.
  return (
    <section className="card rounded-[1.8rem] px-5 py-4">
      <p className="text-xs font-bold text-brown-mid">Coming up</p>
      {next && (
        <div className="mt-1 flex items-center gap-3">
          <Icon name={MILESTONE_ICONS[next.kind]} size={24} className="text-brown" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-brown truncate">{next.title}</p>
            <p className="text-xs text-brown-mid">
              {next.subtitle} · {next.daysUntil === 1 ? 'tomorrow' : `in ${next.daysUntil} days`}
            </p>
          </div>
        </div>
      )}
      {missing.map((m) => (
        <div key={m.key} className="mt-2 flex items-center gap-3">
          <Icon name={MILESTONE_ICONS[m.key]} size={24} className="text-brown opacity-50" />
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-brown/60">{m.title}</p>
          <button type="button" onClick={onAddDate} className="min-h-[36px] rounded-full border-2 border-brown bg-cream px-3 text-xs font-black text-brown">
            Add date
          </button>
        </div>
      ))}
    </section>
  );
}
