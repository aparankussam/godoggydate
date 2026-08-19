'use client';
// web/components/RoastSection.tsx
// Profile-page surface for "Roast My Dog (Certified Affectionate)": the owner
// taps once, and the server roasts their own dog — grounded ONLY on the traits
// already on file (breed, Dogtype, age, energy, play styles), with no free-text
// input to fill in. Out comes a 9:16 comedy-club poster: three loving roast
// lines and one warm closing compliment they can share. Openly labeled as AI
// comedy — every jab is affectionate, and it never touches weight, a rescue
// past, or health.

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { requestRoast, type Roast } from '../lib/roast';
import { shareOrDownloadStoryCard } from './StoryShareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import RoastCard from './RoastCard';

interface Props {
  savedProfile: SavedDogProfile;
}

export default function RoastSection({ savedProfile }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [roast, setRoast] = useState<Roast | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    feedback.pop();
    trackEvent('roast_generate_click', {});
    try {
      const result = await requestRoast();
      setRoast(result);
      feedback.success();
      trackEvent('roast_generated', { model: result.model ?? 'unknown' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the roast. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('roast_share_click', {});
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadStoryCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-roast.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `Roasting ${dogName}`,
          shareText: `I let the internet roast ${dogName} (affectionately). Roast your dog on GoDoggyDate.`,
        },
      );
      feedback.success();
      trackEvent('roast_shared', { method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">🎤 Roast {dogName}</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          A certified <em>affectionate</em> roast: three loving jabs at {dogName}&apos;s zoomies, drama, and nap
          schedule, then one warm compliment to land it. Built only from {dogName}&apos;s own profile — never a word
          about their body, past, or health.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className="btn-primary w-full disabled:opacity-60"
      >
        {busy ? 'Warming up the mic…' : roast ? `Roast ${dogName} again` : `Roast ${dogName}`}
      </button>

      <p className="mt-2 text-[11px] text-brown-light text-center leading-snug">
        Written by AI, all in good fun. A few fresh sets a day — then the club rests.
      </p>

      {error && (
        <p className="mt-2 text-[13px] text-primary font-semibold text-center">{error}</p>
      )}

      {roast && (
        <>
          <div className="mt-4 flex justify-center">
            <RoastCard
              ref={cardRef}
              dogName={roast.dogName || dogName}
              lines={roast.lines}
              compliment={roast.compliment}
            />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-secondary w-full mt-3 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : `Share ${dogName}'s roast`}
          </button>

          <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
            A playful roast written by AI — every line is affectionate, and {dogName} is a very good dog.
          </p>
        </>
      )}
    </section>
  );
}
