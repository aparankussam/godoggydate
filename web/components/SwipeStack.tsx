'use client';
// web/components/SwipeStack.tsx

import { useState, useCallback, useEffect, useRef } from 'react';
import SwipeCard, { type SwipeCardHandle } from './SwipeCard';
import CompatBreakdown, { QUALITY_STYLES } from './CompatBreakdown';
import { trackEvent, trackOncePerSession } from '../lib/analytics';
import { recordSwipe } from '../lib/matching';
import { recordDemoSwipeLocally } from '../lib/discover';
import type { CompatibilityResult } from '../../shared/types';

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
  temperament?: string[];
  playStyles?: string[];
  location?: string;
  prompts?: { prompt: string; answer: string }[];
  distanceMiles: number;
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
    return new Date(timestamp).toLocaleDateString([], { month: 'short', year: 'numeric' });
  }

  useEffect(() => {
    setIndex(0);
    setSelectedDog(null);
    setSelectedPhotoIndex(0);
  }, [dogs]);

  useEffect(() => {
    setSelectedPhotoIndex(0);
    setShowBreakdown(false);
  }, [selectedDog?.firestoreId, selectedDog?.id]);

  const advance = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= dogs.length) onEmpty();
      return next;
    });
  }, [dogs.length, onEmpty]);

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
      trackOncePerSession('first_swipe', 'first_swipe', {
        action: 'like',
      });

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
      trackOncePerSession('first_swipe', 'first_swipe', {
        action: 'pass',
      });

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

              <div className="pr-8">
                <p className="font-display text-[2rem] leading-tight text-brown">{selectedDog.name}</p>
                <p className="mt-1 text-sm text-brown-light">
                  {[selectedDog.breed, selectedDog.age, selectedDog.sex, selectedDog.size].filter(Boolean).join(' · ')}
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

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { label: 'Match', value: selectedDog.compat.score > 0 ? `${selectedDog.compat.score}%` : '—' },
                  {
                    label: 'Distance',
                    value: selectedDog.distanceMiles >= 0
                      ? `${selectedDog.distanceMiles.toFixed(1)} mi`
                      : (selectedDog.location ?? 'Nearby'),
                  },
                  { label: 'Energy', value: `${selectedDog.energyLevel}%` },
                  { label: 'Vaccinated', value: selectedDog.vaccinated ? 'Yes ✓' : 'Unknown' },
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
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Why you&apos;ll click</p>
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

                  {/* All warnings, not just the first — a second safety flag
                      silently dropped is exactly the kind of detail an owner
                      needs before agreeing to a meetup. */}
                  {(selectedDog.compat.warnings?.length ?? 0) > 0 && (
                    <div className="mt-3 rounded-xl bg-[rgba(180,83,9,0.08)] px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-light">Worth knowing</p>
                      {selectedDog.compat.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-sm text-brown">{warning}</p>
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

              {selectedDog.location && (
                <div className="mt-3 rounded-2xl border border-border bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-brown-light">Neighbourhood</p>
                  <p className="mt-1 text-sm text-brown">{selectedDog.location}</p>
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
                      <p className="mt-1 text-sm leading-relaxed text-brown">{prompt.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="relative mx-auto w-full max-w-[38rem] flex-1"
        style={{ height: 'min(62vh, 36rem)', minHeight: '26rem' }}
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
