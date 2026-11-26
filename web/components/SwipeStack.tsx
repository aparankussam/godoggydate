'use client';
import { formatUsMonthYear } from '../../shared/dates';
// web/components/SwipeStack.tsx

import { useState, useCallback, useEffect, useRef } from 'react';
import SwipeCard, { type SwipeCardHandle } from './SwipeCard';
import CompatBreakdown from './CompatBreakdown';
import ReportProfileMenu from './ReportProfileMenu';
import { breedConfidencePhrase } from '../lib/vibeCheck';
import { getRenderablePhotos } from '../lib/photos';
import { trackEvent, trackFirstTime } from '../lib/analytics';
import { recordSwipe } from '../lib/matching';
import { ageLabel, recordDemoSwipeLocally, rememberSwipe, sexLabel, sizeLabel } from '../lib/discover';
import { formatDistanceMiles } from '../../shared/utils/matchingEngine';
import { LimitsBlock } from './OwnerLimits';
import { plain, FitSticker, PawIcon, PlaceTicket, Tape, fitTone, vaccinationLine } from './DiscoverBits';
import type { CompatibilityResult, DogProfile } from '../../shared/types';
import { uniqueTemperament } from '../../shared/temperament';
import { dogAboutText } from '../../shared/dogLabels';

interface FeedDog {
  id: string;
  name: string;
  createdAt?: number;
  breed: string;
  age: string;
  sex: string;
  size: string;
  energyLevel: number;
  photos?: string[];
  vaccinated?: boolean | null;
  rabiesExpiry?: string;
  temperament?: string[];
  playStyles?: string[];
  location?: string;
  prompts?: { prompt: string; answer: string }[];
  ai?: DogProfile['ai'];
  distanceMiles: number;
  locality?: 'near' | 'city' | 'state';
  compat: CompatibilityResult;
  firestoreId?: string;
  ownerId?: string;
  isDemo?: boolean;
}

interface Props {
  dogs: FeedDog[];
  currentUserId: string;
  currentDogId: string;
  onMatch: (dog: FeedDog, matchId: string) => void;
  onEmpty: () => void;
  isGuest?: boolean;
  onRequireAuthForLike?: () => void;
}

export default function SwipeStack({
  dogs,
  currentUserId,
  currentDogId,
  onMatch,
  onEmpty,
  isGuest = false,
  onRequireAuthForLike,
}: Props) {
  const [index, setIndex] = useState(0);
  const [selectedDog, setSelectedDog] = useState<FeedDog | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [swipeError, setSwipeError] = useState<string | null>(null);

  const topCardRef = useRef<SwipeCardHandle | null>(null);
  const detailsBackRef = useRef<HTMLButtonElement | null>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement | null>(null);

  function formatMemberSince(timestamp: number | undefined): string | null {
    if (!timestamp || !Number.isFinite(timestamp)) return null;
    return formatUsMonthYear(new Date(timestamp));
  }

  // A refreshed deck (window focus, "Check again") keeps the card you're on, and
  // the details sheet if it's open, as long as that dog is still in the feed.
  // It used to jump back to the first card and close the sheet every time.
  const prevDeckRef = useRef({ dogs, index });
  useEffect(() => {
    const keyOf = (d?: FeedDog) => (d ? (d.firestoreId ?? d.id) : null);
    const prev = prevDeckRef.current;
    const topKey = keyOf(prev.dogs[prev.index]);
    const keptAt = topKey ? dogs.findIndex((d) => keyOf(d) === topKey) : -1;
    setIndex(keptAt >= 0 ? keptAt : 0);
    setSelectedDog((cur) => (cur && dogs.some((d) => keyOf(d) === keyOf(cur)) ? cur : null));
  }, [dogs]);
  useEffect(() => {
    prevDeckRef.current = { dogs, index };
  });

  useEffect(() => {
    setSelectedPhotoIndex(0);
    setShowBreakdown(false);
  }, [selectedDog?.firestoreId, selectedDog?.id]);

  // Escape closes the details sheet.
  const sheetOpen = selectedDog !== null;
  useEffect(() => {
    if (!sheetOpen) return;
    detailsBackRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedDog(null); };
    document.addEventListener('keydown', onKey);
    const trigger = detailsTriggerRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      // Hand focus back to the Details button so keyboard users land where they were.
      trigger?.focus();
    };
  }, [sheetOpen]);

  // Calling onEmpty() from inside this updater set the PARENT's state while React
  // was rendering SwipeStack (a console error on every last swipe); the "ran out
  // of dogs" signal now comes from the effect below.
  const advance = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;
  useEffect(() => {
    if (dogs.length > 0 && index >= dogs.length) onEmptyRef.current();
  }, [index, dogs.length]);

  const handleLike = useCallback(
    async (dog: FeedDog) => {
      if (isGuest) {
        advance();
        trackEvent('guest_like_requires_auth', {
          dog_id: dog.firestoreId ?? dog.id,
        });
        onRequireAuthForLike?.();
        return false;
      }

      advance();
      trackEvent('swipe_action', {
        action: 'like',
        dog_id: dog.firestoreId ?? dog.id,
        compatibility_score: dog.compat.score,
        is_demo: Boolean(dog.isDemo),
      });
      // Once per account (not per session): the activation funnel counts the first
      // swipe ever, not one per visit.
      trackFirstTime(currentUserId, 'first_swipe', 'first_swipe', { action: 'like' });
      // Keeps the dog out of the deck for this session without re-reading history.
      if (!dog.isDemo) rememberSwipe(currentUserId, dog.ownerId ?? dog.id);

      // Demo/seed profiles exist only to preview the feed — they have no
      // owning account, so a like can never become a match. Skip the write
      // but remember it locally so the demo dog doesn't reappear on reload.
      if (dog.isDemo) {
        recordDemoSwipeLocally(dog.firestoreId ?? dog.id);
        setSwipeError(`${dog.name} is a demo profile — real dogs near you can match back!`);
        setTimeout(() => setSwipeError(null), 3500);
        return true;
      }

      try {
        const result = await recordSwipe({
          currentUserId,
          currentDogId,
          targetUserId: dog.ownerId ?? dog.id,
          targetDogId: dog.firestoreId ?? dog.id,
          action: 'like',
        });

        if (result.isMatch && result.matchId) {
          onMatch(dog, result.matchId);
        }
      } catch (err) {
        console.warn('Swipe write failed:', err);
        setSwipeError('That like didn’t save — check your connection and try again.');
        setTimeout(() => setSwipeError(null), 4000);
      }

      return true;
    },
    [advance, currentUserId, currentDogId, isGuest, onMatch, onRequireAuthForLike]
  );

  const handlePass = useCallback(
    async (dog: FeedDog) => {
      if (isGuest) {
        advance();
        trackEvent('swipe_action', {
          action: 'pass',
          guest: true,
          dog_id: dog.firestoreId ?? dog.id,
        });
        return true;
      }

      advance();
      trackEvent('swipe_action', {
        action: 'pass',
        dog_id: dog.firestoreId ?? dog.id,
        compatibility_score: dog.compat.score,
      });
      trackFirstTime(currentUserId, 'first_swipe', 'first_swipe', { action: 'pass' });
      if (!dog.isDemo) rememberSwipe(currentUserId, dog.ownerId ?? dog.id);

      if (dog.isDemo) {
        recordDemoSwipeLocally(dog.firestoreId ?? dog.id);
        return true;
      }

      try {
        await recordSwipe({
          currentUserId,
          currentDogId,
          targetUserId: dog.ownerId ?? dog.id,
          targetDogId: dog.firestoreId ?? dog.id,
          action: 'pass',
        });
      } catch {
        // non-blocking
      }

      return true;
    },
    [advance, currentUserId, currentDogId, isGuest]
  );

  const activeDog = dogs[index];
  const peekDog   = dogs[index + 1];

  const triggerButtonAction = useCallback((direction: 'left' | 'right') => {
    if (isGuest && direction === 'right') {
      onRequireAuthForLike?.();
      return;
    }
    topCardRef.current?.triggerSwipe(direction, { immediate: true });
  }, [isGuest, onRequireAuthForLike]);

  if (!activeDog) return null;

  // The details sheet's "Woof!": closes the sheet and likes, through the same
  // path as the WOOF button (so guests get the sign-in prompt). The sheet only
  // opens for the top card, but only ever like the dog it was showing.
  const likeFromDetails = () => {
    const dog = selectedDog;
    setSelectedDog(null);
    if (!dog || (dog.firestoreId ?? dog.id) !== (activeDog.firestoreId ?? activeDog.id)) return;
    triggerButtonAction('right');
  };

  // Blocking from the details sheet: close it and pass the card, as the card's
  // own Report menu does.
  const blockedFromDetails = () => {
    const dog = selectedDog;
    setSelectedDog(null);
    if (!dog || (dog.firestoreId ?? dog.id) !== (activeDog.firestoreId ?? activeDog.id)) return;
    topCardRef.current?.triggerSwipe('left');
  };

  const dogPhotos = selectedDog ? getRenderablePhotos(selectedDog.photos) : [];
  const detailPhoto = dogPhotos.length > 0 ? dogPhotos[Math.min(selectedPhotoIndex, dogPhotos.length - 1)] : null;
  const nextPhoto = dogPhotos.length > 1 ? dogPhotos[(selectedPhotoIndex + 1) % dogPhotos.length] : null;
  const detailTone = selectedDog ? fitTone(selectedDog.compat) : 'green';

  const detailsDistance = selectedDog
    ? formatDistanceMiles(selectedDog.distanceMiles)
      ?? (selectedDog.locality === 'city' ? 'Same city' : selectedDog.locality === 'state' ? 'Same state' : null)
    : null;
  const detailsPlace = selectedDog
    ? (() => {
        const place = selectedDog.location && selectedDog.location !== 'Location not shared' ? selectedDog.location.split(',')[0]?.trim() : '';
        return [place, detailsDistance].filter(Boolean).join(' · ') || 'Location not shared';
      })()
    : '';
  const energyWord = (n: number) => (n >= 75 ? 'High' : n <= 35 ? 'Mellow' : 'Balanced');
  const microcopyPlain = (t: string) => t.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {swipeError && (
        <div
          role="status"
          className="fixed left-1/2 top-4 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full border-2 border-brown bg-cream px-5 py-2.5 text-center text-sm font-black text-brown shadow-[0_4px_0_rgba(42,31,74,0.2)]"
        >
          {swipeError}
        </div>
      )}

      {/* ── Details: the profile, richer but calm ──────────────────────────── */}
      {selectedDog && (
        <div
          className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-sky bg-gingham"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedDog.name} details`}
        >
          <div className="flex h-full w-full max-w-md flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 px-3.5 pt-2">
              <button
                ref={detailsBackRef}
                type="button"
                onClick={() => setSelectedDog(null)}
                aria-label="Back to the card"
                className="-ml-1 flex h-11 w-11 items-center justify-center"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brown bg-cream shadow-[inset_0_-3px_0_#E3D6BA]">
                  <svg aria-hidden="true" width="13" height="18" viewBox="0 0 13 20" className="-ml-0.5">
                    <path d="M9.5 3.5L3.5 10l6 6.5" fill="none" stroke="#2A1F4A" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              <h1 className="min-w-0 flex-1 truncate font-display text-[26px] leading-none text-brown">{selectedDog.name}</h1>
              {/* The card's Report button sits behind this view, so it needs its own:
                  reading someone's full profile is exactly when you'd want to report
                  or block it. Blocking passes the card. */}
              {!isGuest && selectedDog.ownerId && (
                <ReportProfileMenu
                  targetUserId={selectedDog.ownerId}
                  targetName={selectedDog.name}
                  variant="dots"
                  className="-mr-1 shrink-0"
                  onBlocked={blockedFromDetails}
                />
              )}
            </header>

            <main className="min-h-0 flex-1 px-4 pb-1 pt-1">
              <article className="flex h-full flex-col overflow-hidden rounded-3xl border-2 border-brown bg-cream shadow-[0_10px_0_rgba(42,31,74,0.12)]">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {/* Hero photo + the next photo as a mini polaroid */}
                  <div className="relative h-[210px] shrink-0 bg-[#C9D3D8]">
                    {detailPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={detailPhoto}
                        alt={`${selectedDog.name}, photo ${selectedPhotoIndex + 1}`}
                        className="h-full w-full object-cover object-[center_28%]"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-note text-sm font-extrabold">No photo yet</div>
                    )}
                    {dogPhotos.length > 1 && (
                      <span
                        role="img"
                        aria-label={`Photo ${selectedPhotoIndex + 1} of ${dogPhotos.length}`}
                        className="absolute left-3 top-2.5 rounded-full border-2 border-brown bg-cream px-2.5 py-1 text-xs font-black leading-none shadow-[0_2px_5px_rgba(42,31,74,0.25)]"
                      >
                        {selectedPhotoIndex + 1} / {dogPhotos.length}
                      </span>
                    )}
                    {nextPhoto && (
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoIndex((i) => (i + 1) % dogPhotos.length)}
                        aria-label={`Show the next photo of ${selectedDog.name}`}
                        className="absolute bottom-2 right-2 w-[84px] rotate-[5deg] rounded-md bg-cream px-[5px] pt-[5px] shadow-[0_0_0_1.5px_#2A1F4A,0_6px_11px_rgba(42,31,74,0.32)]"
                      >
                        <Tape className="-top-[7px] left-6" width={36} height={12} rotate={-5} />
                        <span className="block h-[58px] overflow-hidden rounded-[3px] border-[1.5px] border-brown bg-[#E9E6E2]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={nextPhoto} alt="" className="h-full w-full object-cover" draggable={false} />
                        </span>
                        <span className="block pb-1 pt-0.5 text-center text-xs font-black leading-none">Next photo</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 px-3.5 pb-4 pt-3">
                    {/* Name, place, facts */}
                    <div>
                      {/* Wraps: the place ticket drops under a long name instead of
                          cutting the name to "RJTaco6…" right under the full one in the header. */}
                      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
                        <p className="min-w-0 max-w-full truncate font-display text-[30px] leading-none">{selectedDog.name}</p>
                        <PlaceTicket text={detailsPlace} className="max-w-full shrink" />
                      </div>
                      <p className="mt-1 text-sm font-black leading-snug [overflow-wrap:anywhere]">
                        {/* Words, each separate: "M" is Medium, never Male. */}
                        {[selectedDog.breed, [ageLabel(selectedDog.age), sizeLabel(selectedDog.size), sexLabel(selectedDog.sex)].filter(Boolean).join(' · ')]
                          .filter(Boolean)
                          .join('  ·  ')}
                      </p>
                    </div>

                    {/* Vibe Check bio + breed read: the dog's own voice, written at onboarding. */}
                    {(dogAboutText(selectedDog) || selectedDog.ai?.vibeCheck?.breedGuess) && (
                      <div className="rounded-xl border-2 border-brown/30 bg-cream px-3 py-2">
                        {dogAboutText(selectedDog) && (
                          <p className="text-sm font-extrabold leading-snug text-brown-mid [overflow-wrap:anywhere]">
                            {dogAboutText(selectedDog)}
                          </p>
                        )}
                        {selectedDog.ai?.vibeCheck?.breedGuess && (
                          <p className="mt-1 text-xs font-extrabold text-brown-mid">
                            AI&apos;s read: {selectedDog.ai.vibeCheck.breedGuess.name} ·{' '}
                            {breedConfidencePhrase(selectedDog.ai.vibeCheck.breedGuess.confidence)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Expanded fit panel */}
                    {selectedDog.compat.score > 0 && (
                      <section aria-label="Fit with your dog" className="rounded-[14px] border-2 border-brown bg-cream-dark px-3 py-2">
                        <div className="flex items-center gap-3">
                          <FitSticker compat={selectedDog.compat} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black leading-tight text-brown-mid">
                              What lines up <span className="font-extrabold">· Fit with your dog</span>
                            </p>
                            {(selectedDog.compat.reasons?.length ?? 0) > 0 ? (
                              <ul className="mt-0.5">
                                {selectedDog.compat.reasons.slice(0, 4).map((reason) => (
                                  <li key={reason} className="flex items-start gap-2 text-[13px] font-extrabold leading-snug">
                                    <span aria-hidden="true" className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-brown" />
                                    <span className="[overflow-wrap:anywhere]">{plain(reason)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-0.5 text-[13px] font-extrabold leading-snug">{selectedDog.compat.label}</p>
                            )}
                          </div>
                        </div>
                        <p className="mt-1.5 text-xs font-extrabold leading-snug text-brown-mid">
                          {detailTone === 'green' && (selectedDog.compat.limits?.cautionCount ?? 0) === 0
                            ? 'Compatible on what owners shared.'
                            : microcopyPlain(selectedDog.compat.microcopy)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowBreakdown((v) => !v)}
                          aria-expanded={showBreakdown}
                          className="-mb-1 mt-0.5 min-h-[44px] text-[13px] font-black text-rose underline underline-offset-2"
                        >
                          {showBreakdown ? 'Hide the math' : 'Show the math'}
                        </button>
                        {showBreakdown && (
                          <div className="mb-1">
                            <CompatBreakdown breakdown={selectedDog.compat.breakdown} score={selectedDog.compat.score} />
                          </div>
                        )}
                      </section>
                    )}

                    {/* Prompts as sticky notes, in the owner's own words */}
                    {(selectedDog.prompts ?? []).filter((p) => p.answer?.trim()).length > 0 && (
                      <ul aria-label={`${selectedDog.name}'s answers`} className="flex flex-col gap-2.5 pt-1">
                        {(selectedDog.prompts ?? []).filter((p) => p.answer?.trim()).map((prompt, i) => (
                          <li
                            key={prompt.prompt}
                            className="relative mx-0.5 rounded-[3px] bg-note px-3 pb-1.5 pt-1.5 shadow-[0_0_0_1.5px_#2A1F4A,0_3px_5px_rgba(42,31,74,0.2)]"
                            style={{ transform: `rotate(${[-0.7, 0.6, -0.5][i % 3]}deg)` }}
                          >
                            <Tape className={i % 2 === 0 ? '-top-[7px] left-8' : '-top-[7px] right-9'} rotate={i % 2 === 0 ? -4 : 4} />
                            <p className="text-xs font-extrabold leading-tight text-brown-mid">{prompt.prompt}</p>
                            <p className="font-hand text-[22px] font-bold leading-[1.05] [overflow-wrap:anywhere]">{prompt.answer}</p>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Plays / Is */}
                    {((selectedDog.playStyles?.length ?? 0) > 0 || (selectedDog.temperament?.length ?? 0) > 0) && (
                      <div className="flex flex-col gap-1.5">
                        {[
                          { label: 'Plays', items: selectedDog.playStyles ?? [] },
                          { label: 'Is', items: uniqueTemperament(selectedDog.temperament ?? []) },
                        ].filter((g) => g.items.length > 0).map((g) => (
                          <div key={g.label} className="flex items-start gap-1.5">
                            <span className="w-[34px] shrink-0 pt-1 text-xs font-black text-brown-mid">{g.label}</span>
                            <ul className="flex flex-wrap gap-1.5">
                              {g.items.map((item) => (
                                <li key={item} className="rounded-full border-2 border-brown bg-cream px-2.5 py-0.5 text-xs font-black leading-snug shadow-[0_2px_0_rgba(42,31,74,0.2)]">
                                  {plain(item)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[13px] font-extrabold leading-snug text-brown-mid">
                      Energy: <span className="font-black text-brown">{energyWord(selectedDog.energyLevel)}</span>
                      {formatMemberSince(selectedDog.createdAt) ? (
                        <> · Member since <span className="font-black text-brown">{formatMemberSince(selectedDog.createdAt)}</span></>
                      ) : null}
                    </p>

                    {/* Calm trust block: the owner's words, labelled as such */}
                    <section
                      aria-label={`What ${selectedDog.name}'s owner shared`}
                      className="rounded-[4px_10px_10px_4px] border-l-4 border-brown bg-cream-dark px-3 py-2"
                    >
                      <p className="text-[13px] font-black leading-snug">{vaccinationLine(selectedDog)}</p>
                      <div className="mt-1">
                        <LimitsBlock compat={selectedDog.compat} ownerName={selectedDog.name} />
                      </div>
                      <p className="mt-1.5 text-xs font-extrabold leading-snug text-brown-mid">
                        From {selectedDog.name}&apos;s owner. GoDoggyDate doesn&apos;t verify breed, vaccination, temperament, or the limits owners list.
                      </p>
                    </section>
                  </div>
                </div>
              </article>
            </main>

            <div className="shrink-0 px-3.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
              <p className="mb-1.5 text-center text-[12px] font-extrabold leading-snug">
                It&apos;s a match when you both say WOOF. Then propose a playdate.
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => { const d = selectedDog; setSelectedDog(null); if (d && (d.firestoreId ?? d.id) === (activeDog.firestoreId ?? activeDog.id)) triggerButtonAction('left'); }}
                  aria-label={`Pass on ${selectedDog.name}`}
                  className="flex h-[52px] w-[66px] shrink-0 flex-col items-center justify-center gap-px rounded-[18px] border-[2.5px] border-brown bg-cream pb-[5px] text-[12px] font-black leading-none shadow-[inset_0_-5px_0_#E3D6BA] transition-all active:translate-y-px"
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A1F4A" strokeWidth="4.6" strokeLinecap="round"><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" /></svg>
                  Pass
                </button>
                <button
                  type="button"
                  onClick={likeFromDetails}
                  aria-label={`WOOF at ${selectedDog.name}`}
                  className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full border-[2.5px] border-brown bg-primary pb-[5px] font-display text-[30px] leading-none tracking-[1px] text-brown shadow-[inset_0_-6px_0_#D63A6B] transition-all hover:brightness-105 active:translate-y-px"
                >
                  <PawIcon size={27} />
                  WOOF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── The card ──────────────────────────────────────────────────────── */}
      <div className="relative mx-auto min-h-[20rem] w-full max-w-[34rem] flex-1 px-4 pb-2.5 pt-2">
        <div className="relative h-full w-full">
          {/* Peek card: the next dog faintly behind the active card */}
          {peekDog && (
            <SwipeCard
              key={[
                peekDog.firestoreId ?? peekDog.id,
                peekDog.ownerId ?? 'owner',
                index + 1,
              ].join('-')}
              ref={null}
              dog={peekDog}
              zIndex={0}
              stackIndex={1}
              isTop={false}
              onLike={() => false}
              onPass={() => false}
            />
          )}
          {/* Active top card */}
          <SwipeCard
            key={[
              activeDog.firestoreId ?? activeDog.id,
              activeDog.ownerId ?? 'owner',
              index,
            ].join('-')}
            ref={topCardRef}
            dog={activeDog}
            zIndex={1}
            stackIndex={0}
            isTop
            onLike={() => handleLike(activeDog)}
            onPass={() => handlePass(activeDog)}
            onOpenDetails={() => setSelectedDog(activeDog)}
          />
        </div>
      </div>

      {/* ── Tray: Pass | WOOF | Details ───────────────────────────────────── */}
      <div className="shrink-0 px-3.5 pb-2 pt-1.5">
        <div className="mx-auto flex w-full max-w-[32rem] items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              triggerButtonAction('left');
            }}
            className="flex h-[52px] w-[66px] shrink-0 flex-col items-center justify-center gap-px rounded-[18px] border-[2.5px] border-brown bg-cream pb-[5px] text-[12px] font-black leading-none shadow-[inset_0_-5px_0_#E3D6BA] outline-none transition-all focus-visible:ring-2 focus-visible:ring-brown focus-visible:ring-offset-2 active:translate-y-px [WebkitTapHighlightColor:transparent]"
            aria-label={`Pass on ${activeDog.name}`}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A1F4A" strokeWidth="4.6" strokeLinecap="round"><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" /></svg>
            Pass
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              triggerButtonAction('right');
            }}
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full border-[2.5px] border-brown bg-primary pb-[5px] font-display text-[30px] leading-none tracking-[1px] text-brown shadow-[inset_0_-6px_0_#D63A6B] outline-none transition-all hover:brightness-105 focus-visible:ring-2 focus-visible:ring-brown focus-visible:ring-offset-2 active:translate-y-px [WebkitTapHighlightColor:transparent]"
            aria-label={`WOOF at ${activeDog.name}`}
          >
            <PawIcon size={27} />
            WOOF
          </button>

          <button
            ref={detailsTriggerRef}
            type="button"
            onClick={() => setSelectedDog(activeDog)}
            className="flex h-[52px] w-[66px] shrink-0 flex-col items-center justify-center gap-px rounded-[18px] border-[2.5px] border-brown bg-cream pb-[5px] text-[12px] font-black leading-none shadow-[inset_0_-5px_0_#E3D6BA] outline-none transition-all focus-visible:ring-2 focus-visible:ring-brown focus-visible:ring-offset-2 active:translate-y-px [WebkitTapHighlightColor:transparent]"
            aria-label={`Details for ${activeDog.name}`}
          >
            <svg aria-hidden="true" width="20" height="18" viewBox="0 0 24 22">
              <rect x="1.5" y="2.5" width="21" height="17" rx="3.5" fill="#2A1F4A" />
              <circle cx="7.8" cy="9.3" r="2.5" fill="#FFF9EC" />
              <path d="M13 8h5.5M13 11.6h4M5.5 15.4h13" fill="none" stroke="#FFF9EC" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            Details
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-[32rem] text-center text-[12px] font-extrabold leading-[15px]">
          It&apos;s a match when you both say WOOF. Then propose a playdate.
        </p>
      </div>
    </div>
  );
}
