'use client';
// web/components/LifeStageCard.tsx
// "Life in Dog Years, done right" on the profile — a size-aware life-stage read
// framed strictly as a cohort average (never a prediction about this dog), with
// a gentle "what this stage needs" line that ties into Cadence. Renders a quiet
// nudge to add a birth year when there isn't one, rather than guessing age.

import type { SavedDogProfile } from '../lib/auth';
import { computeLifeStage } from '../../shared/lifeStage';

interface Props {
  savedProfile: SavedDogProfile;
  /** Opens the profile editor so the owner can add a birth year. */
  onEditProfile?: () => void;
}

export default function LifeStageCard({ savedProfile, onEditProfile }: Props) {
  const read = computeLifeStage({
    birthYear: savedProfile.birthYear,
    birthMonth: savedProfile.birthMonth,
    size: savedProfile.size,
  });
  const name = savedProfile.name?.trim() || 'Your dog';

  // No birth year yet — offer to add one instead of inventing an age.
  if (!read) {
    return (
      <section className="card rounded-[1.8rem] px-5 py-4">
        <p className="text-sm font-bold text-brown">🎂 {name}&apos;s life stage</p>
        <p className="mt-1 text-xs leading-relaxed text-brown-light">
          Add {name}&apos;s birth year and we&apos;ll show where they are in their life, and what this stage needs.
        </p>
        {onEditProfile && (
          <button
            type="button"
            onClick={onEditProfile}
            className="mt-2 text-xs font-bold text-primary underline underline-offset-2"
          >
            Add birth date
          </button>
        )}
      </section>
    );
  }

  const yearsLabel = read.ageYears === 0
    ? 'Under a year old'
    : `${read.ageYears} year${read.ageYears === 1 ? '' : 's'} old`;
  const remaining = Math.round(read.cohortYearsRemaining);

  return (
    <section className="card rounded-[1.8rem] overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brown-light">Life stage</p>
            <p className="font-display text-2xl text-brown leading-tight">
              {read.stageEmoji} {read.stageLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-brown">{yearsLabel}</p>
            <p className="text-[11px] text-brown-light">~{read.humanYearsEstimate} in human years</p>
          </div>
        </div>

        <p className="mt-2 text-sm text-brown-mid leading-relaxed">{read.stageBlurb}</p>

        {/* Progress through a cohort-average life */}
        <div className="mt-3">
          <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-primary"
              style={{ width: `${Math.round(read.percentOfLife * 100)}%` }}
            />
          </div>
          {read.outlivedCohort ? (
            <p className="mt-1.5 text-[11px] text-brown-light leading-snug">
              Dogs {name}&apos;s size live about {read.cohortLifespan} years on average — and{' '}
              <span className="font-semibold text-brown-mid">{name} is already living past it</span>. Every
              extra day is a gift. Keep them comfortable and keep the walks coming.
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-brown-light leading-snug">
              Dogs {name}&apos;s size live about {read.cohortLifespan} years on average — so, as a cohort, roughly{' '}
              <span className="font-semibold text-brown-mid">{remaining} more year{remaining === 1 ? '' : 's'}</span>{' '}
              of walks together. An average, not a prediction.
            </p>
          )}
        </div>
      </div>

      {/* What this stage needs — the honest hook into Cadence */}
      <div className="border-t border-border bg-cream-dark/30 px-5 py-3">
        <p className="text-xs text-brown-mid leading-relaxed">
          <span className="font-bold text-brown">This stage:</span> {read.stageFocus}
        </p>
      </div>
    </section>
  );
}
