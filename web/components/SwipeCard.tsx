'use client';
// web/components/SwipeCard.tsx
// Single draggable card — photo-first design.
// Tap the card body (not a button) to advance through multiple photos.
// Drag left/right to pass/like.

import { forwardRef, useState, useRef, useCallback, useImperativeHandle, useEffect } from 'react';
import type { CompatibilityResult, DogProfile } from '../../shared/types';
import { resolveHeroIndex, getHeroFocus, getRenderablePhotos } from '../lib/photos';
import ReportProfileMenu from './ReportProfileMenu';
import { plain, FitSticker, PawIcon, PlaceTicket, TrustSlip } from './DiscoverBits';
import { formatDistanceMiles } from '../../shared/utils/matchingEngine';
import { ageLabel, sexLabel, sizeLabel } from '../lib/discover';
import { temperamentLabel } from '../../shared/temperament';
import { Icon } from './icons';

interface CardDog {
  ownerId?: string;
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
  rabiesExpiry?: string;
  temperament?: string[];
  playStyles?: string[];
  location?: string;
  prompts?: { prompt: string; answer: string }[];
  ai?: DogProfile['ai'];
  coverPhotoIndex?: number | null;
  coverFocusX?: number | null;
  coverFocusY?: number | null;
  distanceMiles: number;
  /** 'near' = measured distance; 'city' / 'state' = only the place is known. */
  locality?: 'near' | 'city' | 'state';
  compat: CompatibilityResult;
}

interface Props {
  dog: CardDog;
  zIndex: number;
  stackIndex: number;
  onLike: () => boolean | Promise<boolean>;
  onPass: () => boolean | Promise<boolean>;
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
  return getRenderablePhotos(photos);
}

// The photo the card should OPEN on — the owner's cover pick (or AI hero),
// clamped to the real photos so a stale index never lands out of range.
function heroIndexFor(dog: CardDog): number {
  const real = realPhotos(dog.photos);
  const h = resolveHeroIndex(dog);
  return typeof h === 'number' && h >= 0 && h < real.length ? h : 0;
}

// Say only what is known: a measured distance, or the place and that the distance
// isn't. "Nearby" / "Local match" are claims we don't have the data for.
function getLocationLabel(dog: CardDog): string {
  const place = dog.location && dog.location !== 'Location not shared' ? dog.location : '';
  const distance = formatDistanceMiles(dog.distanceMiles);
  if (distance) {
    const city = place.split(',')[0]?.trim();
    return city ? `${city} · ${distance}` : `${distance} away`;
  }
  if (dog.locality === 'city') return place ? `${place} · same city` : 'Same city';
  if (dog.locality === 'state') return place ? `${place} · same state` : 'Same state';
  return place || 'Location not shared';
}

// Fixed scatter offsets for the like-swipe paw burst — a handful of divs at
// varied angles/distances reads as a burst without needing per-render
// randomness (which would also fight React's reconciliation on re-render).
const PAW_BURST_OFFSETS = [
  { tx: '54px',  ty: '-46px', rot: '-18deg' },
  { tx: '-38px', ty: '-58px', rot: '22deg' },
  { tx: '62px',  ty: '18px',  rot: '8deg' },
  { tx: '-56px', ty: '4px',   rot: '-30deg' },
  { tx: '10px',  ty: '-70px', rot: '4deg' },
];

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
  // Photos that failed to load. Was a single sticky boolean, so one dead URL
  // made the whole card read "No photo yet" even while the other photos were fine.
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(() => heroIndexFor(dog));

  const startX = useRef(0);
  const startY = useRef(0);
  const releaseTimerRef = useRef<number | null>(null);

  const runSwipe = useCallback((direction: 'left' | 'right', options?: { immediate?: boolean }) => {
    if (gone) return;
    setIsDragging(false);
    setDragX(0);
    setGone(direction);

    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
    }

    const finishSwipe = async () => {
      const allowed = direction === 'right' ? await onLike() : await onPass();
      if (!allowed) {
        setGone(null);
      }
    };

    if (options?.immediate) {
      void finishSwipe();
      return;
    }

    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      void finishSwipe();
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
    setFailedPhotos([]);
    setPhotoIndex(heroIndexFor(dog));
  }, [dog.firestoreId ?? dog.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isTop || gone) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
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
    const dy = e.clientY - startY.current;

    if (dx > THRESHOLD) {
      runSwipe('right');
    } else if (dx < -THRESHOLD) {
      runSwipe('left');
    } else if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
      // A tap (not a drag, and not a vertical flick) — advance to the next
      // photo, wrapping back to the first after the last.
      const photos = realPhotos(dog.photos);
      if (photos.length > 1) {
        setPhotoIndex((i) => (i + 1) % photos.length);
      }
      setDragX(0);
    } else {
      setDragX(0);
    }
  }, [isDragging, runSwipe, dog.photos]);

  // A CANCELLED pointer (an OS edge gesture, a second touch, the tab losing
  // focus) is neither a released drag nor a tap — routing it through
  // handlePointerUp would land in the tap branch (a cancel reports the last
  // known coordinates, so dx/dy are ~0 after a stationary press) and advance
  // the photo. This is the web twin of the RNGH `success` guard in
  // mobile/components/SwipeCard.tsx's tap gesture.
  const handlePointerCancel = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragX(0);
  }, [isDragging]);

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
  // When the current photo is the owner's cover pick AND they dragged a focal
  // point, honor it (overrides the default face-friendly crop). Otherwise keep
  // the tasteful default so untouched dogs don't shift to a worse centre crop.
  const hasCustomFocus = typeof dog.coverFocusX === 'number' || typeof dog.coverFocusY === 'number';
  const heroObjectPosition = photoIndex === heroIndexFor(dog) && hasCustomFocus ? getHeroFocus(dog) : undefined;
  const likeStrength = Math.min(dragX / THRESHOLD, 1);
  const passStrength = Math.min(-dragX / THRESHOLD, 1);

  // Say only what is known: a measured distance, or the place and that the distance isn't.
  const distanceLabel = getLocationLabel(dog);
  const hasScore = dog.compat.score > 0;
  // One quiet line of what the owner listed: play styles first, then a temperament word.
  const vibeLine = [...(dog.playStyles ?? []).slice(0, 2), ...(dog.temperament ?? []).slice(0, 1).map(temperamentLabel)].map(plain).join(' · ');
  const factsLine = [dog.breed, [ageLabel(dog.age), sizeLabel(dog.size), sexLabel(dog.sex)].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div
      className="absolute inset-0 select-none overflow-visible bg-transparent"
      aria-hidden={!isTop || undefined}
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
      onPointerCancel={handlePointerCancel}
    >
      {/* ── Card shell: paper, ink outline, hard shadow ─────────────────── */}
      <article
        aria-label={`${dog.name}, ${dog.breed}`}
        className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border-2 border-brown bg-cream shadow-[0_10px_0_rgba(42,31,74,0.12)]"
      >
        {/* ── Photo (about 60% of the card) ──────────────────────────────── */}
        <div className="relative min-h-0 flex-1 bg-[#C9D3D8]">
          {hasPhoto && currentPhoto && !failedPhotos.includes(currentPhoto) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPhoto}
              alt={dog.name}
              key={currentPhoto}
              onError={() => {
                // Mark this one dead and move on to the next photo that hasn't failed.
                const failed = [...failedPhotos, currentPhoto];
                setFailedPhotos(failed);
                const next = photos.findIndex((p) => !failed.includes(p));
                if (next >= 0) setPhotoIndex(next);
              }}
              className="pointer-events-none h-full w-full object-cover object-[center_28%]"
              style={heroObjectPosition ? { objectPosition: heroObjectPosition } : undefined}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-note">
              <Icon name="dog" size={72} className="text-brown" />
              <span className="text-sm font-extrabold text-brown">No photo yet</span>
            </div>
          )}

          {/* Photo counter, top-left (safe zone: the dog is rarely there) — only with 2+ photos. */}
          {photos.length > 1 && isTop && (
            <span
              role="img"
              aria-label={`Photo ${Math.min(photoIndex, photos.length - 1) + 1} of ${photos.length}. Tap the photo for the next one.`}
              className="pointer-events-none absolute left-3 top-3 rounded-full border-2 border-brown bg-cream px-2.5 py-1 text-xs font-black leading-none shadow-[0_2px_5px_rgba(42,31,74,0.25)]"
            >
              {Math.min(photoIndex, photos.length - 1) + 1} / {photos.length}
            </span>
          )}

          {/* Fit: the tag and the sticker, top-right. Fades out while a WOOF / PASS
              stamp is showing so the two never overprint. */}
          {hasScore && (
            <div
              className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1.5 transition-opacity duration-150"
              style={{ opacity: isTop && Math.abs(dragX) > 20 ? 0 : 1 }}
            >
              <span className="flex items-center gap-1.5 rounded-full border-2 border-brown bg-cream py-1 pl-2 pr-2.5 text-xs font-black leading-none shadow-[0_2px_5px_rgba(42,31,74,0.25)]">
                <PawIcon />
                Fit with your dog
              </span>
              <FitSticker compat={dog.compat} />
            </div>
          )}

          {/* Place ticket, bottom-left */}
          <PlaceTicket text={distanceLabel} className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]" />

          {/* WOOF stamp */}
          {isTop && dragX > 20 && (
            <div
              className="pointer-events-none absolute right-4 top-24 rounded-xl border-[3px] border-brown bg-cream px-4 py-1.5 shadow-[0_3px_0_rgba(42,31,74,0.25)]"
              style={{ opacity: Math.min(likeStrength * 1.5, 1), transform: 'rotate(8deg)' }}
            >
              <span className="font-display text-2xl text-brown">WOOF</span>
            </div>
          )}

          {/* PASS stamp */}
          {isTop && dragX < -20 && (
            <div
              className="pointer-events-none absolute left-4 top-16 rounded-xl border-[3px] border-brown bg-cream px-4 py-1.5 shadow-[0_3px_0_rgba(42,31,74,0.25)]"
              style={{ opacity: Math.min(passStrength * 1.5, 1), transform: 'rotate(-8deg)' }}
            >
              <span className="font-display text-2xl text-brown">PASS</span>
            </div>
          )}

          {/* Swipe-completion reactions: the card used to just fly off with no
              feedback at the moment a like/pass actually committed. */}
          {gone === 'right' && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              {PAW_BURST_OFFSETS.map((offset, i) => (
                <span
                  key={i}
                  className="absolute animate-paw-burst text-3xl"
                  style={{ '--tx': offset.tx, '--ty': offset.ty, '--rot': offset.rot } as React.CSSProperties}
                >
                  🐾
                </span>
              ))}
            </div>
          )}
          {gone === 'left' && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <span className="absolute h-24 w-24 animate-dust-puff rounded-full bg-white/40" />
              <span className="absolute h-16 w-16 animate-dust-puff rounded-full bg-white/30" style={{ animationDelay: '80ms' }} />
            </div>
          )}
        </div>

        {/* ── Name, facts, one quiet trust slip ───────────────────────────── */}
        <div className="shrink-0 px-4 pb-3.5 pt-3">
          <div className="flex items-center justify-between gap-2.5">
            <h2 className="min-w-0 truncate font-display text-[30px] leading-none text-brown">{dog.name}</h2>
            {/* Only in the real deck (it passes onOpenDetails). Blocking swipes the card away as a pass. */}
            {onOpenDetails && isTop && dog.ownerId && (
              <ReportProfileMenu
                targetUserId={dog.ownerId}
                targetName={dog.name}
                variant="dots"
                className="shrink-0"
                onBlocked={() => runSwipe('left')}
              />
            )}
          </div>
          <p className="mt-0.5 text-[15px] font-black leading-[1.3] [overflow-wrap:anywhere]">{factsLine}</p>
          {vibeLine && (
            <p className="text-sm font-extrabold leading-[1.3] text-brown-mid [overflow-wrap:anywhere]">{vibeLine}</p>
          )}
          <TrustSlip dog={dog} compat={dog.compat} className="mt-2.5" />
        </div>
      </article>
    </div>
  );
});

export default SwipeCard;
