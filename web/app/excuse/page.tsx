'use client';
// web/app/excuse/page.tsx
// PUBLIC, no-signup "Official Dog Excuse Note" toy — the cheapest top-of-funnel
// on the site. Mirrors /quiz: fully client-side, reads nothing from Firestore,
// needs no auth, works at N=0 users. Four fields (dog name, your name, what
// you're cancelling, pick-a-reason) drive a deterministic live preview built by
// shared/excuseNote.ts, and one button shares/downloads it as a PNG through the
// same shareCard.ts path every other card uses.
//
// The note is a JOKE by construction (see shared/excuseNote.ts) and by
// presentation (see ExcuseNoteCard.tsx: "not a real doctor's note" ribbon, paw
// seal, plain-language disclaimer). It never imitates a real medical/employer
// document.
//
// SSR-safe: the only window/navigator access is inside the click handler.

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ExcuseNoteCard from '../../components/ExcuseNoteCard';
import { shareOrDownloadCard } from '../../lib/shareCard';
import { buildExcuseNote, EXCUSE_REASONS } from '../../../shared/excuseNote';

export default function ExcusePage() {
  const [dogName, setDogName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [event, setEvent] = useState('');
  const [reasonId, setReasonId] = useState(EXCUSE_REASONS[0].id);
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState<'shared' | 'downloaded' | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);

  const note = useMemo(
    () => buildExcuseNote({ dogName, ownerName, event, reasonId }),
    [dogName, ownerName, event, reasonId],
  );

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    setDone(null);
    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const safeDog = (dogName.trim() || 'dog').toLowerCase().replace(/\s+/g, '-');
      const result = await shareOrDownloadCard(cardRef.current, `${safeDog}-excuse-note.png`, {
        publicUrl: `${origin}/excuse`,
        dogName: dogName.trim() || undefined,
        shareTitle: 'An official note from my dog',
        shareText:
          "My dog wrote me an official excuse note and honestly the case is airtight. Make your dog's at godoggydate.com/excuse 🐾",
      });
      setDone(result);
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl text-brown">🐾 GoDoggyDate</Link>
          <Link href="/app" className="btn-secondary text-sm">Open the app</Link>
        </div>
      </nav>

      {/* Header */}
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brown-light">
          The Dog Excuse Note
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-brown leading-tight">
          Let your dog get you out of it.
        </h1>
        <p className="mt-3 text-brown-mid">
          An official-looking (and unmistakably fake) note from your dog explaining why you
          simply cannot make it. No account needed.
        </p>
      </section>

      {/* Builder + preview */}
      <section className="max-w-4xl mx-auto px-6 pb-16 grid gap-8 md:grid-cols-2 items-start">
        {/* Form */}
        <div className="card p-6">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-brown">Your dog&apos;s name</span>
              <input
                type="text"
                value={dogName}
                onChange={(e) => setDogName(e.target.value)}
                placeholder="Biscuit"
                maxLength={40}
                className="mt-1 w-full rounded-xl border border-border bg-cream px-3 py-2 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-brown">Your name</span>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Alex"
                maxLength={40}
                className="mt-1 w-full rounded-xl border border-border bg-cream px-3 py-2 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-brown">What are you getting out of?</span>
              <input
                type="text"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                placeholder="the 9am standup"
                maxLength={70}
                className="mt-1 w-full rounded-xl border border-border bg-cream px-3 py-2 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <div>
              <span className="text-sm font-bold text-brown">Pick your dog&apos;s reason</span>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXCUSE_REASONS.map((r) => {
                  const active = r.id === reasonId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setReasonId(r.id)}
                      className={
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ' +
                        (active
                          ? 'border-primary bg-primary/10 text-brown font-bold'
                          : 'border-border bg-cream text-brown-mid hover:border-primary/50')
                      }
                      aria-pressed={active}
                    >
                      <span aria-hidden="true">{r.emoji}</span>
                      <span className="leading-tight">{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Live preview + share */}
        <div className="flex flex-col items-center">
          <div className="flex justify-center">
            <ExcuseNoteCard ref={cardRef} note={note} />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-primary w-full mt-5 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : 'Share / download note'}
          </button>

          {done && (
            <p className="mt-2 text-sm text-brown-mid text-center">
              {done === 'shared' ? 'Shared! 🐾' : 'Saved to your device 🐾'}
            </p>
          )}

          <p className="mt-3 text-[11px] text-brown-light leading-snug text-center max-w-xs">
            It&apos;s a bit, obviously — the note is signed by a dog, stamped with a paw, and says
            right on it that it isn&apos;t a real document.
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-brown-light">
            © {new Date().getFullYear()} GoDoggyDate · A novelty note issued by a dog, for fun —
            not a real medical, legal, or employer document.
          </p>
        </div>
      </footer>
    </main>
  );
}
