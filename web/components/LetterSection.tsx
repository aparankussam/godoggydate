'use client';
// web/components/LetterSection.tsx
// Profile-page surface for "The Gotcha Day Letter". It only appears when a REAL
// occasion the owner entered — a Gotcha Day or birthday — is active or coming up
// within the window (shared/milestones.ts via pickLetterMilestone). The owner
// taps once; the server writes a warm ~150-word letter FROM the dog, grounded
// only in the dog's stored facts and cached per occasion, and renders it on a
// sealed-letter 9:16 card they can share. Openly AI-written, nothing invented.

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { requestLetter, pickLetterMilestone, type Letter, type LetterKind } from '../lib/letter';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import { toDogSlug } from '../lib/dogSlug';
import LetterCard from './LetterCard';

interface Props {
  savedProfile: SavedDogProfile;
  userId: string;
}

export default function LetterSection({ savedProfile, userId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const milestone = pickLetterMilestone(savedProfile);

  // No real Gotcha Day / birthday near — render nothing at all. The letter is
  // never offered for a date the owner didn't enter.
  if (!milestone) return null;

  const kindLabel = milestone.kind === 'gotcha' ? 'Gotcha Day' : 'birthday';
  const when = milestone.isActive
    ? 'today'
    : milestone.daysUntil === 1
      ? 'tomorrow'
      : `in ${milestone.daysUntil} days`;

  async function handleGenerate() {
    if (busy || !milestone) return;
    setBusy(true);
    setError(null);
    feedback.pop();
    trackEvent('letter_generate_click', { kind: milestone.kind });
    try {
      // pickLetterMilestone only ever returns gotcha/birthday, but Milestone's
      // kind is the wider MilestoneKind union — narrow it for the API.
      const result = await requestLetter(milestone.kind as LetterKind);
      setLetter(result);
      feedback.success();
      trackEvent('letter_generated', { kind: result.kind, sparse: result.sparse, cached: result.cached, model: result.model ?? 'unknown' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the letter. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing || !letter) return;
    setSharing(true);
    trackEvent('letter_share_click', { kind: letter.kind });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const publicUrl = `${origin}/d/${toDogSlug(dogName, userId)}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-${letter.kind}-letter.png`,
        {
          publicUrl,
          dogName,
          shareTitle: letter.occasion,
          shareText: `A letter from ${dogName} for ${kindLabel}. Written with AI from real moments on GoDoggyDate.`,
        },
      );
      feedback.success();
      trackEvent('letter_shared', { kind: letter.kind, method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          {milestone.emoji} {milestone.isActive ? `It's ${dogName}'s ${kindLabel}` : `${dogName}'s ${kindLabel} is ${when}`}
        </p>
        <h2 className="font-display text-xl text-brown leading-tight">💌 The {kindLabel} Letter</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          A warm keepsake letter from {dogName} for {milestone.kind === 'gotcha' ? 'the day they came home' : 'their birthday'} —
          written by AI from the real moments on their profile, never anything made up.
        </p>
      </div>

      {!letter && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="btn-primary w-full disabled:opacity-60"
        >
          {busy ? 'Writing the letter…' : `Write ${dogName}'s letter`}
        </button>
      )}

      {error && (
        <p className="mt-2 text-[13px] text-primary font-semibold text-center">{error}</p>
      )}

      {letter && (
        <>
          {/* On-screen reader: the full letter at natural size, never
              trimmed — the page scrolls it like any other content. */}
          <div className="mt-1 flex justify-center">
            <LetterCard
              variant="screen"
              salutation={letter.salutation}
              body={letter.body}
              signOff={letter.signOff}
              dogName={letter.dogName || dogName}
              occasion={letter.occasion}
              occasionSubtitle={letter.occasionSubtitle}
            />
          </div>

          {/* Capture node — the fixed 9:16 keepsake actually captured for
              sharing. Rendered off-screen, UNTRANSFORMED (a CSS transform
              here would make html2canvas export the transformed, smaller
              size — see LetterCard's header comment), so it never appears in
              the layout; only its pixels get captured. Mirrors the existing
              off-screen capture pattern at web/app/app/fun/snoot/page.tsx. */}
          <div style={{ position: 'absolute', left: -99999, top: 0 }} aria-hidden="true">
            <LetterCard
              ref={cardRef}
              variant="capture"
              salutation={letter.salutation}
              body={letter.body}
              signOff={letter.signOff}
              dogName={letter.dogName || dogName}
              occasion={letter.occasion}
              occasionSubtitle={letter.occasionSubtitle}
            />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-secondary w-full mt-3 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : `Share ${dogName}'s letter`}
          </button>

          {letter.sparse && (
            <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
              A shorter letter — add {dogName}&apos;s breed, temperament, and play style on your profile for a fuller one.
            </p>
          )}
          <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
            Written with AI in {dogName}&apos;s voice, grounded only in what you told us — nothing invented.
          </p>
        </>
      )}
    </section>
  );
}
