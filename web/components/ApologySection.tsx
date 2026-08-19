'use client';
// web/components/ApologySection.tsx
// Profile-page surface for the "Notes-App Apology": the owner types what their
// dog did, taps generate, and gets a formal celebrity-style non-apology in the
// dog's own voice on a notes-app card they can share. Openly labeled as AI, in
// the dog's voice — it's a joke, not a real statement.

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { requestApology, type Apology } from '../lib/apology';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import ApologyCard from './ApologyCard';

interface Props {
  savedProfile: SavedDogProfile;
}

const CRIME_MAX_LEN = 280;

function formatToday(): string {
  try {
    return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ApologySection({ savedProfile }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [crime, setCrime] = useState('');
  const [apology, setApology] = useState<Apology | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  async function handleGenerate() {
    const trimmed = crime.trim();
    if (busy || !trimmed) return;
    setBusy(true);
    setError(null);
    feedback.pop();
    trackEvent('apology_generate_click', { crime_len: trimmed.length });
    try {
      const result = await requestApology(trimmed);
      setApology(result);
      setDateLabel(formatToday());
      feedback.success();
      trackEvent('apology_generated', { model: result.model ?? 'unknown' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the statement. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('apology_share_click', {});
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-apology.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `A statement from ${dogName}`,
          shareText: `${dogName} would like to issue a statement. Make your dog's notes-app apology on GoDoggyDate.`,
        },
      );
      feedback.success();
      trackEvent('apology_shared', { method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  const remaining = CRIME_MAX_LEN - crime.length;

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">📝 {dogName}&apos;s Notes-App Apology</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          The celebrity non-apology, but it&apos;s a dog. Tell us what they did — {dogName} will issue a formal
          statement taking absolutely no responsibility.
        </p>
      </div>

      <label htmlFor="apology-crime" className="block text-xs font-bold text-brown mb-1.5">
        What did they do?
      </label>
      <textarea
        id="apology-crime"
        value={crime}
        onChange={(e) => setCrime(e.target.value.slice(0, CRIME_MAX_LEN))}
        placeholder="Ate an entire couch cushion. Again."
        rows={2}
        className="w-full rounded-xl border border-border bg-cream px-3.5 py-2.5 text-sm text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
      />
      <div className="mt-1 flex items-center justify-between">
        <p className="text-[11px] text-brown-light">Written by AI, in {dogName}&apos;s voice.</p>
        <p className="text-[11px] text-brown-light tabular-nums">{remaining}</p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy || !crime.trim()}
        className="btn-primary w-full mt-3 disabled:opacity-60"
      >
        {busy ? 'Drafting the statement…' : apology ? 'Write another statement' : `Get ${dogName}'s statement`}
      </button>

      {error && (
        <p className="mt-2 text-[13px] text-primary font-semibold text-center">{error}</p>
      )}

      {apology && (
        <>
          <div className="mt-4 flex justify-center">
            <ApologyCard
              ref={cardRef}
              statement={apology.statement}
              signOff={apology.signOff}
              dogName={apology.dogName || dogName}
              dateLabel={dateLabel}
            />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-secondary w-full mt-3 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : `Share ${dogName}'s statement`}
          </button>

          <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
            A playful statement written by AI in {dogName}&apos;s voice — not a real apology, and {dogName} means
            none of it.
          </p>
        </>
      )}
    </section>
  );
}
