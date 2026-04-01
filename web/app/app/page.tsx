'use client';
// web/app/app/page.tsx  — Discover tab
// Responsibilities:
//   • Guest mode: unauthenticated visitors browse seed dogs freely
//   • Profile gate: incomplete profile → DogProfileForm overlay
//   • Swipe feed: SwipeStack + MatchModal celebration
// Matches, messages, and profile each live in their own /app/* sub-routes.

import { useState, useEffect } from 'react';
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
import UpgradeModal from '../../components/UpgradeModal';
import SkeletonCard from '../../components/SkeletonCard';
import { buildDiscoverFeed, buildGuestFeed, type DiscoverFeedDog } from '../../lib/discover';

// ── Seed feed ─────────────────────────────────────────────────────────────────
type FeedDog = DiscoverFeedDog;

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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // ── Retention hook ────────────────────────────────────────────────────────
  const [showRetentionHook, setShowRetentionHook] = useState(false);
  const [hasHadFirstMatch,  setHasHadFirstMatch]  = useState(false);

  // ── Stripe checkout return ────────────────────────────────────────────────
  const [checkoutToast, setCheckoutToast] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      setCheckoutToast('Subscription activated! Enjoy unlimited swipes. 🎉');
      // Remove query param without a full reload
      window.history.replaceState({}, '', '/app');
    } else if (checkout === 'cancelled') {
      window.history.replaceState({}, '', '/app');
    }
  }, []);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-cream flex flex-col relative overflow-x-hidden">

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* Upgrade / paywall modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
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

      {/* ── Stripe checkout success toast ───────────────────────────────── */}
      {checkoutToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white rounded-2xl px-5 py-3 flex items-center gap-2 shadow-xl">
          <span className="text-lg">✓</span>
          <p className="text-sm font-semibold">{checkoutToast}</p>
          <button onClick={() => setCheckoutToast(null)} className="ml-2 text-white/70 hover:text-white text-lg leading-none">×</button>
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
              <p className="font-display text-2xl text-brown">Early access is still warming up</p>
              <p className="text-brown-light text-sm max-w-xs">
                We couldn&apos;t find any new dogs right now.
              </p>
              <p className="text-brown-light text-sm max-w-xs">
                Real dogs appear first, with demo dogs filling the gaps when available. Try refreshing soon or invite friends.
              </p>
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
                Refresh Feed
              </button>
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
                <p className="text-xs text-brown-light">
                  Swipe to discover nearby dogs.
                </p>
              </div>
              <SwipeStack
                dogs={activeFeed}
                currentUserId={authUser.uid}
                currentDogId={userDog?.id ?? authUser.uid}
                onMatch={(dog, matchId) => handleMatch(dog as FeedDog, matchId)}
                onEmpty={() => setFeedDepleted(true)}
                onSwipeLimitReached={() => setShowUpgradeModal(true)}
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
