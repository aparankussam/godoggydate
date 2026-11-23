'use client';
// web/app/excuse/ExcuseClient.tsx
// Client half of the "Official Dog Excuse Note" toy. Owns all the interactive
// state and the share/download handler; the server shell (page.tsx) owns the
// SEO/OG metadata and just renders this. Behaviour is unchanged from when this
// lived in page.tsx — it reads nothing from Firestore, needs no auth, and works
// at N=0 users.
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
import ScaleToFit from '../../components/ScaleToFit';
import SiteFooter from '../../components/SiteFooter';
import { PawCoin } from '../../components/StickerBits';
import { shareOrDownloadCard } from '../../lib/shareCard';
import { buildExcuseNote, EXCUSE_REASONS } from '../../../shared/excuseNote';

export default function ExcuseClient() {
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
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-sky/95 backdrop-blur-md border-b-2 border-brown">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-[44px] items-center gap-2 font-display text-xl sm:text-2xl text-brown whitespace-nowrap"><PawCoin size={30} /> GoDoggyDate</Link>
          <Link href="/app" className="btn-secondary inline-flex min-h-[44px] items-center text-sm whitespace-nowrap px-4 py-2 sm:px-6">Sign up free</Link>
        </div>
      </nav>

      {/* Header */}
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-6 text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brown">
          The Dog Excuse Note
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-brown leading-tight">
          Let your dog get you out of it.
        </h1>
        <p className="mt-3 font-semibold text-brown">
          An official-looking (and unmistakably fake) note from your dog explaining why you
          simply cannot make it. No account needed.
        </p>
      </section>

      {/* Builder + preview */}
      <section className="max-w-4xl mx-auto px-6 pb-16 grid gap-8 grid-cols-1 md:grid-cols-2 items-start">
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
                className="mt-1 w-full rounded-xl border-2 border-brown bg-paper px-3 py-2.5 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-brown/40"
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
                className="mt-1 w-full rounded-xl border-2 border-brown bg-paper px-3 py-2.5 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-brown/40"
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
                className="mt-1 w-full rounded-xl border-2 border-brown bg-paper px-3 py-2.5 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-brown/40"
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
                        'flex min-h-[44px] items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition ' +
                        (active
                          ? 'border-brown bg-brown text-paper font-bold'
                          : 'border-brown bg-paper text-brown font-semibold hover:brightness-95')
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
          <ScaleToFit width={360}>
            <ExcuseNoteCard ref={cardRef} note={note} />
          </ScaleToFit>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-primary w-full mt-5 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : 'Share / download note'}
          </button>

          {done && (
            <p className="mt-2 text-sm font-bold text-brown text-center">
              {done === 'shared' ? 'Shared! 🐾' : 'Saved to your device 🐾'}
            </p>
          )}

          <p className="mt-3 text-xs font-semibold text-brown leading-snug text-center max-w-xs">
            It&apos;s a bit, obviously — the note is signed by a dog, stamped with a paw, and says
            right on it that it isn&apos;t a real document.
          </p>
        </div>
      </section>

      <SiteFooter note="A novelty note issued by a dog, for fun — not a real medical, legal, or employer document." />
    </main>
  );
}
