'use client';
// web/components/TextsSection.tsx
// Profile-page surface for "Texts From Your Dog": the owner taps generate and
// gets a short, unhinged chat-bubble thread of messages their dog supposedly
// sent, on a shareable card. Openly labeled as imagined by AI — the dog cannot
// really text. Cadence is WEEKLY (enforced server-side); the copy sets that
// expectation so a throttle message doesn't feel like a bug.
//
// Grounded honestly: we always pass today's weekday as real "day context", plus
// an optional owner note (a walk, the vet trip, a treat). The server ignores any
// unsafe topic in that note; the note is untrusted and only riffed on.

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { requestDogTexts, type DogTexts } from '../lib/texts';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import TextsCard from './TextsCard';

interface Props {
  savedProfile: SavedDogProfile;
}

const NOTE_MAX_LEN = 160;

function weekdayContext(): string {
  try {
    const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    return `It's ${day}.`;
  } catch {
    return '';
  }
}

export default function TextsSection({ savedProfile }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');
  const [thread, setThread] = useState<DogTexts | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    feedback.pop();
    const trimmedNote = note.trim();
    const context = [weekdayContext(), trimmedNote].filter(Boolean).join(' ');
    trackEvent('texts_generate_click', { has_note: trimmedNote.length > 0 });
    try {
      const result = await requestDogTexts(context);
      setThread(result);
      feedback.success();
      trackEvent('texts_generated', { model: result.model ?? 'unknown', count: result.texts.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get the thread. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('texts_share_click', {});
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-texts.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `Texts from ${dogName}`,
          shareText: `${dogName} has some things to say. Make your dog's imagined text thread on GoDoggyDate.`,
        },
      );
      feedback.success();
      trackEvent('texts_shared', { method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  const remaining = NOTE_MAX_LEN - note.length;

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">💬 Texts From {dogName}</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          If {dogName} had a phone, it would be chaos. Get a short thread of the unhinged texts they
          fired off — a new one each week.
        </p>
      </div>

      <label htmlFor="texts-note" className="block text-xs font-bold text-brown mb-1.5">
        Anything going on today? <span className="font-normal text-brown-light">(optional)</span>
      </label>
      <input
        id="texts-note"
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LEN))}
        placeholder="A long walk. A squirrel. The mail came."
        className="w-full rounded-xl border border-border bg-cream px-3.5 py-2.5 text-sm text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="mt-1 flex items-center justify-between">
        <p className="text-[11px] text-brown-light">Imagined by AI — {dogName} cannot really text.</p>
        <p className="text-[11px] text-brown-light tabular-nums">{remaining}</p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className="btn-primary w-full mt-3 disabled:opacity-60"
      >
        {busy ? 'Reading the group chat…' : thread ? 'Get a new thread' : `See ${dogName}'s texts`}
      </button>

      {error && (
        <p className="mt-2 text-[13px] text-primary font-semibold text-center">{error}</p>
      )}

      {thread && (
        <>
          <div className="mt-4 flex justify-center">
            <TextsCard
              ref={cardRef}
              texts={thread.texts}
              dogName={thread.dogName || dogName}
            />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-secondary w-full mt-3 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : `Share ${dogName}'s texts`}
          </button>

          <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
            A playful thread imagined by AI in {dogName}&apos;s voice — {dogName} did not actually send these.
          </p>
        </>
      )}
    </section>
  );
}
