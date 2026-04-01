'use client';
// web/components/MatchModal.tsx
// Full-screen celebration overlay fired when a mutual like is detected.
// Shown from SwipeStack's onMatch callback in app/app/page.tsx.

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { CompatibilityResult } from '../shared/types';
import { getPrimaryRenderablePhoto } from '../lib/photos';

interface MatchDog {
  id: string;
  name: string;
  breed: string;
  photos?: string[];
  compat: CompatibilityResult;
}

interface Props {
  dog: MatchDog;
  matchId: string;
  onKeepSwiping: () => void;
}

export default function MatchModal({ dog, matchId, onKeepSwiping }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const photo = getPrimaryRenderablePhoto(dog.photos);

  // Trap focus inside modal
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    el.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center gap-6 outline-none"
      style={{
        background: 'linear-gradient(160deg, #3D1F0A 0%, #B45309 60%, #92400E 100%)',
      }}
      aria-modal="true"
      role="dialog"
      aria-label="It's a Match!"
    >
      {/* Animated paw burst */}
      <div className="text-7xl animate-bounce select-none" aria-hidden="true">
        🐕&nbsp;💛&nbsp;🐶
      </div>

      <h2 className="font-display text-5xl text-white leading-tight">
        It&apos;s a Match!
      </h2>

      {/* Dog photo + score */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gold shadow-xl">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={dog.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gold to-primary flex items-center justify-center text-5xl">
              🐕
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-display text-3xl text-white">{dog.name}</p>
          <p className="text-white/90 text-lg font-semibold">
            is ready for a playdate connection.
          </p>
          <p className="text-white/70 text-sm">
            {dog.breed} with a {dog.compat.score}% match vibe. This could be a really fun one.
          </p>
        </div>

        {/* Compat score badge */}
        <div className="score-ring w-14 h-14 text-lg border-gold" style={{ color: '#F59E0B', borderColor: '#F59E0B' }}>
          {dog.compat.score}
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href={`/app/messages/${matchId}`}
          className="w-full bg-gold text-brown font-bold rounded-full px-8 py-4 text-lg shadow-xl hover:scale-105 transition-transform text-center"
        >
          💬 Say hi to {dog.name}
        </Link>
        <button
          onClick={onKeepSwiping}
          className="text-white/60 text-sm hover:text-white/90 transition-colors py-2"
        >
          Keep swiping →
        </button>
      </div>

      {/* Floating paw prints decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {['top-12 left-8 text-3xl opacity-20 rotate-12', 'top-20 right-10 text-2xl opacity-15 -rotate-6',
          'bottom-32 left-6 text-4xl opacity-20 rotate-45', 'bottom-20 right-8 text-3xl opacity-15 -rotate-12'].map((cls, i) => (
          <span key={i} className={`absolute ${cls} select-none`}>🐾</span>
        ))}
      </div>
    </div>
  );
}
