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
import { getRenderablePhotos, resolveHeroIndex } from '../../../../lib/photos';
import { breedConfidencePhrase } from '../../../../lib/vibeCheck';
import VibeTypeCard from '../../../../components/VibeTypeCard';
import ReportProfileMenu from '../../../../components/ReportProfileMenu';
import { foundingBadgeLabel } from '../../../../../shared/founding';
import { otherUserIdFromMatchId } from '../../../../../shared/playdates';
import SignInGate from '../../../../components/SignInGate';
import { uniqueTemperament } from '../../../../../shared/temperament';
import DogtypeRevealCard from '../../../../components/dogtype/DogtypeRevealCard';
import { computeDogtype, dogtypeByCode } from '../../../../../shared/dogtype';
import { discoveredCount, type DogtypeDogMap, type DogtypeLedger } from '../../../../../shared/progress';
import { effectiveCode, loadDiscoveries, loadDogSnapshots, loadRevealed, markDiscoverySeen, onDiscoveriesChange } from '../../../../lib/dogtypeDiscovery';

interface MatchDoc {
  dog1UserId: string;
  dog2UserId: string;
}

/** Why there is no profile to show. 'left' is the one that says why. */
type Unavailable = 'left' | 'unavailable' | 'error';

export default function MatchedDogProfilePage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<Unavailable | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [otherUid, setOtherUid] = useState<string | null>(null);
  const [ownProfile, setOwnProfile] = useState<SavedDogProfile | null>(null);
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [snapshots, setSnapshots] = useState<DogtypeDogMap>({});
  const [unseen, setUnseen] = useState(false);
  const [ownRevealed, setOwnRevealed] = useState(false);

  // Your own dog and your Dogtype ledger, for the reveal card below.
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) return undefined;
    let cancelled = false;
    getDoc(doc(getFirebase().db, 'dogs', uid))
      .then((snap) => { if (!cancelled && snap.exists()) setOwnProfile(snap.data() as SavedDogProfile); })
      .catch(() => {});
    const load = () => {
      setLedger(loadDiscoveries(uid));
      setSnapshots(loadDogSnapshots(uid));
      setOwnRevealed(loadRevealed(uid));
    };
    load();
    const off = onDiscoveriesChange(load);
    return () => { cancelled = true; off(); };
  }, [authUser?.uid]);

  // The type this dog had when we first saw it, not whatever its owner edited it into since.
  const ownType = ownProfile ? computeDogtype(ownProfile) : null;
  const otherCode = profile && otherUid ? effectiveCode(snapshots, otherUid, profile) : null;
  const otherType = otherCode ? dogtypeByCode(otherCode) : null;
  const entry = otherType ? ledger[otherType.code] : undefined;
  const entryUnseen = !!entry && entry.dogId !== null && entry.dogId === otherUid && !entry.seen;
  // Latch: marking it seen must not flip this card back to "met" while it is on screen.
  useEffect(() => {
    if (!entryUnseen) return;
    setUnseen(true);
    if (authUser?.uid && otherType) markDiscoverySeen(authUser.uid, otherType.code);
  }, [entryUnseen, authUser?.uid, otherType?.code]);

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
      // The match is gone or unreadable (the rules answer permission-denied for
      // both). The match id names both people, so look the other one up: no dog
      // profile means they left; a profile that is still there means the match
      // was removed some other way.
      async function explainMissing(): Promise<Unavailable> {
        const otherId = otherUserIdFromMatchId(matchId, authUser!.uid);
        if (!otherId) return 'unavailable';
        try {
          const dog = await getDoc(doc(db, 'dogs', otherId));
          return dog.exists() ? 'unavailable' : 'left';
        } catch {
          return 'unavailable';
        }
      }
      try {
        let matchSnap;
        try {
          matchSnap = await getDoc(doc(db, 'matches', matchId));
        } catch (error) {
          if ((error as { code?: string }).code === 'permission-denied') {
            const why = await explainMissing();
            if (!cancelled) { setUnavailable(why); setLoading(false); }
            return;
          }
          throw error;
        }
        if (!matchSnap.exists()) {
          const why = await explainMissing();
          if (!cancelled) { setUnavailable(why); setLoading(false); }
          return;
        }
        const match = matchSnap.data() as MatchDoc;
        if (match.dog1UserId !== authUser.uid && match.dog2UserId !== authUser.uid) {
          if (!cancelled) { setUnavailable('unavailable'); setLoading(false); }
          return;
        }
        const otherUserId = match.dog1UserId === authUser.uid ? match.dog2UserId : match.dog1UserId;
        if (!cancelled) setOtherUid(otherUserId);
        const dogSnap = await getDoc(doc(db, 'dogs', otherUserId));
        if (!cancelled) {
          if (dogSnap.exists()) {
            const data = dogSnap.data() as SavedDogProfile;
            setProfile(data);
            const realPhotos = getRenderablePhotos(data.photos);
            const hero = resolveHeroIndex(data);
            setActivePhoto(typeof hero === 'number' && hero >= 0 && hero < realPhotos.length ? hero : 0);
          } else {
            // The match is still here but their profile is gone: they left.
            setUnavailable('left');
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setUnavailable('error'); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [authUser, matchId]);

  // `loading` only ever flips off inside the authed fetch above, so for a
  // signed-out visitor it stays true — gate on it only once there's a user,
  // or the sign-in prompt below is unreachable and the page spins forever.
  if (authLoading || (authUser && loading)) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <SignInGate title="Sign in to view this profile" />
    );
  }

  if (unavailable === 'left') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-5xl" aria-hidden="true">👋</span>
        <h1 className="font-display text-2xl text-brown">This dog parent has left GoDoggyDate</h1>
        <p className="max-w-xs text-sm leading-relaxed text-brown-mid">
          They’re no longer on GoDoggyDate, so this profile isn’t available any more.
        </p>
        <Link href="/app/matches" className="btn-primary px-8 py-3">Back to Matches</Link>
      </div>
    );
  }

  if (unavailable !== null || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-4xl">😕</span>
        <p className="font-display text-2xl text-brown">
          {unavailable === 'error' || unavailable === null ? 'Couldn’t load this profile' : 'This profile isn’t available'}
        </p>
        <Link href="/app/matches" className="btn-primary px-8 py-3">Back to Matches</Link>
      </div>
    );
  }

  const photos = getRenderablePhotos(profile.photos);
  const safeActive = photos.length > 0 ? Math.min(activePhoto, photos.length - 1) : 0;
  const vibeCheck = profile.ai?.vibeCheck;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-sky/95 backdrop-blur px-4 h-14 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-2xl text-brown-mid hover:text-brown transition-colors"
          aria-label="Back"
        >
          ←
        </button>
        <span className="min-w-0 font-display text-lg text-brown truncate">{profile.name}&apos;s profile</span>
        {otherUid && (
          <ReportProfileMenu
            targetUserId={otherUid}
            matchId={matchId}
            className="relative ml-auto"
            onBlocked={() => router.replace('/app/matches')}
          />
        )}
      </header>

      <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-5">
        {/* Hero photo — tap to advance, looping back to the first after the
            last (mirrors the discover swipe card's tap-to-cycle). */}
        <button
          type="button"
          onClick={() => photos.length > 1 && setActivePhoto((i) => (i + 1) % photos.length)}
          disabled={photos.length <= 1}
          aria-label={photos.length > 1 ? `Photo ${safeActive + 1} of ${photos.length}. Tap for next.` : undefined}
          className="relative rounded-[2rem] overflow-hidden bg-note text-brown aspect-square flex items-center justify-center w-full text-left"
        >
          {photos[safeActive] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[safeActive]} alt={profile.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-8xl">🐕</span>
          )}
          {photos.length > 1 && (
            <div className="absolute top-4 left-4 right-4 flex gap-1.5">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i === safeActive ? 'bg-cream' : 'bg-white/40'}`}
                />
              ))}
            </div>
          )}
        </button>

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
                  i === safeActive ? 'border-brown ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
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
          <p className="font-display text-3xl text-brown leading-tight [overflow-wrap:anywhere]">{profile.name}</p>
          <p className="text-sm text-brown-mid mt-1 [overflow-wrap:anywhere]">
            {[profile.breed, profile.age, profile.size, profile.location].filter(Boolean).join(' · ')}
          </p>
          {typeof profile.foundingPackNumber === 'number' && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-note px-3 py-1.5 text-xs font-bold text-brown">
              {foundingBadgeLabel(profile.foundingPackNumber)}
            </span>
          )}
        </div>

        {/* Dogtype: this dog's type and how it gets along with yours. Only ever a dog you've matched. */}
        {ownType && otherType && profile && (
          <DogtypeRevealCard
            ownName={ownProfile?.name?.trim() || 'Your dog'}
            ownCode={ownType.code}
            otherName={profile.name}
            otherCode={otherType.code}
            discovered={discoveredCount(ledger, ownType.code, ownRevealed)}
            variant={ownType.code === otherType.code ? 'same' : unseen ? 'new' : 'met'}
            showTease={unseen}
            sealed={ownType.code === otherType.code && !ownRevealed}
          />
        )}

        {/* Vibe Check: archetype type card + bio + Mutt Meter (breed guess) */}
        {profile.bio?.trim() && (
          <div className="px-1">
            <p className="text-xs font-bold text-brown-mid mb-0.5">About {profile.name}</p>
            <p className="text-sm leading-relaxed text-brown whitespace-pre-line [overflow-wrap:anywhere]">{profile.bio.trim()}</p>
          </div>
        )}
        {vibeCheck && (
          <div className="flex flex-col gap-3">
            <VibeTypeCard archetype={vibeCheck.archetype} />
            {/* The owner's own About line replaces the AI line when there is one. */}
            {vibeCheck.bio && !profile.bio?.trim() && (
              <div className="px-1">
                <p className="text-xs font-bold text-brown-mid mb-0.5">
                  ✨ Written by AI from their photos
                </p>
                <p className="text-sm italic leading-relaxed text-brown-mid [overflow-wrap:anywhere]">
                  “{vibeCheck.bio}”
                </p>
              </div>
            )}
            {vibeCheck.breedGuess && (
              <p className="text-xs text-brown-mid px-1">
                🔍 AI&apos;s read: {vibeCheck.breedGuess.name} · {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
              </p>
            )}
          </div>
        )}

        {/* Temperament + play style */}
        {(profile.temperament?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold text-brown-mid mb-2">Temperament</p>
            <div className="flex flex-wrap gap-2">
              {uniqueTemperament(profile.temperament!).map((t) => (
                <span key={t} className="rounded-full bg-cream border-2 border-brown px-3 py-1.5 text-sm text-brown">{t}</span>
              ))}
            </div>
          </div>
        )}
        {(profile.playStyles?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold text-brown-mid mb-2">Play style</p>
            <div className="flex flex-wrap gap-2">
              {profile.playStyles!.map((p) => (
                <span key={p} className="rounded-full bg-cream border-2 border-brown px-3 py-1.5 text-sm text-brown">{p}</span>
              ))}
            </div>
          </div>
        )}

        <Link href={`/app/messages/${matchId}`} className="btn-primary text-center px-8 py-3.5 mt-2 [overflow-wrap:anywhere]">
          💬 Message {profile.name}
        </Link>
      </div>
    </div>
  );
}
