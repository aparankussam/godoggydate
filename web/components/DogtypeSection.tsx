'use client';
// web/components/DogtypeSection.tsx
// Profile-page surface for Dogtype: computes the dog's deterministic type from
// its own profile, renders the shareable card, explains the four real axes it
// was read from, and offers a playful "plays well with" line (clearly a vibe,
// not a measured score — real compatibility comes from the swipe engine).

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto, resolveHeroIndex, getHeroFocus } from '../lib/photos';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import DogtypeCard from './DogtypeCard';
import StoryShareCard, { shareOrDownloadStoryCard } from './StoryShareCard';
import DogtypeReveal from './DogtypeReveal';
import { feedback } from '../lib/feedback';
import { computeDogtype } from '../../shared/dogtype';
import CompatExplorer from './CompatExplorer';

interface Props {
  savedProfile: SavedDogProfile;
  userId: string;
}

export default function DogtypeSection({ savedProfile, userId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [sharingStory, setSharingStory] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showReveal, setShowReveal] = useState(false);

  const dogtype = computeDogtype(savedProfile);
  if (!dogtype) return null;

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile));
  const photoFocus = getHeroFocus(savedProfile);
  const storyTheme = dogtype.axes[0]?.pole.label === 'Zen' ? 'zen' : 'spark';

  async function handleStoryShare() {
    if (!storyRef.current || sharingStory || !dogtype) return;
    setSharingStory(true);
    trackEvent('story_share_click', { feature: 'dogtype', code: dogtype.code });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadStoryCard(
        storyRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype-story.png`,
        {
          publicUrl: `${origin}/dogtype/${dogtype.code}`,
          dogName,
          shareText: `${dogName} is ${dogtype.name} ${dogtype.emoji} on GoDoggyDate. What's your dog's Dogtype?`,
        },
      );
      feedback.success();
      trackEvent('story_shared', { feature: 'dogtype', method: result });
    } catch {
      /* non-critical */
    } finally {
      setSharingStory(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('dogtype_share_click', { code: dogtype.code });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const publicUrl = `${origin}/dogtype/${dogtype.code}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype.png`,
        {
          publicUrl,
          dogName,
          shareTitle: `${dogName} is ${dogtype.name}`,
          shareText: `${dogName} is ${dogtype.name} ${dogtype.emoji} on GoDoggyDate. What's your dog's Dogtype?`,
        },
      );
      feedback.success();
      trackEvent('dogtype_shared', { code: dogtype.code, method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 to-primary/5 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Dogtype</p>
        <h2 className="font-display text-xl text-brown leading-tight">
          {dogtype.emoji} {dogtype.name}
        </h2>
      </div>

      <p className="text-sm text-brown-mid leading-relaxed">{dogtype.blurb}</p>

      {/* Trait chips — the warm, self-explanatory read of the four axes that
          leads in place of the old 4-letter code. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {dogtype.axes.map((a) => (
          <span
            key={a.key}
            className="inline-flex items-center gap-1 rounded-full bg-cream border border-border px-2.5 py-1 text-xs font-semibold text-brown"
          >
            <span aria-hidden="true">{a.pole.emoji}</span> {a.pole.label}
          </span>
        ))}
      </div>

      {/* The card itself (this is what gets captured to PNG) */}
      <div className="mt-4 flex justify-center">
        <div className="scale-[0.82] origin-top -mb-12">
          <DogtypeCard dogtype={dogtype} dogName={dogName} photoUrl={photo ?? undefined} photoFocus={photoFocus} innerRef={cardRef} />
        </div>
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="btn-primary w-full mt-2 disabled:opacity-60"
      >
        {sharing ? 'Preparing…' : `Share ${dogName}'s Dogtype`}
      </button>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleStoryShare}
          disabled={sharingStory}
          className="btn-secondary flex-1 disabled:opacity-60"
        >
          {sharingStory ? 'Preparing…' : '📱 Share as Story'}
        </button>
        <button
          type="button"
          onClick={() => { feedback.pop(); setShowReveal(true); }}
          className="btn-secondary flex-1"
        >
          ▶ Replay reveal
        </button>
      </div>

      {/* "Who does your dog get along with?" — tap-to-reveal explorer with a
          real, widened-scope density count (replaces the old static list). */}
      <CompatExplorer savedProfile={savedProfile} userId={userId} />

      {/* How the type was read — the four real axes */}
      <button
        type="button"
        onClick={() => setShowAxes((v) => !v)}
        className="mt-3 text-xs font-bold text-primary underline underline-offset-2"
      >
        {showAxes ? 'Hide the read' : 'How we read this'}
      </button>
      {showAxes && (
        <div className="mt-2 space-y-2">
          {dogtype.axes.map((a) => (
            <div key={a.key} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wide text-brown-light">
                {a.axis}
              </span>
              <span className="font-semibold text-brown">
                {a.pole.emoji} {a.pole.label}
              </span>
              <span className="text-brown-light text-xs">over {a.other.label}</span>
            </div>
          ))}
          <p className="text-[11px] text-brown-light leading-snug">
            Read from what you told us — energy, play style, sociability, and temperament. It never changes on
            its own; update the profile and it updates with you. A playful identity, not a clinical test.
          </p>
        </div>
      )}

      {/* Off-screen 9:16 story card — rendered for html2canvas capture only. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden="true">
        <StoryShareCard
          innerRef={storyRef}
          kicker="Dogtype"
          headline={`${dogName} is ${dogtype.name}`}
          subtext={dogtype.tagline}
          chips={dogtype.axes.map((a) => ({ emoji: a.pole.emoji, label: a.pole.label }))}
          emoji={dogtype.emoji}
          photoUrl={photo ?? undefined}
          photoFocus={photoFocus}
          theme={storyTheme}
        />
      </div>

      {/* Replayable animated reveal overlay */}
      {showReveal && (
        <DogtypeReveal dogtype={dogtype} dogName={dogName} onDone={() => setShowReveal(false)} />
      )}
    </section>
  );
}
