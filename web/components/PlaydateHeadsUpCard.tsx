'use client';
// web/components/PlaydateHeadsUpCard.tsx
// The pre-meetup briefing. Mounts in the chat thread once a playdate is
// confirmed and a date is still ahead.
//
// Why this exists: before this card, confirming a playdate told each owner
// nothing new about the other dog. The only safety copy in the thread was a
// single constant line about meeting in public, shown identically to every
// match from the first message onward. Meanwhile the profile form promises the
// owner, verbatim: "Only what you tell us here can warn another owner before a
// meetup." This card is the one place where BOTH owners get the same
// information, at the same time, and can go back and re-read it.
//
// It is open by default and short: four plain steps, the last being what the
// OTHER owner asked for, each declared limit once and in their name ("Moose's
// owner prefers no puppies"). It used to start collapsed ("Read"), speak in
// abstractions, and report "9 things to know" because a limit was counted once as
// a flag and again as a "crossing".
//
// HARD CONSTRAINT: there are exactly three real safety inputs here: behaviorFlags,
// notGoodWith and vaccinated. DogProfile also declares boundaries, allergies,
// specialNeeds and vetChecked, but shared/profile.ts's toFullProfile() hardcodes
// all four to empty/false for every real dog; no form on either platform collects
// them. Rendering a section for any of them would show a permanently empty block,
// or worse, print "not vet checked" as a claim about a dog nobody asked. Do not
// add a fourth field here without first confirming a form actually collects it.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { SavedDogProfile } from '../../shared/profile';
import { toFullProfile } from '../../shared/profile';
import { analyzeLimits, describeLimits } from '../../shared/utils/matchingEngine';
import { formatPlaydateWhen } from '../../shared/playdates';

interface Props {
  dogName: string;
  otherProfile: SavedDogProfile;
  myProfile: SavedDogProfile | null;
  playdate: { date: string; time?: string; place: string };
  /** The other owner's first name, from the match document (never from a public profile). */
  ownerFirstName?: string | null;
  /** Folded to its header for now (the message box has focus and the keyboard is up), without losing the open/closed choice. */
  compact?: boolean;
}

/** One declared limit, as the engine words it (owner-named), and whether the other dog trips it. */
export interface LimitLine {
  id: string;
  text: string;
  severity: 'caution' | 'note' | 'declared';
  /** Why it applies, e.g. "Waffles is small". */
  detail?: string;
}

/**
 * Every declared limit between two dogs, each once, split by whose it is. The same
 * analysis the Discover card and the compatibility score use (analyzeLimits), so
 * this card and the score cannot tell different stories. Without your own profile
 * (still loading) only the other owner's limits can be listed, and none are marked.
 */
export function playdateLimitLines(
  myProfile: SavedDogProfile | null,
  otherProfile: SavedDogProfile | null,
): { theirs: LimitLine[]; yours: LimitLine[] } {
  if (!otherProfile) return { theirs: [], yours: [] };
  if (!myProfile) {
    return {
      theirs: describeLimits(otherProfile).map((text, i) => ({ id: `theirs:${i}`, text, severity: 'declared' as const })),
      yours: [],
    };
  }
  const analysis = analyzeLimits(
    toFullProfile(myProfile, 'me'),
    toFullProfile(otherProfile, 'them'),
    { viewerAll: true },
  );
  const line = (i: (typeof analysis.items)[number]): LimitLine => ({ id: i.id, text: i.text, severity: i.severity, detail: i.detail });
  return {
    theirs: analysis.items.filter((i) => i.side === 'theirs').map(line),
    yours: analysis.items.filter((i) => i.side === 'yours').map(line),
  };
}

/**
 * The limits that CROSS between these two dogs (either owner's, tripped by the
 * other dog): what the "before you accept" sheet lists. Empty means nothing to warn about.
 */
export function playdateConflicts(
  myProfile: SavedDogProfile | null,
  otherProfile: SavedDogProfile | null,
): LimitLine[] {
  const { theirs, yours } = playdateLimitLines(myProfile, otherProfile);
  return [...theirs, ...yours].filter((l) => l.severity === 'caution');
}

export default function PlaydateHeadsUpCard({ dogName, otherProfile, myProfile, playdate, ownerFirstName, compact = false }: Props) {
  const [openChoice, setOpen] = useState(true);
  const open = openChoice && !compact;

  const { theirs: theirLimits, yours: myLimits } = useMemo(
    () => playdateLimitLines(myProfile, otherProfile),
    [myProfile, otherProfile],
  );
  const unvaccinated = otherProfile.vaccinated === false;
  const flagged = theirLimits.length > 0 || unvaccinated;

  const whenWhere = `${formatPlaydateWhen(playdate)} · ${playdate.place}`;

  return (
    <section
      aria-label={`Before you meet ${dogName}`}
      className="shrink-0 border-t border-border bg-white px-4 py-3 w-full lg:max-w-3xl lg:mx-auto"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-[40px] w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0 text-sm font-bold text-brown [overflow-wrap:anywhere]">
          {flagged ? '⚠️' : '🐾'} Before you meet {dogName}
          {ownerFirstName && <>{' '}<span className="font-semibold text-brown-light">· with <bdi>{ownerFirstName}</bdi></span></>}
        </span>
        <span className="shrink-0 text-xs font-bold text-rose">
          {open ? 'Hide' : 'Show'} {open ? '↑' : '↓'}
        </span>
      </button>

      {open && (
        // Capped and scrollable: on a phone the thread must keep room to breathe
        // and the message box must stay on screen.
        <div className="mt-1 max-h-[30dvh] space-y-2 overflow-y-auto">
          <p className="text-xs font-semibold text-brown-light [overflow-wrap:anywhere]">{whenWhere}</p>

          <ul className="space-y-1.5 text-sm leading-snug text-brown">
            <li className="flex gap-2"><span aria-hidden="true" className="text-rose">✓</span>Meet somewhere public, like a dog park.</li>
            <li className="flex gap-2"><span aria-hidden="true" className="text-rose">✓</span>Keep leashes on until both dogs are calm.</li>
            <li className="flex gap-2"><span aria-hidden="true" className="text-rose">✓</span>Introduce them slowly. A short sniff first, then see how it goes.</li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-rose">✓</span>
              <div className="min-w-0 flex-1">
                {flagged ? (
                  <>
                    <span className="font-semibold">What the other owner asked for:</span>
                    <ul className="mt-1 space-y-1">
                      {theirLimits.map((limit) => (
                        <li
                          key={limit.id}
                          className={`rounded-xl px-2.5 py-1.5 text-[13px] leading-snug [overflow-wrap:anywhere] ${
                            limit.severity === 'caution'
                              ? 'border border-amber-300 bg-amber-50 font-semibold text-amber-950'
                              : 'bg-cream text-brown'
                          }`}
                        >
                          {limit.text}
                          {limit.severity === 'caution' && limit.detail && (
                            <span className="font-normal">. {limit.detail}.</span>
                          )}
                        </li>
                      ))}
                      {unvaccinated && (
                        <li className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[13px] font-semibold leading-snug text-amber-950 [overflow-wrap:anywhere]">
                          {dogName}&apos;s owner marked {dogName} as not currently vaccinated.
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">What the other owner asked for:</span>{' '}
                    <span className="text-brown-light">
                      nothing. That means nothing was flagged, not that anything was checked.
                    </span>
                  </>
                )}
              </div>
            </li>
          </ul>

          {/* The mirror: what the other owner can see about your dog. It's what
              makes the card a mutual disclosure rather than a dossier. */}
          <div className="rounded-xl bg-cream px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brown-light">
              What {dogName}&apos;s owner sees about {myProfile?.name ?? 'your dog'}
            </p>
            {myLimits.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-brown">
                {myLimits.map((limit) => (
                  <li key={limit.id} className={`[overflow-wrap:anywhere] ${limit.severity === 'caution' ? 'font-semibold text-amber-950' : ''}`}>
                    {limit.text}
                    {limit.severity === 'caution' && limit.detail && <span className="font-normal">. {limit.detail}.</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] leading-snug text-brown-light">
                You haven&apos;t declared any limits.{' '}
                <Link href="/app/profile" className="font-semibold text-rose underline underline-offset-2">
                  Add them to your profile
                </Link>
                {' '}so the other owner is warned before you meet.
              </p>
            )}
          </div>

          <p className="text-xs leading-relaxed text-brown-light">
            This is what each owner typed about their own dog. GoDoggyDate doesn&apos;t verify any of it.
          </p>
          <Link
            href="/playdate-safety"
            className="flex min-h-[40px] items-center text-xs font-semibold text-rose underline underline-offset-2"
          >
            How to run a first meeting →
          </Link>
        </div>
      )}
    </section>
  );
}
