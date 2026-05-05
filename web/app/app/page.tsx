'use client';
// web/app/app/page.tsx  — Discover tab
// Responsibilities:
//   • Guest mode: unauthenticated visitors browse seed dogs freely
//   • Profile gate: incomplete profile → DogProfileForm overlay
//   • Swipe feed: SwipeStack + MatchModal celebration
// Matches, messages, and profile each live in their own /app/* sub-routes.

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  signOutUser,
  getUserDogProfile, saveUserDogProfile,
  toFullProfile, onAuthStateChanged,
  isProfileComplete,
} from '../../lib/auth';
import { getFirebase } from '../../shared/utils/firebase';
import type { User, SavedDogProfile } from '../../lib/auth';
import type { DogProfile } from '../../shared/types';
import DogProfileForm from '../../components/DogProfileForm';
import SwipeStack from '../../components/SwipeStack';
import AuthModal from '../../components/AuthModal';
import MatchModal from '../../components/MatchModal';
import SkeletonCard from '../../components/SkeletonCard';
import { buildDiscoverFeed, buildGuestFeed, type DiscoverFeedDog } from '../../lib/discover';
import { requestApproxLocation } from '../../lib/location';
import { isPubliclyDiscoverable } from '../../../shared/profile';

// ── Seed feed ─────────────────────────────────────────────────────────────────
type FeedDog = DiscoverFeedDog;
const DEFAULT_DISCOVER_RADIUS_MILES = 50;

function formatDensityLine(withinFive: number, withinRadius: number, radiusMiles: number): string {
  if (withinRadius === 0) return `We’ll keep looking within ${radiusMiles} mi`;
  if (withinFive === withinRadius) {
    return `${withinRadius} within ${withinRadius === 1 ? '5 mile' : '5 mi'}`;
  }
  return `${withinFive} within 5 mi · ${withinRadius} within ${radiusMiles} mi`;
}

export default function AppPage() {
  const router = useRouter();

  // ── Auth + profile ────────────────────────────────────────────────────────
  const [authUser,        setAuthUser]        = useState<User | null>(null);
  const [authLoading,     setAuthLoading]     = useState(true);
  const [userDog,         setUserDog]         = useState<DogProfile | null>(null);
  const [savedProfile,    setSavedProfile]    = useState<SavedDogProfile | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileSaving,   setProfileSaving]   = useState(false);
  const [showAuthModal,   setShowAuthModal]   = useState(false);

  // ── Swipe / match ─────────────────────────────────────────────────────────
  const [matchedDog,       setMatchedDog]       = useState<FeedDog | null>(null);
  const [activeMatchId,    setActiveMatchId]    = useState<string | null>(null);
  const [feedDepleted,     setFeedDepleted]     = useState(false);
  const [feedLoading,      setFeedLoading]      = useState(false);
  const [activeFeed,       setActiveFeed]       = useState<FeedDog[]>([]);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // ── Retention hook ────────────────────────────────────────────────────────
  const [showRetentionHook, setShowRetentionHook] = useState(false);
  const [hasHadFirstMatch,  setHasHadFirstMatch]  = useState(false);

  // ── Auth observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Signed out — reset all local state; guest feed effect will reload
        setAuthUser(null);
        setSavedProfile(null);
        setUserDog(null);
        setShowProfileForm(false);
        setMatchedDog(null);
        setActiveMatchId(null);
        setFeedDepleted(false);
        setAuthLoading(false);
        return;
      }

      setAuthUser(user);
      getUserDogProfile(user.uid)
        .then((saved) => {
          if (saved) {
            setSavedProfile(saved);
            setUserDog(toFullProfile(saved, user.uid));
          } else {
            setShowProfileForm(true);
          }
        })
        .catch(() => { /* Firestore unavailable — proceed without profile */ })
        .finally(() => setAuthLoading(false));
    });
    return unsub;
  // router is stable — safe to exclude from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleProfileSaved(saved: SavedDogProfile) {
    if (!authUser) return;
    const safeProfile: SavedDogProfile = {
      ...saved,
      playStyles: Array.isArray(saved.playStyles) ? saved.playStyles : [],
    };
    setProfileSaveError(null);
    setProfileSaving(true);
    try {
      await saveUserDogProfile(authUser.uid, safeProfile);
      setSavedProfile(safeProfile);
      setUserDog(toFullProfile(safeProfile, authUser.uid));
      setShowProfileForm(false);
      setProfileSavedToast(true);
      setTimeout(() => setProfileSavedToast(false), 3000);
      router.replace('/app');
    } catch {
      setProfileSaveError('We could not save your dog profile. Check your connection and try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function refreshDiscoverFeed(nextAuthUser: User, nextUserDog: DogProfile) {
    setFeedLoading(true);
    setFeedDepleted(false);

    try {
      const feed = await buildDiscoverFeed(nextAuthUser.uid, nextUserDog);
      setActiveFeed(feed);
      setFeedDepleted(feed.length === 0);
    } catch {
      setActiveFeed([]);
      setFeedDepleted(true);
    } finally {
      setFeedLoading(false);
    }
  }

  // ── Approximate location capture ───────────────────────────────────────────
  // Mirrors mobile/app/(tabs)/discover.tsx: once per session, if the profile
  // is complete and has no coords yet, request approximate browser location
  // and persist rounded coords to the public dog doc. Without this, mobile
  // users with coords can't see web-created profiles in their radius filter.
  const locationRequestedRef = useRef(false);
  useEffect(() => {
    if (!authUser || !savedProfile) return;
    if (locationRequestedRef.current) return;
    if (!isProfileComplete(savedProfile)) return;
    const alreadyHasCoords =
      typeof savedProfile.lat === 'number' && typeof savedProfile.lng === 'number';
    if (alreadyHasCoords) return;

    locationRequestedRef.current = true;
    requestApproxLocation().then(async (result) => {
      if (result.status !== 'granted' || !result.coords) return;
      const next: SavedDogProfile = {
        ...savedProfile,
        lat: result.coords.lat,
        lng: result.coords.lng,
      };
      try {
        await saveUserDogProfile(authUser.uid, next);
        setSavedProfile(next);
        setUserDog(toFullProfile(next, authUser.uid));
      } catch (error) {
        console.warn('Failed to persist approximate location', error);
      }
    });
  }, [authUser, savedProfile]);

  // ── Feed ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser || !userDog || !isProfileComplete(savedProfile ?? userDog)) return;

    let cancelled = false;
    refreshDiscoverFeed(authUser, userDog)
      .catch(() => { /* handled inside refreshDiscoverFeed */ });

    return () => {
      cancelled = true;
    };
  }, [authUser, userDog, savedProfile]);

  useEffect(() => {
    if (!authUser || !userDog || !isProfileComplete(savedProfile ?? userDog)) return;

    function handleVisibilityRefresh() {
      if (document.visibilityState !== 'visible') return;
      refreshDiscoverFeed(authUser, userDog)
        .catch(() => { /* handled inside refreshDiscoverFeed */ });
    }

    function handleWindowFocus() {
      refreshDiscoverFeed(authUser, userDog)
        .catch(() => { /* handled inside refreshDiscoverFeed */ });
    }

    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [authUser, userDog, savedProfile]);

  // ── Guest feed (no auth) ──────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || authUser) return;
    setActiveFeed(buildGuestFeed());
    setFeedDepleted(false);
  }, [authLoading, authUser]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const profileIsComplete = isProfileComplete(savedProfile ?? (userDog as unknown as SavedDogProfile));
  const dogName           = savedProfile?.name ?? userDog?.name ?? '';
  const feedIncludesDemo  = activeFeed.some((dog) => dog.isDemo);

  // ── SwipeStack callbacks ──────────────────────────────────────────────────
  function handleMatch(dog: FeedDog, matchId: string) {
    setMatchedDog(dog);
    setActiveMatchId(matchId);
    if (!hasHadFirstMatch) {
      setHasHadFirstMatch(true);
      setTimeout(() => setShowRetentionHook(true), 3000);
    }
  }

  function continueAfterMatch() {
    setMatchedDog(null);
    setActiveMatchId(null);
  }

  async function handleSignOut() {
    try { await signOutUser(); } catch { /* ignore */ }
    // State reset + redirect happen via onAuthStateChanged → user=null branch above
  }

  function handleInviteFriend() {
    const shareUrl = 'https://godoggydate.com';
    const message = 'Come join me on GoDoggyDate. It helps dog owners find safer, compatible local playdates.';
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'GoDoggyDate',
        text: message,
        url: shareUrl,
      }).catch(() => { /* user cancelled */ });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(`${message} ${shareUrl}`).catch(() => { /* ignore */ });
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent('Join me on GoDoggyDate')}&body=${encodeURIComponent(`${message}\n\n${shareUrl}`)}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const visibleDogs = activeFeed;
  const visibleWithinFive = visibleDogs.filter(
    (dog) => typeof dog.distanceMiles === 'number' && dog.distanceMiles <= 5,
  ).length;
  const visibleWithinRadius = visibleDogs.filter(
    (dog) =>
      typeof dog.distanceMiles !== 'number' ||
      dog.distanceMiles <= DEFAULT_DISCOVER_RADIUS_MILES,
  ).length;
  const densityLine =
    visibleDogs.length === 0
      ? `We’ll keep looking within ${DEFAULT_DISCOVER_RADIUS_MILES} mi`
      : formatDensityLine(visibleWithinFive, visibleWithinRadius, DEFAULT_DISCOVER_RADIUS_MILES);

  return (
    <div className="min-h-screen w-full bg-cream flex flex-col relative overflow-x-hidden">

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* ── Match celebration (fixed full-screen overlay) ────────────────── */}
      {matchedDog && activeMatchId && (
        <MatchModal
          dog={matchedDog}
          matchId={activeMatchId}
          onKeepSwiping={continueAfterMatch}
        />
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center justify-between">
        <span className="font-display text-xl text-brown">🐾 GoDoggyDate</span>
        {!authLoading && (
          authUser ? (
            <div className="flex items-center gap-2">
              {dogName && (
                <span className="text-xs text-brown-light">Hi, {dogName}&apos;s owner 👋</span>
              )}
              <button
                onClick={handleSignOut}
                className="text-xs text-brown-light hover:text-primary transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-xs bg-primary/10 text-primary font-semibold rounded-full px-3 py-1 hover:bg-primary/20 transition-colors"
            >
              Sign in 🐾
            </button>
          )
        )}
      </header>

      {/* ── Guest sign-in nudge — non-blocking inline banner ────────────── */}
      {!authLoading && !authUser && (
        <div className="mx-4 mt-2 rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-brown-light flex-1 leading-snug">
            Sign in to save your matches and start chatting.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="shrink-0 text-xs font-bold text-primary bg-white/70 hover:bg-white rounded-full px-3 py-1.5 transition-colors"
          >
            Sign in 🐾
          </button>
        </div>
      )}

      {/* ── Visibility warning ────────────────────────────────────────────
          Profile is complete from the owner's view (e.g. ZIP entered) but
          lacks any public-readable location anchor (city/state or coords),
          so other dogs can't discover them. Surfaced once the profile form
          is closed. */}
      {!authLoading &&
        authUser &&
        savedProfile &&
        profileIsComplete &&
        !showProfileForm &&
        !isPubliclyDiscoverable(savedProfile) && (
        <div className="mx-4 mt-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-amber-900 flex-1 leading-snug">
            Other dogs can&apos;t see you yet. Add a city or allow location to be
            discoverable.
          </p>
          <button
            onClick={() => setShowProfileForm(true)}
            className="shrink-0 text-xs font-bold text-amber-900 underline underline-offset-2"
          >
            Edit profile
          </button>
        </div>
      )}

      {/* ── Profile setup overlay ────────────────────────────────────────── */}
      {showProfileForm && authUser && (
        <div className="absolute inset-0 z-30 bg-cream overflow-y-auto pb-20">
          {profileSaveError && (
            <div className="sticky top-0 z-40 mx-auto w-full max-w-md px-4 pt-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                {profileSaveError}
              </div>
            </div>
          )}
          <DogProfileForm
            onSaved={handleProfileSaved}
            saving={profileSaving}
            initialProfile={savedProfile ?? undefined}
          />
        </div>
      )}

      {/* ── First-match celebration toast ────────────────────────────────── */}
      {showRetentionHook && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-80 bg-brown text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-xl">
          <span className="text-2xl shrink-0">🎉</span>
          <p className="text-sm flex-1">You matched. Early access is live tonight, so send a quick hello while they&apos;re active.</p>
          <button
            onClick={() => setShowRetentionHook(false)}
            className="text-white/50 hover:text-white text-xl leading-none shrink-0"
          >×</button>
        </div>
      )}

      {/* ── Profile saved toast ──────────────────────────────────────────── */}
      {profileSavedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white rounded-2xl px-5 py-3 flex items-center gap-2 shadow-xl">
          <span className="text-lg">✓</span>
          <p className="text-sm font-semibold">Profile saved. Swipe right to like, left to pass.</p>
        </div>
      )}

      {/* ── Discover content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex h-full w-full flex-col px-1 sm:px-2 pt-2 pb-0">

          {/* Skeleton while auth + profile resolve */}
          {(authLoading || (authUser && profileIsComplete && feedLoading)) && (
            <div className="relative flex-1 min-h-[82vh]">
              <SkeletonCard />
            </div>
          )}

          {/* Profile incomplete gate — only shown after auth fully resolved */}
          {!authLoading && authUser && !profileIsComplete && (
            <div className="flex flex-1 flex-col items-center justify-center py-16 gap-4 text-center px-4">
              <span className="text-6xl">🐾</span>
              <p className="font-display text-2xl text-brown">
                Complete your profile to start swiping
              </p>
              <p className="text-brown-light text-sm max-w-xs">
                Add your dog&apos;s breed, age, neighbourhood,
                and at least one personality tag.
              </p>
              <button
                onClick={() => setShowProfileForm(true)}
                className="btn-primary px-8 py-3"
              >
                Complete Profile
              </button>
            </div>
          )}

          {/* Feed depleted */}
          {!authLoading && authUser && profileIsComplete && feedDepleted && (
            <div className="flex flex-1 flex-col items-center justify-center py-24 gap-4 text-center px-4">
              <span className="text-6xl">🐾</span>
              <p className="font-display text-2xl text-brown">That&apos;s everyone for now</p>
              <p className="text-brown-light text-sm max-w-xs leading-relaxed">
                We&apos;ll keep looking for new dogs within {DEFAULT_DISCOVER_RADIUS_MILES} miles.
              </p>
              <p className="text-brown-light text-sm max-w-xs leading-relaxed">
                Real dogs appear first, with demo dogs filling the gaps when available. Invite a dog parent or check back soon to see who joins next.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (authUser && userDog) {
                      refreshDiscoverFeed(authUser, userDog)
                        .catch(() => { /* handled inside refreshDiscoverFeed */ });
                    }
                  }}
                  className="btn-primary px-8 py-3"
                >
                  Check Again
                </button>
                <button
                  type="button"
                  onClick={handleInviteFriend}
                  className="rounded-full border border-primary/20 bg-white px-8 py-3 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5"
                >
                  Invite a Dog Parent
                </button>
              </div>
            </div>
          )}

          {/* Early-access notice — shown while demo profiles remain in the feed */}
          {!authLoading && !feedLoading && authUser && profileIsComplete && !feedDepleted && feedIncludesDemo && (
            <div className="mx-auto w-full max-w-sm mb-2 px-1">
              <div className="flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5">
                <span className="text-xs font-semibold text-primary shrink-0">🐾 Early Access</span>
                <span className="text-xs text-brown-light leading-tight">
                  Real dogs appear first. Demo profiles fill the gaps while more owners join.
                </span>
              </div>
            </div>
          )}

          {/* Swipe feed — authenticated */}
          {!authLoading && !feedLoading && authUser && profileIsComplete && !feedDepleted && (
            <>
              <div className="mx-auto w-full max-w-sm mb-2 px-2 text-center">
                <p className="text-xs font-medium text-brown-light">
                  {densityLine}
                </p>
                <p className="mt-1 text-[11px] text-brown-light/80">
                  Swipe to discover nearby dogs and open a match when you&apos;re ready to say hello.
                </p>
              </div>
              <SwipeStack
                dogs={activeFeed}
                currentUserId={authUser.uid}
                currentDogId={userDog?.id ?? authUser.uid}
                onMatch={(dog, matchId) => handleMatch(dog as FeedDog, matchId)}
                onEmpty={() => setFeedDepleted(true)}
              />
            </>
          )}

          {/* Swipe feed — guest browsing (swipes not recorded) */}
          {!authLoading && !feedLoading && !authUser && !feedDepleted && activeFeed.length > 0 && (
            <SwipeStack
              dogs={activeFeed}
              currentUserId="__guest__"
              currentDogId="__guest__"
              onMatch={() => {}}
              onEmpty={() => setFeedDepleted(true)}
              isGuest
              onRequireAuthForLike={() => setShowAuthModal(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
