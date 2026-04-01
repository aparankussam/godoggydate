'use client';
// web/components/SwipeCard.tsx
// Single draggable card — photo-first design.
// Tap the card body (not a button) to advance through multiple photos.
// Drag left/right to pass/like.

import { forwardRef, useState, useRef, useCallback, useImperativeHandle, useEffect } from 'react';
import type { CompatibilityResult } from '../shared/types';

interface CardDog {
  id: string;
  firestoreId?: string;
  name: string;
  breed: string;
  age: string;
  sex?: string;
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
}

interface Props {
  dog: CardDog;
  zIndex: number;
  stackIndex: number;
  onLike: () => void;
  onPass: () => void;
  onOpenDetails?: () => void;
  isTop: boolean;
}

export interface SwipeCardHandle {
  triggerSwipe: (direction: 'left' | 'right', options?: { immediate?: boolean }) => void;
}

const THRESHOLD = 80;
// Taps with less than this horizontal delta are treated as photo-advance taps
const TAP_THRESHOLD = 8;

// Strip placeholder tokens so they never hit an <img src>
function realPhotos(photos?: string[]): string[] {
  return (photos ?? []).filter((p) => p && !p.startsWith('_'));
}

const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard({
  dog,
  zIndex,
  stackIndex,
  onLike,
  onPass,
  onOpenDetails,
  isTop,
}, ref) {
  const [dragX, setDragX]           = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [gone, setGone]             = useState<'left' | 'right' | null>(null);
  const [imgError, setImgError]     = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const startX = useRef(0);
  const releaseTimerRef = useRef<number | null>(null);

  const runSwipe = useCallback((direction: 'left' | 'right', options?: { immediate?: boolean }) => {
    if (gone) return;
    setIsDragging(false);
    setDragX(0);
    setGone(direction);

    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
    }

    if (options?.immediate) {
      if (direction === 'right') { onLike(); return; }
      onPass(); return;
    }

    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      if (direction === 'right') { onLike(); return; }
      onPass();
    }, 280);
  }, [gone, onLike, onPass]);

  useImperativeHandle(ref, () => ({
    triggerSwipe: (direction: 'left' | 'right', options?: { immediate?: boolean }) => {
      runSwipe(direction, options);
    },
  }), [runSwipe]);

  useEffect(() => {
    setGone(null);
    setDragX(0);
    setIsDragging(false);
    setImgError(false);
    setPhotoIndex(0);
  }, [dog.firestoreId ?? dog.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isTop || gone) return;
    startX.current = e.clientX;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [gone, isTop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragX(e.clientX - startX.current);
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const dx = e.clientX - startX.current;

    if (dx > THRESHOLD) {
      runSwipe('right');
    } else if (dx < -THRESHOLD) {
      runSwipe('left');
    } else if (Math.abs(dx) < TAP_THRESHOLD) {
      // It's a tap — advance/retreat photos if there are multiple
      const photos = realPhotos(dog.photos);
      if (photos.length > 1) {
        // Right half of card = next photo, left half = previous photo
        const cardEl = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const tapX = e.clientX - cardEl.left;
        if (tapX > cardEl.width / 2) {
          setPhotoIndex((i) => (i + 1) % photos.length);
        } else {
          setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
        }
      }
      setDragX(0);
    } else {
      setDragX(0);
    }
  }, [isDragging, runSwipe, dog.photos]);

  const peekScale  = 1 - stackIndex * 0.04;
  const peekOffset = stackIndex * 12;
  const rotation   = isDragging ? dragX * 0.05 : 0;
  const dragTravel = isDragging ? dragX * 0.45 : 0;
  const translateX = gone === 'right' ? 620 : gone === 'left' ? -620 : dragTravel;
  const translateY = gone ? -20 : (isTop ? 0 : peekOffset);
  const scale      = gone ? 1 : (isTop ? 1 : peekScale);
  const opacity    = isTop ? 1 : 0.9 - stackIndex * 0.08;

  const transition = isDragging
    ? 'none'
    : gone
    ? 'transform 0.3s ease-in, opacity 0.3s ease-in'
    : 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)';

  const photos       = realPhotos(dog.photos);
  const hasPhoto     = photos.length > 0;
  const currentPhoto = hasPhoto ? photos[Math.min(photoIndex, photos.length - 1)] : null;
  const likeStrength = Math.min(dragX / THRESHOLD, 1);
  const passStrength = Math.min(-dragX / THRESHOLD, 1);

  // Compact location/distance string shown on the card
  const distanceLabel = dog.distanceMiles >= 0
    ? `${dog.distanceMiles.toFixed(1)} mi away`
    : (dog.location ?? 'Nearby');

  return (
    <div
      className="absolute inset-0 select-none overflow-visible bg-transparent"
      style={{
        zIndex,
        opacity,
        transform:  `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotation}deg) scale(${scale})`,
        transition,
        cursor: isTop ? (isDragging ? 'grabbing' : 'grab') : 'default',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* ── Card shell ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden rounded-[2.15rem] bg-transparent shadow-[0_18px_40px_rgba(0,0,0,0.12)]">

        {/* ── Photo section ────────────────────────────────────────────── */}
        <div className="relative h-full bg-transparent">
          {hasPhoto && !imgError && currentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPhoto}
              alt={dog.name}
              key={currentPhoto}
              onError={() => setImgError(true)}
              className="h-full w-full scale-[1.02] object-cover object-[center_24%] pointer-events-none contrast-[1.15] saturate-[1.18]"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#f0dfcb] via-[#f4c96f] to-[#eb7c58] flex flex-col items-center justify-center gap-3">
              <span className="text-8xl">🐕</span>
              <span className="text-sm text-brown font-semibold">No photo yet</span>
            </div>
          )}

          {/* Photo dot indicators — shown only when 2+ photos */}
          {photos.length > 1 && isTop && (
            <div className="absolute top-3 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
              {photos.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-200 ${
                    i === photoIndex
                      ? 'w-5 h-1.5 bg-white shadow-sm'
                      : 'w-1.5 h-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Gradient overlay */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              background:
                'linear-gradient(to top, rgba(8,6,5,0.72) 0%, rgba(8,6,5,0.46) 22%, rgba(8,6,5,0.18) 42%, transparent 62%)',
            }}
          >
            <div className="px-5 pb-5 pt-14">
              <div className="min-w-0 max-w-[78%]">
                <p className="font-display text-[2.55rem] leading-[0.94] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
                  {dog.name}
                </p>
                <p className="mt-1.5 text-[1.02rem] font-semibold tracking-[0.01em] text-white/95 truncate drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
                  {dog.breed}
                </p>
                <p className="mt-1 text-sm font-medium text-white/80 drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
                  📍 {distanceLabel}
                </p>
              </div>
            </div>
          </div>

          {dog.compat.score > 0 && (
            <div className="absolute right-4 top-4 rounded-full bg-white/70 px-2.5 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-sm">
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-brown/65">{dog.compat.score}%</span>
            </div>
          )}

          {/* WOOF overlay */}
          {isTop && dragX > 20 && (
            <div
              className="absolute top-14 right-4 rounded-xl px-4 py-2 border-[3px] border-[#F5B731] bg-black/10"
              style={{ opacity: Math.min(likeStrength * 1.5, 1), transform: 'rotate(10deg)' }}
            >
              <span className="font-display text-white text-2xl font-black drop-shadow">WOOF 🐾</span>
            </div>
          )}

          {/* PASS overlay */}
          {isTop && dragX < -20 && (
            <div
              className="absolute top-14 left-4 rounded-xl px-4 py-2 border-[3px] border-red-400 bg-black/10"
              style={{ opacity: Math.min(passStrength * 1.5, 1), transform: 'rotate(-10deg)' }}
            >
              <span className="font-display text-white text-2xl font-black drop-shadow">PASS</span>
            </div>
          )}

          {/* Vaccinated pill */}
          {dog.vaccinated === true && (
            <div className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.88)] px-2.5 py-1 text-[10px] font-bold text-white shadow-[0_6px_18px_rgba(0,0,0,0.12)]">
              <span>✓</span> Vaccinated
            </div>
          )}

          {/* Details button */}
          {onOpenDetails && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails();
              }}
              className="absolute right-4 bottom-4 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-brown shadow-[0_6px_18px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-colors hover:bg-white"
              aria-label={`View details for ${dog.name}`}
            >
              Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default SwipeCard;
