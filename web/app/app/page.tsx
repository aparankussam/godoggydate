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
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../shared/utils/firebase';
import { calculateCompatibility } from '../../../shared/utils/matchingEngine';
import type { User, SavedDogProfile } from '../../lib/auth';
import type { DogProfile } from '../../../shared/types';
import DogProfileForm from '../../components/DogProfileForm';
import SwipeStack from '../../components/SwipeStack';
import AuthModal from '../../components/AuthModal';
import MatchModal from '../../components/MatchModal';
import SkeletonCard from '../../components/SkeletonCard';
import { trackEvent } from '../../lib/analytics';
import { buildDiscoverFeed, buildDemoGalleryDogs, type DiscoverFeedDog } from '../../lib/discover';
import DemoGalleryGrid from '../../components/DemoGalleryGrid';
import { requestApproxLocation } from '../../lib/location';
import { isPubliclyDiscoverable } from '../../../shared/profile';
import DogTradingCard from '../../components/DogTradingCard';
import TodayPanel from '../../components/TodayPanel';
import { shareOrDownloadCard } from '../../lib/shareCard';
import { toDogSlug } from '../../lib/dogSlug';

// ── Seed feed ─────────────────────────────────────────────────────────────────
type FeedDog = DiscoverFeedDog;
const DEFAULT_DISCOVER_RADIUS_MILES = 50;

// Every dog in the deck lands in exactly one bucket, so the line can only ever
// under-describe the deck — never claim a proximity it didn't measure.
interface DensityCounts {
  withinFive: number;
  withinRadius: number;
  beyondRadius: number;
  unknownDistance: number;
}

function formatDensityLine(counts: DensityCounts, radiusMiles: number): string {
  const parts: string[] = [];
  if (counts.withinFive > 0) parts.push(`${counts.withinFive} within 5 mi`);
  if (counts.withinRadius > counts.withinFive) {
    parts.push(`${counts.withinRadius} within ${radiusMiles} mi`);
  }
  if (counts.beyondRadius > 0) parts.push(`${counts.beyondRadius} farther out`);
  // A dog with no shared coordinates isn't "nearby" — we don't know where it
  // is. It used to be folded into the within-50-mi count, which told people
  // there were dogs in their radius that the app had never located.
  if (counts.unknownDistance > 0) {
    parts.push(`${counts.unknownDistance} at an unknown distance`);
  }
  if (parts.length === 0) return `We’ll keep looking within ${radiusMiles} mi`;
  return parts.join(' · ');
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
  const [sharingRecruitCard, setSharingRecruitCard] = useState(false);
  const recruitCardRef = useRef<HTMLDivElement>(null);

  // ── Swipe / match ─────────────────────────────────────────────────────────
  const [matchedDog,       setMatchedDog]       = useState<FeedDog | null>(null);
  const [activeMatchId,    setActiveMatchId]    = useState<string | null>(null);
  const [feedDepleted,     setFeedDepleted]     = useState(false);
  const [feedLoading,      setFeedLoading]      = useState(false);
  const [activeFeed,       setActiveFeed]       = useState<FeedDog[]>([]);
  const [lastCheckedAt,    setLastCheckedAt]    = useState<number | null>(null);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [showDemoGallery,  setShowDemoGallery]  = useState(false);

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
      // Merge over the existing profile — the form payload carries none of the
      // server-only fields (ai/Vibe Check, lat/lng, trustScore, foundingPackNumber,
      // householdMemberIds), so a wholesale replace would blank them in local
      // state until a reload (empty Vibe Check on cards, distanceMiles = -1 for
      // every dog). Firestore is fine via { merge: true }; this keeps local state
      // in sync. Mirrors the profile page's handler.
      const merged: SavedDogProfile = savedProfile ? { ...savedProfile, ...safeProfile } : safeProfile;
      setSavedProfile(merged);
      setUserDog(toFullProfile(merged, authUser.uid));
      setShowProfileForm(false);
      const completed = isProfileComplete(safeProfile);
      trackEvent('profile_saved', {
        context: savedProfile ? 'discover_edit' : 'discover_onboarding',
        completed,
      });
      if (completed) {
        trackEvent('profile_completed', {
          context: savedProfile ? 'discover_edit' : 'discover_onboarding',
        });
      }
      setProfileSavedToast(true);
      setTimeout(() => setProfileSavedToast(false), 3000);
      router.replace('/app');
    } catch {
      setProfileSaveError('We could not save your dog profile. Check your connection and try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  // Deliberately does NOT clear feedDepleted up front. Clearing it swapped the
  // whole empty state for a skeleton card mid-query, so "Check again" flashed
  // the screen and then returned an identical-looking page — the user couldn't
  // tell a real re-query from a no-op. Leaving the empty state mounted lets the
  // button own its own pending state; the result below sets the flag either way.
  async function refreshDiscoverFeed(nextAuthUser: User, nextUserDog: DogProfile) {
    setFeedLoading(true);

    try {
      const feed = await buildDiscoverFeed(nextAuthUser.uid, nextUserDog);
      setActiveFeed(feed);
      setFeedDepleted(feed.length === 0);
      // Only a completed query counts as a check — a failed one must not be
      // able to render a timestamp claiming we looked.
      setLastCheckedAt(Date.now());
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

  // ── Guest mode (no auth) ──────────────────────────────────────────────────
  // Guests no longer get a swipeable deck of demo dogs — a card that can be
  // liked but never reciprocates is the exact "fake feed" pattern that reads
  // as a lie the moment anyone checks. They see a real empty feed (0 real
  // dogs pre-auth by definition) and can opt into the labeled demo gallery.
  useEffect(() => {
    if (authLoading || authUser) return;
    setActiveFeed([]);
    setFeedDepleted(false);
  }, [authLoading, authUser]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const profileIsComplete = isProfileComplete(savedProfile ?? (userDog as unknown as SavedDogProfile));
  const dogName           = savedProfile?.name ?? userDog?.name ?? '';

  // ── SwipeStack callbacks ──────────────────────────────────────────────────
  // The compat object rides along from feed-build time. The feed rebuilds on
  // mount/visibilitychange/focus but NOT at the moment of the match, so if the
  // other owner changed their vaccination checkbox, energy or size in between,
  // the modal presented stale values as current — including the quality tier,
  // which vaccinated===false flips to 'blocked' on its own. Re-read and
  // recompute before showing it; fall back to the cached compat on any failure.
  async function refreshCompat(dog: FeedDog): Promise<FeedDog> {
    if (dog.isDemo) return dog;
    const ownerId = dog.ownerId ?? dog.firestoreId ?? dog.id;
    if (!ownerId || !userDog) return dog;
    try {
      const { db } = getFirebase();
      const snap = await getDoc(doc(db, 'dogs', ownerId));
      if (!snap.exists()) return dog;
      const fresh = toFullProfile(snap.data() as SavedDogProfile, ownerId);
      return {
        ...dog,
        vaccinated: fresh.vaccinated,
        compat: calculateCompatibility(userDog, fresh, dog.distanceMiles),
      };
    } catch {
      return dog;
    }
  }

  async function handleMatch(dog: FeedDog, matchId: string) {
    const fresh = await refreshCompat(dog);
    setMatchedDog(fresh);
    setActiveMatchId(matchId);
    trackEvent('match_created', {
      match_id: matchId,
      dog_id: fresh.firestoreId ?? fresh.id,
      is_demo: fresh.isDemo,
      compatibility_score: fresh.compat.score,
    });
    // A pairing the engine flagged as a safety mismatch shouldn't get a 🎉
    // retention toast three seconds after the (deliberately sober) match modal.
    if (!hasHadFirstMatch && fresh.compat.quality !== 'blocked') {
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

  // Recruit Card — the empty-deck "Invite" action previously shared a bare
  // text link. Sharing an actual image of the user's own dog (reusing the
  // same Trading Card export as the profile page) is a far stronger ask
  // than plain text, and doubles as free advertising the moment it's posted.
  async function handleShareRecruitCard() {
    if (!recruitCardRef.current || sharingRecruitCard || !authUser || !savedProfile) return;
    setSharingRecruitCard(true);
    trackEvent('recruit_card_share_click');
    try {
      const publicUrl = `${window.location.origin}/d/${toDogSlug(savedProfile.name, authUser.uid)}`;
      const result = await shareOrDownloadCard(
        recruitCardRef.current,
        `${savedProfile.name.toLowerCase().replace(/\s+/g, '-')}-needs-friends.png`,
        { publicUrl, dogName: savedProfile.name },
      );
      trackEvent('recruit_card_shared', { method: result });
    } catch {
      // html2canvas/share failures are non-critical — just let them retry.
    } finally {
      setSharingRecruitCard(false);
    }
  }

  function handleInviteFriend() {
    trackEvent('invite_friend_clicked', {
      source: feedDepleted ? 'empty_state' : 'discover',
    });
    const shareUrl = 'https://godoggydate.com';
    const message = 'My dog needs friends and honestly so do I.';
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
  // distanceMiles uses -1 as a sentinel for "no coordinates on one side, so
  // distance is unknown" (see milesBetween in lib/discover.ts). -1 is still a
  // number and is still <= 5, so an unknown distance was being counted as
  // "within 5 miles" — telling a user there were dogs a few blocks away when
  // the app had no idea where those dogs were.
  const hasKnownDistance = (miles: number) => typeof miles === 'number' && miles >= 0;
  const visibleDogs = activeFeed;
  const locatedDogs = visibleDogs.filter((dog) => hasKnownDistance(dog.distanceMiles));
  const densityCounts: DensityCounts = {
    withinFive: locatedDogs.filter((dog) => dog.distanceMiles <= 5).length,
    withinRadius: locatedDogs.filter(
      (dog) => dog.distanceMiles <= DEFAULT_DISCOVER_RADIUS_MILES,
    ).length,
    beyondRadius: locatedDogs.filter(
      (dog) => dog.distanceMiles > DEFAULT_DISCOVER_RADIUS_MILES,
    ).length,
    unknownDistance: visibleDogs.length - locatedDogs.length,
  };
  const densityLine = formatDensityLine(densityCounts, DEFAULT_DISCOVER_RADIUS_MILES);
  const lastCheckedLabel =
    lastCheckedAt === null
      ? null
      : new Date(lastCheckedAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });

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
          <p className="text-sm flex-1">Mutual woof! Say hi first — someone has to, and dogs can&apos;t type.</p>
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

          {/* Skeleton while auth + profile resolve. Suppressed once we already
              know the feed is empty — that state re-queries in place instead of
              replacing itself with a loading card. */}
          {(authLoading || (authUser && profileIsComplete && feedLoading && !feedDepleted)) && (
            <div className="relative flex-1 min-h-[82vh]">
              <SkeletonCard />
            </div>
          )}

          {/* Profile incomplete gate — only shown after auth fully resolved */}
          {!authLoading && authUser && !profileIsComplete && (
            <div className="flex flex-1 flex-col items-center justify-center py-16 gap-4 text-center px-4">
              <span className="text-6xl">🐾</span>
              <p className="font-display text-2xl text-brown">
                Your dog can&apos;t make friends without a profile
              </p>
              <p className="text-brown-light text-sm max-w-xs">
                Add your dog&apos;s breed, age, neighborhood,
                and at least one personality tag.
              </p>
              <button
                onClick={() => setShowProfileForm(true)}
                className="btn-primary px-8 py-3"
              >
                Finish the profile
              </button>
            </div>
          )}

          {/* Feed depleted — no real dogs nearby right now. Used to silently
              recycle all 15 (mostly photoless) seed dogs back into the
              swipeable deck here; that taught the "Check Again" button to
              produce the exact same fake results every time. Now honest:
              real feed stays empty, and the demo gallery is opt-in and
              clearly labeled instead of auto-injected. */}
          {!authLoading && authUser && profileIsComplete && feedDepleted && (
            <div className="flex flex-1 flex-col items-center justify-center py-16 gap-4 text-center px-4">
              {/* Today — reminders, profile gaps, the things that are true for
                  THIS dog right now. Renders null when there's nothing real to
                  say, so an idle account still falls through to the empty
                  state below rather than reading a made-up feed. */}
              <TodayPanel
                dogId={authUser.uid}
                savedProfile={savedProfile}
                variant="full"
                onEditProfile={() => setShowProfileForm(true)}
              />

              <span className="text-6xl">🐾</span>
              <p className="font-display text-2xl text-brown">No dogs nearby yet</p>
              <p className="text-brown-light text-sm max-w-xs leading-relaxed">
                You might be the first dog parent in your neighborhood. We re-check every time
                you open this tab.
              </p>

              {/* Recruit Card — the actual growth lever here is a stranger
                  seeing this dog's card and wanting one for their own, not a
                  bare text link. Same Trading Card export the profile page
                  uses, framed as an invitation instead of an identity card. */}
              {savedProfile && (
                <>
                  <p className="text-brown-light text-sm max-w-xs leading-relaxed">
                    {dogName}{savedProfile.ai?.vibeCheck?.archetype.name ? ` (a ${savedProfile.ai.vibeCheck.archetype.name})` : ''} is the first dog here — be their first friend.
                  </p>
                  <div className="scale-[0.85] origin-top -mb-8">
                    <DogTradingCard profile={savedProfile} innerRef={recruitCardRef} />
                  </div>
                  <button
                    type="button"
                    onClick={handleShareRecruitCard}
                    disabled={sharingRecruitCard}
                    className="btn-primary px-8 py-3 disabled:opacity-60"
                  >
                    {sharingRecruitCard ? 'Preparing…' : `Share ${dogName}'s Card`}
                  </button>
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                {/* Genuine re-query: buildDiscoverFeed re-reads the dogs
                    collection every call (no cached candidate list). The
                    button used to be indistinguishable from a no-op, so it now
                    reports when the last query actually completed — the only
                    honest answer when nothing changed. */}
                <button
                  type="button"
                  disabled={feedLoading}
                  onClick={() => {
                    if (authUser && userDog) {
                      refreshDiscoverFeed(authUser, userDog)
                        .catch(() => { /* handled inside refreshDiscoverFeed */ });
                    }
                  }}
                  className="rounded-full border border-primary/20 bg-white px-8 py-3 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-60"
                >
                  {feedLoading ? 'Checking…' : 'Check again'}
                </button>
                <button
                  type="button"
                  onClick={handleInviteFriend}
                  className="rounded-full border border-primary/20 bg-white px-8 py-3 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5"
                >
                  Invite a Dog Parent
                </button>
              </div>
              {lastCheckedLabel && (
                <p className="text-[11px] text-brown-light/80">
                  Last checked {lastCheckedLabel}
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowDemoGallery((v) => !v)}
                className="mt-2 text-xs font-semibold text-brown-light hover:text-brown transition-colors underline underline-offset-2"
              >
                {showDemoGallery ? 'Hide demo' : 'See how matching works (demo)'}
              </button>
              {showDemoGallery && (
                <div className="mt-2 w-full">
                  <DemoGalleryGrid
                    dogs={buildDemoGalleryDogs(userDog ?? undefined)}
                    againstDogName={userDog?.name}
                  />
                </div>
              )}
            </div>
          )}

          {/* Swipe feed — authenticated */}
          {!authLoading && !feedLoading && authUser && profileIsComplete && !feedDepleted && (
            <>
              {/* Same panel, one line: above a live deck only something already
                  due (overdue or today) earns space — swiping is the job here,
                  and a profile nudge can wait for the empty state. */}
              <TodayPanel
                dogId={authUser.uid}
                savedProfile={savedProfile}
                variant="strip"
                onEditProfile={() => setShowProfileForm(true)}
              />
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

          {/* Guest (signed out) — previously a swipeable deck of the same 15
              seed dogs handed to every visitor, likeable but unable to ever
              reciprocate: a card that "matches" pre-auth and can't actually
              match is the exact fake-feed pattern this audience checks for
              first. Sign-up prompt + an explicitly opt-in, non-swipeable
              demo instead. */}
          {!authLoading && !feedLoading && !authUser && (
            <div className="flex flex-1 flex-col items-center justify-center py-16 gap-4 text-center px-4">
              <span className="text-6xl">🐾</span>
              <p className="font-display text-2xl text-brown">See who&apos;s nearby</p>
              <p className="text-brown-light text-sm max-w-xs leading-relaxed">
                Sign up to see real dogs near you and start matching.
              </p>
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="btn-primary px-8 py-3 shadow-lg"
              >
                Sign up free
              </button>
              <button
                type="button"
                onClick={() => setShowDemoGallery((v) => !v)}
                className="mt-2 text-xs font-semibold text-brown-light hover:text-brown transition-colors underline underline-offset-2"
              >
                {showDemoGallery ? 'Hide demo' : 'See how matching works (demo)'}
              </button>
              {showDemoGallery && (
                <div className="mt-2 w-full">
                  {/* Signed out: no dog to score against, so let them sketch
                      one and watch the engine re-score live. */}
                  <DemoGalleryGrid dogs={[]} interactive />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
