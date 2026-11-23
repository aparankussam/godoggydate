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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brown/50 sm:px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pd-dog-card-name"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-t-[1.75rem] sm:rounded-[1.75rem] bg-cream border-[2.5px] border-brown shadow-2xl"
      >
        {attendee.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attendee.photo} alt={`${attendee.name}`} className="h-56 w-full object-cover" />
        ) : (
          <div className="h-40 flex items-center justify-center bg-note text-brown" aria-hidden="true"><svg width="72" height="72" viewBox="0 0 24 24"><ellipse cx="4.9" cy="10.5" rx="3.1" ry="5.6" transform="rotate(16 4.9 10.5)" fill="currentColor" /><ellipse cx="19.1" cy="10.5" rx="3.1" ry="5.6" transform="rotate(-16 19.1 10.5)" fill="currentColor" /><ellipse cx="12" cy="12.5" rx="7.3" ry="8" fill="currentColor" /><circle cx="9.2" cy="10.8" r="1.25" fill="#DCEEFB" /><circle cx="14.8" cy="10.8" r="1.25" fill="#DCEEFB" /><ellipse cx="12" cy="15.8" rx="3.6" ry="2.9" fill="#DCEEFB" /><ellipse cx="12" cy="14.9" rx="1.6" ry="1.15" fill="currentColor" /></svg></div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 rounded-full border-2 border-brown bg-cream text-lg font-black text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
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
            {facts && <p className="mt-0.5 text-[15px] font-extrabold text-brown-mid break-words">{facts}</p>}
            {(isHost || isYou) && (
              <p className="mt-1 text-[13px] font-black text-brown">
                {isYou ? (isHost ? "You're hosting" : "That's you") : 'Hosting'}
              </p>
            )}
          </div>

          {temperament.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Temperament">
              {temperament.slice(0, 6).map((t) => (
                <li key={t} className="chip !text-[13px] break-words">{t}</li>
              ))}
            </ul>
          )}

          <section aria-labelledby="pd-dog-card-limits">
            <h3 id="pd-dog-card-limits" className="text-[15px] font-black text-brown">
              What the owner shared
            </h3>
            {limits.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-[15px] font-extrabold text-brown list-disc pl-5">
                {limits.map((sentence) => <li key={sentence} className="break-words">{sentence}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-[15px] font-extrabold text-brown-mid">No limits or heads-ups listed.</p>
            )}
            <p className="mt-3 text-[13px] font-extrabold leading-snug text-brown-mid">
              This is what the owner typed in. GoDoggyDate doesn&apos;t verify dogs or owners. Read the{' '}
              <Link href="/playdate-safety" className="font-black text-brown underline decoration-2 underline-offset-2">first-meeting guide</Link>, and trust your gut at the park.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
