'use client';
// web/components/PackDayAttendeeCard.tsx
// A small dog card for someone going to a Pack Day: who you'll meet, in the
// owner's own words, and the same Report / Block as everywhere else. There is no
// event chat on purpose (members only message after a mutual match), so this is
// the whole "meet the pack" surface. Everything here is what the owner typed in;
// nothing is verified, and the card says so.

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import ReportProfileMenu from './ReportProfileMenu';
import { describeLimits } from '../../shared/utils/matchingEngine';
import { dogFactsLine } from '../lib/packDayAttendees';
import type { Attendee } from '../lib/packDayAttendees';

interface Props {
  attendee: Attendee;
  eventId: string;
  isHost: boolean;
  isYou: boolean;
  onClose: () => void;
  /** After a block went through: the page hides this dog's tile. */
  onBlocked: (uid: string) => void;
}

export default function PackDayAttendeeCard({ attendee, eventId, isHost, isYou, onClose, onBlocked }: Props) {
  const { dog } = attendee;
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  const facts = dogFactsLine(dog);
  const temperament = (dog.temperament ?? []).filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  const limits = describeLimits({ name: attendee.name, notGoodWith: dog.notGoodWith, behaviorFlags: dog.behaviorFlags });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pd-dog-card-name"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-t-[1.75rem] sm:rounded-[1.75rem] bg-white shadow-2xl"
      >
        {attendee.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attendee.photo} alt={`${attendee.name}`} className="h-56 w-full object-cover" />
        ) : (
          <div className="h-40 flex items-center justify-center text-6xl bg-cream-dark" aria-hidden="true">🐕</div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 rounded-full bg-white/85 text-lg text-brown shadow backdrop-blur-sm hover:bg-white"
          >
            ✕
          </button>
          {!isYou && (
            <ReportProfileMenu
              targetUserId={attendee.uid}
              eventId={eventId}
              onBlocked={() => {
                onBlocked(attendee.uid);
                onClose();
              }}
            />
          )}
        </div>

        <div className="space-y-4 px-5 pb-6 pt-4">
          <div>
            <h2 id="pd-dog-card-name" className="font-display text-2xl text-brown break-words">
              {attendee.founding ? '⭐ ' : ''}{attendee.name}
            </h2>
            {facts && <p className="mt-0.5 text-sm text-brown-mid break-words">{facts}</p>}
            {(isHost || isYou) && (
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                {isYou ? (isHost ? "You're hosting" : "That's you") : 'Hosting'}
              </p>
            )}
          </div>

          {temperament.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Temperament">
              {temperament.slice(0, 6).map((t) => (
                <li key={t} className="chip text-xs break-words">{t}</li>
              ))}
            </ul>
          )}

          <section aria-labelledby="pd-dog-card-limits">
            <h3 id="pd-dog-card-limits" className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light">
              What the owner shared
            </h3>
            {limits.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm text-brown list-disc pl-5">
                {limits.map((sentence) => <li key={sentence} className="break-words">{sentence}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-brown-mid">No limits or heads-ups listed.</p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-brown-light">
              This is what the owner typed in. GoDoggyDate doesn&apos;t verify dogs or owners. Read the{' '}
              <Link href="/playdate-safety" className="underline">first-meeting guide</Link>, and trust your gut at the park.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
