'use client';
import { formatUsMonthYear } from '../../shared/dates';
import { getVaccinationStatus } from '../../shared/profile';
// web/components/SwipeStack.tsx

import { useState, useCallback, useEffect, useRef } from 'react';
import SwipeCard, { type SwipeCardHandle } from './SwipeCard';
import CompatBreakdown, { QUALITY_STYLES } from './CompatBreakdown';
import ReportProfileMenu from './ReportProfileMenu';
import { breedConfidencePhrase } from '../lib/vibeCheck';
import { trackEvent, trackFirstTime } from '../lib/analytics';
import { recordSwipe } from '../lib/matching';
import { ageLabel, recordDemoSwipeLocally, rememberSwipe, sexLabel, sizeLabel } from '../lib/discover';
import { formatDistanceMiles } from '../../shared/utils/matchingEngine';
import { LimitList } from './OwnerLimits';
import type { CompatibilityResult, DogProfile } from '../../shared/types';

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedDog(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {swipeError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-brown text-white text-sm font-semibold rounded-full px-5 py-2.5 shadow-lg max-w-[90vw] text-center">
          {swipeError}
        </div>
      )}
      {selectedDog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => setSelectedDog(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedDog.name} details`}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl sm:max-h-[88vh] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-border/70 bg-cream/95 px-5 py-4 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setSelectedDog(null)}
                className="absolute right-4 top-3 text-2xl leading-none text-brown-light hover:text-brown"
                aria-label="Close details"
              >
                ×
              </button>

              {/* The card's Report button sits behind this sheet, so the sheet
                  needs its own: reading someone's full profile is exactly when
                  you'd want to report or block it. Blocking passes the card. */}
              {!isGuest && selectedDog.ownerId && (
                <ReportProfileMenu
                  targetUserId={selectedDog.ownerId}
                  className="absolute right-14 top-3.5 z-20"
                  onBlocked={blockedFromDetails}
                />
              )}

              <div className="pr-24">
                <p className="font-display text-[2rem] leading-tight text-brown break-words">{selectedDog.name}</p>
                <p className="mt-1 text-sm text-brown-light [overflow-wrap:anywhere]">
                  {/* Words, each separate: "M" is Medium, never Male. */}
                  {[selectedDog.breed, ageLabel(selectedDog.age), sizeLabel(selectedDog.size), sexLabel(selectedDog.sex)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto px-5 pb-5 pt-4">
              {/* Photo gallery — full-width first photo + scrollable thumbnails */}
              {(() => {
                const rp = (selectedDog.photos ?? []).filter((p) => p && !p.startsWith('_'));
                if (rp.length === 0) return null;
                const activePhoto = rp[Math.min(selectedPhotoIndex, rp.length - 1)] ?? rp[0];
                return (
                  <div className="-mx-5">
                    {/* Primary large photo */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activePhoto}
                      alt={selectedDog.name}
                      className="h-44 w-full object-cover sm:h-48"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex gap-2 overflow-x-auto px-5 pt-3 pb-0.5">
                      {rp.map((src, i) => (
                        <button
                          key={src}
                          type="button"
                          onClick={() => setSelectedPhotoIndex(i)}
                          className={`shrink-0 rounded-xl border transition-all ${
                            i === selectedPhotoIndex
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-border hover:border-primary/50'
                          }`}
                          aria-label={`View photo ${i + 1} of ${selectedDog.name}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={`${selectedDog.name} photo ${i + 1}`}
                            className="h-14 w-14 rounded-xl object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Vibe Check bio + breed read — the dog's own voice, written
                  at onboarding and previously shown nowhere in discovery.
                  Renders nothing at all for dogs without a Vibe Check. */}
              {selectedDog.ai?.vibeCheck && (
                <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3">
                  {selectedDog.ai.vibeCheck.bio && (
                    <p className="text-sm italic leading-relaxed text-brown-mid [overflow-wrap:anywhere]">
                      &ldquo;{selectedDog.ai.vibeCheck.bio}&rdquo;
                    </p>
                  )}
                  {selectedDog.ai.vibeCheck.breedGuess && (
                    <p className="mt-2 text-[11px] text-brown-light">
                      🔍 AI&apos;s read: {selectedDog.ai.vibeCheck.breedGuess.name} ·{' '}
                      {breedConfidencePhrase(selectedDog.ai.vibeCheck.breedGuess.confidence)}
                    </p>
                  )}
                </div>
              )}

              {/* Declared limits first (D3: warn first, rank lower, never hide). */}
              <LimitList compat={selectedDog.compat} />

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  // Not a "%" — the score isn't a percentage of anything measured,
                  // and labelling it one primes the user to read it as a probability.
                  { label: 'Fit score', value: selectedDog.compat.score > 0 ? `${selectedDog.compat.score}` : '—' },
                  {
                    label: 'Distance',
                    // Unknown says how we know they are close instead: the same city
                    // or state. Under a mile is "Under 1 mi", not "0.0 mi".
                    value: formatDistanceMiles(selectedDog.distanceMiles)
                      ?? (selectedDog.locality === 'city'
                        ? 'Same city'
                        : selectedDog.locality === 'state'
                          ? 'Same state'
                          : 'Not shared'),
                  },
                  { label: 'Energy', value: `${selectedDog.energyLevel}%` },
                  // `false` is an explicit "no" from the owner, not an absence of
                  // information — collapsing it into "Unknown" hid the one health
                  // answer that flips the pairing's quality tier.
                  // Same grading as the card's pill (getVaccinationStatus): a dated
                  // certificate is quoted, and an EXPIRED one says so. This tile
                  // used to read only the boolean, so a dog whose card said
                  // "Rabies: expired 04/18/2024" showed "Vaccinated: Marked yes" here.
                  (() => {
                    const status = getVaccinationStatus(selectedDog);
                    return {
                      label: 'Vaccinated',
                      value:
                        status.tone === 'expired' || status.tone === 'unvaccinated'
                          ? `⚠ ${status.label}`
                          : status.label,
                    };
                  })(),
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border bg-white px-3 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-light">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-brown">{item.value}</p>
                  </div>
                ))}
              </div>

              {selectedDog.compat.score > 0 && (
                <div className="mt-4 rounded-2xl border border-primary/25 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(180,83,9,0.08)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Why this fit</p>
                      <p className="mt-1 text-sm font-semibold text-brown">{selectedDog.compat.label}</p>
                      {selectedDog.compat.microcopy && (
                        <p className="mt-0.5 text-xs text-brown-light">{selectedDog.compat.microcopy}</p>
                      )}
                    </div>
                    {/* Ring color signals compat.quality — was a flat
                        primary-orange ring regardless of tier, so a blocked
                        match and a perfect one looked identically inviting. */}
                    <div
                      className={`score-ring h-12 w-12 shrink-0 text-sm border-2 ring-[3px] ${
                        QUALITY_STYLES[selectedDog.compat.quality]?.ring ?? ''
                      }`}
                      style={{ borderColor: QUALITY_STYLES[selectedDog.compat.quality]?.ringHex }}
                    >
                      {selectedDog.compat.score}
                    </div>
                  </div>

                  {(selectedDog.compat.reasons?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-2">
                      {selectedDog.compat.reasons.slice(0, 3).map((reason) => (
                        <p key={reason} className="text-sm text-brown">
                          <span className="mr-2 font-bold text-primary">•</span>
                          {reason}
                        </p>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowBreakdown((v) => !v)}
                    aria-expanded={showBreakdown}
                    className="mt-3 text-xs font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
                  >
                    {showBreakdown ? 'Hide the math' : 'Show the math'}
                  </button>

                  {showBreakdown && (
                    <div className="mt-2">
                      <CompatBreakdown breakdown={selectedDog.compat.breakdown} score={selectedDog.compat.score} />
                    </div>
                  )}
                </div>
              )}

              {selectedDog.location && selectedDog.location !== 'Location not shared' && (
                <div className="mt-3 rounded-2xl border border-border bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-brown-light">Neighbourhood</p>
                  <p className="mt-1 text-sm text-brown [overflow-wrap:anywhere]">{selectedDog.location}</p>
                </div>
              )}

              {formatMemberSince(selectedDog.createdAt) && (
                <div className="mt-3 rounded-2xl border border-border bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-brown-light">Member since</p>
                  <p className="mt-1 text-sm text-brown">{formatMemberSince(selectedDog.createdAt)}</p>
                </div>
              )}

              {(selectedDog.temperament?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-brown-light">Personality</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDog.temperament?.map((trait) => (
                      <span key={trait} className="chip text-xs">{trait}</span>
                    ))}
                  </div>
                </div>
              )}

              {(selectedDog.playStyles?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-brown-light">Play Style</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDog.playStyles?.map((style) => (
                      <span key={style} className="chip text-xs">{style}</span>
                    ))}
                  </div>
                </div>
              )}

              {(selectedDog.prompts?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  {selectedDog.prompts?.filter((prompt) => prompt.answer?.trim()).map((prompt) => (
                    <div key={prompt.prompt} className="rounded-2xl border border-border bg-white px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-brown-light">{prompt.prompt}</p>
                      <p className="mt-1 text-sm leading-relaxed text-brown [overflow-wrap:anywhere]">{prompt.answer}</p>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={likeFromDetails}
                aria-label={`Woof — like ${selectedDog.name}`}
                className="mt-6 w-full min-h-[56px] rounded-full bg-primary px-6 text-lg font-black text-white shadow-[0_16px_30px_rgba(232,99,58,0.32)] outline-none transition-transform hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] [WebkitTapHighlightColor:transparent]"
              >
                Woof! 🐾
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="relative mx-auto w-full max-w-[38rem] shrink-0"
        // 26rem as before, but shrinking on a short phone screen (iPhone Safari is
        // ~664px tall): the fixed 26rem floor pushed the Pass/WOOF buttons under
        // the bottom tab bar so they had to be scrolled into view. (This was
        // `flex-1` + height + minHeight, where flex-basis beat height and the
        // minHeight alone decided the size.)
        style={{ height: 'clamp(20rem, calc(100dvh - 20rem), 26rem)' }}
      >
        {/* Peek card — next dog faintly behind the active card */}
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

      <div className="shrink-0 px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+5.75rem)] sm:px-4 sm:pb-6">
        <div className="mx-auto flex w-full max-w-[38rem] items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              triggerButtonAction('left');
            }}
            className="flex-[0.9] min-h-[64px] rounded-full bg-[#161616] px-5 text-lg font-black text-white shadow-[0_16px_30px_rgba(0,0,0,0.28)] outline-none transition-transform hover:scale-[1.02] focus:outline-none focus-visible:outline-none focus-visible:ring-0 active:scale-[0.98] [WebkitTapHighlightColor:transparent]"
            aria-label="Pass"
          >
            <span className="flex items-center justify-center gap-3">
              <span className="text-[1.8rem] leading-none">✕</span>
              <span>Pass</span>
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              triggerButtonAction('right');
            }}
            className="flex-[1.3] min-h-[72px] rounded-full bg-primary px-6 text-xl font-black text-white shadow-[0_22px_42px_rgba(232,99,58,0.38)] outline-none transition-transform hover:scale-[1.02] focus:outline-none focus-visible:outline-none focus-visible:ring-0 active:scale-[0.98] [WebkitTapHighlightColor:transparent]"
            aria-label="WOOF"
          >
            <span className="flex items-center justify-center gap-3">
              <span className="text-[1.95rem] leading-none">🐾</span>
              <span>WOOF</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
