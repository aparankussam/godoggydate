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
// meetup." For four of the behaviour flags that promise was kept by no code
// path at all — nothing read them, anywhere.
//
// It also fixes an asymmetry: MatchModal's warnings only ever render for
// whoever swiped SECOND. The first swiper never saw a safety warning at any
// point. This card is the only surface where BOTH owners get the same
// information, at the same time, and can go back and re-read it.
//
// HARD CONSTRAINT — there are exactly three real safety inputs here:
// behaviorFlags, notGoodWith, and vaccinated. DogProfile also declares
// boundaries, allergies, specialNeeds and vetChecked, but shared/profile.ts's
// toFullProfile() hardcodes all four to empty/false for every real dog — no
// form on either platform collects them. Rendering a section for any of them
// would show a permanently empty block, or worse, print "not vet checked" as a
// claim about a dog nobody ever asked. Do not add a fourth field here without
// first confirming a form actually collects it.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { SavedDogProfile } from '../../shared/profile';
import { toFullProfile } from '../../shared/profile';
import { detectUnsafePairings } from '../../shared/utils/matchingEngine';

interface Props {
  dogName: string;
  otherProfile: SavedDogProfile;
  myProfile: SavedDogProfile | null;
  playdate: { date: string; time?: string; place: string };
}

// Verbatim, in the owner's own selected words — quoting the chip they tapped is
// quoting them. But the two lists must stay LABELLED SEPARATELY: a notGoodWith
// value is a bare noun ("small dogs", "puppies"), so under a neutral heading it
// reads as a preference FOR that thing rather than against it.
function declaredFlags(p: SavedDogProfile | null): string[] {
  return p?.behaviorFlags ?? [];
}
function declaredNotGoodWith(p: SavedDogProfile | null): string[] {
  return p?.notGoodWith ?? [];
}
function declaredCount(p: SavedDogProfile | null): number {
  return declaredFlags(p).length + declaredNotGoodWith(p).length;
}

export default function PlaydateHeadsUpCard({ dogName, otherProfile, myProfile, playdate }: Props) {
  const [open, setOpen] = useState(false);

  const crossings = useMemo(() => {
    if (!myProfile) return [];
    const mine = toFullProfile(myProfile, 'me');
    const theirs = toFullProfile(otherProfile, 'them');
    // Both directions, deduped — the same union calculateCompatibility() scores
    // from, so the card and the score can never tell different stories.
    return [...new Set([
      ...detectUnsafePairings(mine, theirs),
      ...detectUnsafePairings(theirs, mine),
    ])];
  }, [myProfile, otherProfile]);

  const theirFlags = declaredFlags(otherProfile);
  const theirNotGoodWith = declaredNotGoodWith(otherProfile);
  const myFlags = declaredFlags(myProfile);
  const myNotGoodWith = declaredNotGoodWith(myProfile);
  const unvaccinated = otherProfile.vaccinated === false;

  const itemCount = crossings.length + declaredCount(otherProfile) + (unvaccinated ? 1 : 0);

  const whenWhere = `${playdate.date}${playdate.time ? ` at ${playdate.time}` : ''} · ${playdate.place}`;

  return (
    <div className="shrink-0 border-t border-border bg-white px-4 py-3 w-full lg:max-w-3xl lg:mx-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-bold text-brown">
          {itemCount > 0 ? '⚠️' : '🐾'} Before you meet {dogName}
          {itemCount > 0 && (
            <span className="ml-1.5 font-semibold text-brown-light">
              · {itemCount} {itemCount === 1 ? 'thing' : 'things'} to know
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">
          {open ? 'Hide' : 'Read'} {open ? '↑' : '↓'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs font-semibold text-brown-light">{whenWhere}</p>

          {/* What crosses between these two specific dogs. */}
          {crossings.length > 0 && (
            <div className="rounded-[1.25rem] border border-amber-300 bg-amber-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
                Where your two dogs cross
              </p>
              <ul className="mt-1.5 space-y-1">
                {crossings.map((c) => (
                  <li key={c} className="text-sm leading-relaxed text-amber-950">• {c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Their declarations, verbatim, under headings that make the polarity
              unambiguous. */}
          {theirFlags.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brown-light">
                {dogName}&apos;s owner flagged
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {theirFlags.map((item) => (
                  <span key={item} className="chip text-xs">{item}</span>
                ))}
              </div>
            </div>
          )}
          {theirNotGoodWith.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brown-light">
                {dogName} is <span className="text-amber-700">not good with</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {theirNotGoodWith.map((item) => (
                  <span key={item} className="chip border-amber-300 bg-amber-50 text-xs text-amber-950">
                    🚫 {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* vaccinated is a checkbox that defaults to true, so only an explicit
              false is information. true tells us nothing and is not rendered. */}
          {unvaccinated && (
            <p className="rounded-[1.25rem] border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-relaxed text-amber-950">
              {dogName}&apos;s owner marked them as not currently vaccinated.
            </p>
          )}

          {itemCount === 0 && (
            <p className="text-sm leading-relaxed text-brown-light">
              Neither owner declared anything that crosses. That means nothing was
              flagged — not that anything was checked.
            </p>
          )}

          {/* The mirror. This is what makes the card a mutual disclosure rather
              than a dossier, and it's the only place an owner sees the
              consequence of the Safety section they may have skipped. */}
          <div className="rounded-[1.25rem] bg-cream px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brown-light">
              What they can see about {myProfile?.name ?? 'your dog'}
            </p>
            {declaredCount(myProfile) > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {myFlags.map((item) => (
                  <span key={item} className="chip text-xs">{item}</span>
                ))}
                {myNotGoodWith.map((item) => (
                  <span key={item} className="chip border-amber-300 bg-amber-50 text-xs text-amber-950">
                    🚫 {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-brown-light">
                You haven&apos;t declared anything.{' '}
                <Link href="/app/profile" className="font-semibold text-primary underline underline-offset-2">
                  Add it to your profile
                </Link>{' '}
                — it&apos;s the only thing that can warn them before you meet.
              </p>
            )}
          </div>

          <p className="text-xs leading-relaxed text-brown-light">
            All of this is what each owner typed about their own dog. GoDoggyDate
            doesn&apos;t verify any of it.{' '}
            <Link href="/playdate-safety" className="font-semibold text-primary underline underline-offset-2">
              How to run a first meeting →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
