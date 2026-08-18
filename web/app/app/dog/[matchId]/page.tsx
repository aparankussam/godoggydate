'use client';
// web/app/app/dog/[matchId]/page.tsx
// A matched dog's full profile — read-only. Before this page existed, a
// match card and the chat header showed a thumbnail + name and nothing
// else; there was no way to see the rest of a matched dog's photos,
// temperament, play styles, or Vibe Check archetype/bio once you'd matched.
// Reachable from the Matches list (tap the photo) and the chat header (tap
// the name/photo) — see web/app/app/matches/page.tsx and
// web/app/app/messages/[matchId]/page.tsx.

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import { getRenderablePhotos } from '../../../../lib/photos';
import { breedConfidencePhrase } from '../../../../lib/vibeCheck';
import VibeTypeCard from '../../../../components/VibeTypeCard';

interface MatchDoc {
  dog1UserId: string;
  dog2UserId: string;
}

export default function MatchedDogProfilePage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundOrDenied, setNotFoundOrDenied] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!authUser || !matchId) return;
    let cancelled = false;

    (async () => {
      const { db } = getFirebase();
      try {
        const matchSnap = await getDoc(doc(db, 'matches', matchId));
        if (!matchSnap.exists()) {
          if (!cancelled) { setNotFoundOrDenied(true); setLoading(false); }
          return;
        }
        const match = matchSnap.data() as MatchDoc;
        if (match.dog1UserId !== authUser.uid && match.dog2UserId !== authUser.uid) {
          if (!cancelled) { setNotFoundOrDenied(true); setLoading(false); }
          return;
        }
        const otherUserId = match.dog1UserId === authUser.uid ? match.dog2UserId : match.dog1UserId;
        const dogSnap = await getDoc(doc(db, 'dogs', otherUserId));
        if (!cancelled) {
          if (dogSnap.exists()) {
            setProfile(dogSnap.data() as SavedDogProfile);
          } else {
            setNotFoundOrDenied(true);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setNotFoundOrDenied(true); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [authUser, matchId]);

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <p className="font-display text-2xl text-brown">Sign in to view this profile</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  if (notFoundOrDenied || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-4xl">😕</span>
        <p className="font-display text-2xl text-brown">Couldn&apos;t load this profile</p>
        <Link href="/app/matches" className="btn-primary px-8 py-3">Back to Matches</Link>
      </div>
    );
  }

  const photos = getRenderablePhotos(profile.photos);
  const safeActive = photos.length > 0 ? Math.min(activePhoto, photos.length - 1) : 0;
  const vibeCheck = profile.ai?.vibeCheck;

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-4 h-14 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-2xl text-brown-light hover:text-brown transition-colors"
          aria-label="Back"
        >
          ←
        </button>
        <span className="font-display text-lg text-brown truncate">{profile.name}&apos;s profile</span>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-5">
        {/* Hero photo */}
        <div className="rounded-[2rem] overflow-hidden bg-gradient-to-br from-gold to-primary aspect-square flex items-center justify-center">
          {photos[safeActive] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[safeActive]} alt={profile.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-8xl">🐕</span>
          )}
        </div>

        {/* Rest of photos — tap to make one the main photo. */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActivePhoto(i)}
                aria-label={`Show ${profile.name} photo ${i + 1}`}
                aria-pressed={i === safeActive}
                className={`w-24 h-24 rounded-2xl overflow-hidden shrink-0 border-2 transition-all ${
                  i === safeActive ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${profile.name} photo ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Name + meta */}
        <div>
          <p className="font-display text-3xl text-brown leading-tight">{profile.name}</p>
          <p className="text-sm text-brown-light mt-1">
            {[profile.breed, profile.age, profile.size, profile.location].filter(Boolean).join(' · ')}
          </p>
          {typeof profile.foundingPackNumber === 'number' && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold/15 border border-gold/40 px-3 py-1.5 text-xs font-bold text-brown">
              🏅 Founding Pack #{profile.foundingPackNumber}
            </span>
          )}
        </div>

        {/* Vibe Check: archetype type card + bio + Mutt Meter (breed guess) */}
        {vibeCheck && (
          <div className="flex flex-col gap-3">
            <VibeTypeCard archetype={vibeCheck.archetype} />
            {vibeCheck.bio && (
              <p className="text-sm italic leading-relaxed text-brown-mid px-1">
                “{vibeCheck.bio}”
              </p>
            )}
            {vibeCheck.breedGuess && (
              <p className="text-xs text-brown-light px-1">
                🔍 AI&apos;s read: {vibeCheck.breedGuess.name} · {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
              </p>
            )}
          </div>
        )}

        {/* Temperament + play style */}
        {(profile.temperament?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light mb-2">Temperament</p>
            <div className="flex flex-wrap gap-2">
              {profile.temperament!.map((t) => (
                <span key={t} className="rounded-full bg-white border border-border px-3 py-1.5 text-sm text-brown">{t}</span>
              ))}
            </div>
          </div>
        )}
        {(profile.playStyles?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light mb-2">Play style</p>
            <div className="flex flex-wrap gap-2">
              {profile.playStyles!.map((p) => (
                <span key={p} className="rounded-full bg-white border border-border px-3 py-1.5 text-sm text-brown">{p}</span>
              ))}
            </div>
          </div>
        )}

        <Link href={`/app/messages/${matchId}`} className="btn-primary text-center px-8 py-3.5 mt-2">
          💬 Message {profile.name}
        </Link>
      </div>
    </div>
  );
}
