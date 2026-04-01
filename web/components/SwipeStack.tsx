'use client';
// web/components/SwipeStack.tsx

import { useState, useCallback, useEffect, useRef } from 'react';
import SwipeCard, { type SwipeCardHandle } from './SwipeCard';
import { recordSwipe } from '../lib/matching';
import { getTodaySwipeCount, incrementSwipeCount, isSubscribed } from '../lib/swipes';
import { FREE_DAILY_SWIPES } from '../lib/stripe';
import type { CompatibilityResult } from '../shared/types';

interface FeedDog {
  id: string;
  name: string;
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
}

interface Props {
  dogs: FeedDog[];
  currentUserId: string;
  currentDogId: string;
  onMatch: (dog: FeedDog, matchId: string) => void;
  onEmpty: () => void;
  isGuest?: boolean;
  onSwipeLimitReached?: () => void;
  onRequireAuthForLike?: () => void;
}

export default function SwipeStack({
  dogs,
  currentUserId,
  currentDogId,
  onMatch,
  onEmpty,
  isGuest = false,
  onSwipeLimitReached,
  onRequireAuthForLike,
}: Props) {
  const [index, setIndex] = useState(0);
  const [selectedDog, setSelectedDog] = useState<FeedDog | null>(null);

  const swipesUsedRef = useRef<number>(0);
  const subscribedRef = useRef<boolean>(true);
  const limitCheckedRef = useRef<boolean>(false);
  const topCardRef = useRef<SwipeCardHandle | null>(null);

  useEffect(() => {
    setIndex(0);
    setSelectedDog(null);
  }, [dogs]);

  useEffect(() => {
    if (isGuest) {
      limitCheckedRef.current = true;
      subscribedRef.current = true;
      swipesUsedRef.current = 0;
      return;
    }

    Promise.all([
      getTodaySwipeCount(currentUserId),
      isSubscribed(currentUserId),
    ])
      .then(([count, sub]) => {
        swipesUsedRef.current = count;
        subscribedRef.current = sub;
        limitCheckedRef.current = true;

        if (!sub && count >= FREE_DAILY_SWIPES) {
          onSwipeLimitReached?.();
        }
      })
      .catch(() => {
        limitCheckedRef.current = true;
        subscribedRef.current = true;
      });
  }, [currentUserId, isGuest, onSwipeLimitReached]);

  const advance = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= dogs.length) onEmpty();
      return next;
    });
  }, [dogs.length, onEmpty]);

  const consumeSwipe = useCallback((): boolean => {
    if (isGuest) return false;
    if (!limitCheckedRef.current) return false;

    if (subscribedRef.current) {
      incrementSwipeCount(currentUserId);
      return false;
    }

    if (swipesUsedRef.current >= FREE_DAILY_SWIPES) {
      onSwipeLimitReached?.();
      return true;
    }

    swipesUsedRef.current += 1;
    incrementSwipeCount(currentUserId);

    if (swipesUsedRef.current >= FREE_DAILY_SWIPES) {
      setTimeout(() => onSwipeLimitReached?.(), 400);
    }

    return false;
  }, [currentUserId, isGuest, onSwipeLimitReached]);

  const handleLike = useCallback(
    async (dog: FeedDog) => {
      if (isGuest) {
        advance();
        onRequireAuthForLike?.();
        return false;
      }

      if (consumeSwipe()) return false;
      advance();

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
      }

      return true;
    },
    [consumeSwipe, advance, currentUserId, currentDogId, isGuest, onMatch, onRequireAuthForLike]
  );

  const handlePass = useCallback(
    async (dog: FeedDog) => {
      if (isGuest) {
        advance();
        return true;
      }

      if (consumeSwipe()) return false;
      advance();

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
    [consumeSwipe, advance, currentUserId, currentDogId, isGuest]
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
      {selectedDog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => setSelectedDog(null)}
        >
          <div
            className="relative w-full max-w-md rounded-t-3xl bg-cream px-5 py-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedDog(null)}
              className="absolute right-4 top-4 text-2xl leading-none text-brown-light hover:text-brown"
              aria-label="Close details"
            >
              ×
            </button>

            <div className="pr-8">
              <p className="font-display text-3xl text-brown">{selectedDog.name}</p>
              <p className="mt-1 text-sm text-brown-light">
                {[selectedDog.breed, selectedDog.age, selectedDog.sex, selectedDog.size].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Photo gallery — full-width first photo + scrollable thumbnails */}
            {(() => {
              const rp = (selectedDog.photos ?? []).filter((p) => p && !p.startsWith('_'));
              if (rp.length === 0) return null;
              return (
                <div className="mt-4 -mx-5">
                  {/* Primary large photo */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={rp[0]}
                    alt={selectedDog.name}
                    className="w-full h-52 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {/* Thumbnail row for additional photos */}
                  {rp.length > 1 && (
                    <div className="flex gap-1.5 px-5 pt-2 overflow-x-auto pb-0.5">
                      {rp.slice(1).map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          alt={`${selectedDog.name} photo ${i + 2}`}
                          className="h-16 w-16 shrink-0 rounded-xl object-cover border border-border"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: 'Energy', value: `${selectedDog.energyLevel}%` },
                { label: 'Vaccinated', value: selectedDog.vaccinated ? 'Yes ✓' : 'Unknown' },
                {
                  label: 'Distance',
                  value: selectedDog.distanceMiles >= 0
                    ? `${selectedDog.distanceMiles.toFixed(1)} mi`
                    : (selectedDog.location ?? 'Nearby'),
                },
                { label: 'Match', value: selectedDog.compat.score > 0 ? `${selectedDog.compat.score}%` : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-white px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-light">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-brown">{item.value}</p>
                </div>
              ))}
            </div>

            {selectedDog.location && (
              <div className="mt-4 rounded-2xl border border-border bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brown-light">Neighbourhood</p>
                <p className="mt-1 text-sm text-brown">{selectedDog.location}</p>
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
            onLike={() => {}}
            onPass={() => {}}
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
