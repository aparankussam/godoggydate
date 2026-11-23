'use client';
// web/app/app/page.tsx  — Discover tab
// Responsibilities:
//   • Guest mode: unauthenticated visitors browse seed dogs freely
//   • Profile gate: incomplete profile → DogProfileForm overlay
//   • Swipe feed: SwipeStack + MatchModal celebration
// Matches, messages, and profile each live in their own /app/* sub-routes.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
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
import { trackEvent, trackFirstTime } from '../../lib/analytics';
import {
  loadDiscoverDeck,
  buildDemoGalleryDogs,
  discoverCacheAgeMs,
  resetDiscoverCache,
  DEFAULT_DISCOVER_RADIUS_MILES,
  DISCOVER_CACHE_TTL_MS,
  DISCOVER_RADIUS_OPTIONS,
  type DiscoverDeck,
  type DiscoverFeedDog,
} from '../../lib/discover';
import { computeDogtype, type Dogtype } from '../../../shared/dogtype';
import DogtypeReveal from '../../components/DogtypeReveal';
import { getHeroFocus, getHeroPhoto, resolveHeroIndex } from '../../lib/photos';
import { absoluteUrl } from '../../lib/site';
import { enablePushNotifications, isPushConfigured } from '../../lib/push';
import { joinLocalWaitlist, leaveLocalWaitlist, readWaitlistMemo } from '../../lib/waitlist';
import DemoGalleryGrid from '../../components/DemoGalleryGrid';
import { requestApproxLocation } from '../../lib/location';
import { isPubliclyDiscoverable } from '../../../shared/profile';
import DogTradingCard from '../../components/DogTradingCard';
import TodayPanel from '../../components/TodayPanel';
import { shareOrDownloadCard } from '../../lib/shareCard';
import { toDogSlug } from '../../lib/dogSlug';
import { takePendingPackDay } from '../../lib/packDayPending';

// ── Seed feed ─────────────────────────────────────────────────────────────────
type FeedDog = DiscoverFeedDog;

// Every dog in the deck lands in exactly one bucket, so the line can only ever
// under-describe the deck — never claim a proximity it didn't measure.
function describeDensity(deck: DiscoverDeck | null, dogs: FeedDog[]): string {
  if (!deck) return '';
  const near = dogs.filter((d) => d.locality === 'near');
  const withinFive = near.filter((d) => d.distanceMiles <= 5).length;
  const parts: string[] = [];
  if (withinFive > 0) parts.push(`${withinFive} within 5 mi`);
  if (deck.radiusMiles && near.length > withinFive) parts.push(`${near.length} within ${deck.radiusMiles} mi`);
  // A dog we can't measure isn't "nearby": say the only thing we know, the place.
  const sameCity = dogs.filter((d) => d.locality === 'city').length;
  const sameState = dogs.filter((d) => d.locality === 'state').length;
  if (sameCity > 0) parts.push(`${sameCity} in ${deck.viewerCity ?? 'your city'}`);
  if (sameState > 0) parts.push(`${sameState} elsewhere in ${deck.viewerState ?? 'your state'}`);
  return parts.join(' · ');
}

/** "within 50 mi" / "in MT": where "near you" was actually measured. Never "nearby" on less. */
function describeRange(deck: DiscoverDeck | null): string {
  if (!deck) return 'near you';
  if (deck.scope === 'radius' && deck.radiusMiles) return `within ${deck.radiusMiles} mi`;
  if (deck.viewerState) return `in ${deck.viewerState}`;
  return 'near you';
}

const RADIUS_KEY = 'gdd.discover.radius';

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
  // The last non-background query failed (offline etc.) — the empty state says
  // so instead of claiming the neighborhood is quiet.
  const [feedError,        setFeedError]        = useState(false);
  const [activeFeed,       setActiveFeed]       = useState<FeedDog[]>([]);
  // The deck's counts (how many dogs are in range, how many already seen, ...). Null
  // until the FIRST query finishes: until then the page shows the skeleton, never a
  // density line or an empty state computed from nothing.
  const [deck,             setDeck]             = useState<DiscoverDeck | null>(null);
  const [lastCheckedAt,    setLastCheckedAt]    = useState<number | null>(null);
  const [radiusMiles,      setRadiusMiles]      = useState<number>(DEFAULT_DISCOVER_RADIUS_MILES);
  const [locationNote,     setLocationNote]     = useState<string | null>(null);
  const [locationBusy,     setLocationBusy]     = useState(false);
  // First-time onboarding payoff: the Dogtype reveal right after the first save.
  const [reveal,           setReveal]           = useState<{ dogtype: Dogtype; name: string; photo?: string; focus?: string } | null>(null);
  // Local waitlist ("tell me when neighbors join")
  const [waitlist,         setWaitlist]         = useState<{ city: string; position: number } | null>(null);
  const [waitlistBusy,     setWaitlistBusy]     = useState(false);
  const [waitlistNote,     setWaitlistNote]     = useState<string | null>(null);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [showDemoGallery,  setShowDemoGallery]  = useState(false);

  // ── Retention hook ────────────────────────────────────────────────────────
  const [showRetentionHook, setShowRetentionHook] = useState(false);
  const [hasHadFirstMatch,  setHasHadFirstMatch]  = useState(false);

  const backgroundRefreshRef = useRef(false);
  const activeFeedRef = useRef<FeedDog[]>([]);
  activeFeedRef.current = activeFeed;
  // Has a deck been built yet? After that, rebuilds are quiet (no skeleton).
  const deckBuiltRef = useRef(false);
  const radiusRef = useRef(radiusMiles);
  radiusRef.current = radiusMiles;

  // The radius is a per-person convenience, remembered in this browser only.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(RADIUS_KEY));
      if ((DISCOVER_RADIUS_OPTIONS as readonly number[]).includes(saved)) setRadiusMiles(saved);
    } catch { /* storage blocked: the default stays */ }
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
        setDeck(null);
        setActiveFeed([]);
        deckBuiltRef.current = false;
        resetDiscoverCache();
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
      const isFirstSave = !savedProfile;
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
      // The promised payoff: the first time a profile is saved complete, show the
      // Dogtype reveal (share-first) before anything else. Later edits don't repeat it.
      const dogtype = isFirstSave && completed ? computeDogtype(merged) : null;
      if (dogtype) {
        setReveal({
          dogtype,
          name: merged.name,
          photo: getHeroPhoto(merged.photos, resolveHeroIndex(merged)) ?? undefined,
          focus: getHeroFocus(merged),
        });
      } else {
        flashSavedToast();
      }
      // A new member who arrived from a shared Pack Day goes back to it now
      // that they have a dog to RSVP with.
      const pendingPackDay = completed ? takePendingPackDay() : null;
      router.replace(pendingPackDay ? `/app/pack/${pendingPackDay}` : '/app');
    } catch {
      setProfileSaveError('We could not save your dog profile. Check your connection and try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  // At the bottom of the screen, not the top: at the top it sat right over the
  // "Other dogs can't see you yet" notice for the three seconds a person was most
  // likely to be reading it.
  function flashSavedToast() {
    setProfileSavedToast(true);
    setTimeout(() => setProfileSavedToast(false), 4000);
  }

  // Deliberately does NOT clear feedDepleted up front. Clearing it swapped the
  // whole empty state for a skeleton card mid-query, so "Check again" flashed
  // the screen and then returned an identical-looking page — the user couldn't
  // tell a real re-query from a no-op. Leaving the empty state mounted lets the
  // button own its own pending state; the result below sets the flag either way.
  //
  // `background` is the window-focus / tab-visible refresh. It must not tear
  // down what the person is looking at: no skeleton card (that unmounted the
  // swipe stack and closed the details sheet every time they clicked back into
  // the window), no replacing the deck when nothing changed, and no wiping it
  // when the query fails — a dropped connection used to turn the deck into
  // "The neighborhood's still quiet".
  //
  // Reads are bounded (see lib/discover.ts): the dogs are queried by state and
  // reused for DISCOVER_CACHE_TTL_MS, so rebuilding the deck here costs no reads
  // unless that window has passed or the person explicitly asks (`force`).
  async function refreshDiscoverFeed(
    nextAuthUser: User,
    nextUserDog: DogProfile,
    { background = false, force = false }: { background?: boolean; force?: boolean } = {},
  ) {
    if (background) {
      if (backgroundRefreshRef.current) return; // visibilitychange + focus fire together
      backgroundRefreshRef.current = true;
    } else if (!deckBuiltRef.current || force) {
      // Only the first build, or a person pressing "Check again", shows progress.
      // Every later rebuild (radius change, a saved profile, coordinates arriving)
      // happens quietly under the card they're looking at.
      setFeedLoading(true);
    }

    try {
      // A press of "Check again" inside a minute of the last real read reuses it: the
      // dog list can't have changed meaningfully, and hammering the button must not
      // become hammering the database.
      const reallyForce = force && discoverCacheAgeMs() > 60 * 1000;
      const nextDeck = await loadDiscoverDeck(nextAuthUser.uid, nextUserDog, {
        radiusMiles: radiusRef.current,
        city: savedProfile?.city,
        state: savedProfile?.state,
        force: reallyForce,
      });
      const feed = nextDeck.dogs;
      const current = activeFeedRef.current;
      const unchanged =
        feed.length === current.length && feed.every((dog, i) => dog.id === current[i].id);
      if (!(background && unchanged)) setActiveFeed(feed);
      setDeck(nextDeck);
      deckBuiltRef.current = true;
      setFeedDepleted(feed.length === 0);
      setFeedError(false);
      // Only a completed query counts as a check — a failed one must not be
      // able to render a timestamp claiming we looked.
      setLastCheckedAt(nextDeck.fetchedAt);
    } catch {
      if (!background && !deckBuiltRef.current) {
        setActiveFeed([]);
        setFeedDepleted(true);
        setFeedError(true);
        // The first query failed: say so instead of showing a skeleton forever.
        setDeck(null);
        deckBuiltRef.current = true;
      } else if (!background) {
        // A later explicit check failed: keep the deck, say so.
        setFeedError(true);
      }
    } finally {
      if (background) backgroundRefreshRef.current = false;
      else setFeedLoading(false);
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
  // Builds the deck on mount and whenever the profile or the radius changes. The dog
  // list itself comes from a 10-minute cache (lib/discover.ts), so this is cheap
  // after the first build, and every rebuild after it is quiet: it never swaps the
  // deck for a skeleton.
  useEffect(() => {
    if (!authUser || !userDog || !isProfileComplete(savedProfile ?? userDog)) return;

    refreshDiscoverFeed(authUser, userDog)
      .catch(() => { /* handled inside refreshDiscoverFeed */ });
  // refreshDiscoverFeed is re-created every render; the inputs that matter are listed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, userDog, savedProfile, radiusMiles]);

  // Coming back to the tab or window re-checks only once the 10-minute window has
  // passed. Inside it, focus and visibility do nothing at all: no query, no state
  // change, so the card you were on (and an open details sheet) stay exactly as they are.
  useEffect(() => {
    if (!authUser || !userDog || !isProfileComplete(savedProfile ?? userDog)) return;

    function handleReturn() {
      if (document.visibilityState !== 'visible') return;
      if (discoverCacheAgeMs() < DISCOVER_CACHE_TTL_MS) return;
      refreshDiscoverFeed(authUser as User, userDog as DogProfile, { background: true })
        .catch(() => { /* handled inside refreshDiscoverFeed */ });
    }

    document.addEventListener('visibilitychange', handleReturn);
    window.addEventListener('focus', handleReturn);

    return () => {
      document.removeEventListener('visibilitychange', handleReturn);
      window.removeEventListener('focus', handleReturn);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        rabiesExpiry: fresh.rabiesExpiry,
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
    // Once per account: the activation funnel counts the first match ever.
    trackFirstTime(authUser?.uid, 'first_match', 'first_match', {
      match_id: matchId,
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

  const [inviteNote, setInviteNote] = useState<string | null>(null);

  // The share text names the dog and the city (both already public on the card) and
  // links to the quiz with ?ref=invite. Nothing about the sender's account goes in the
  // link: no uid, no profile id.
  function handleInviteFriend() {
    trackEvent('invite_friend_clicked', {
      source: feedDepleted ? 'empty_state' : 'discover',
    });
    const shareUrl = absoluteUrl('/quiz?ref=invite');
    const who = dogName || 'My dog';
    const city = savedProfile?.city?.trim();
    const message = city
      ? `${who} is looking for dog friends in ${city}. What's your dog's Dogtype? Take the quiz 🐾`
      : `${who} is looking for dog friends. What's your dog's Dogtype? Take the quiz 🐾`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'GoDoggyDate',
        text: message,
        url: shareUrl,
      }).then(() => trackEvent('invite_shared', { method: 'share', source: feedDepleted ? 'empty_state' : 'discover' }))
        .catch(() => { /* user cancelled */ });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(`${message} ${shareUrl}`)
        .then(() => {
          trackEvent('invite_shared', { method: 'copy', source: feedDepleted ? 'empty_state' : 'discover' });
          setInviteNote('Invite copied. Paste it into a text or a post.');
          setTimeout(() => setInviteNote(null), 4000);
        })
        .catch(() => { /* ignore */ });
      return;
    }
    trackEvent('invite_shared', { method: 'email', source: feedDepleted ? 'empty_state' : 'discover' });
    window.location.href = `mailto:?subject=${encodeURIComponent('Join me on GoDoggyDate')}&body=${encodeURIComponent(`${message}\n\n${shareUrl}`)}`;
  }

  // Distances need coordinates on both sides. Ask for them on purpose (a button), not
  // only once per session in the background: someone who dismissed the prompt can
  // still choose to share an approximate location later.
  async function handleUseLocation() {
    if (!authUser || !savedProfile || locationBusy) return;
    setLocationBusy(true);
    setLocationNote(null);
    const result = await requestApproxLocation();
    if (result.status === 'granted' && result.coords) {
      const next: SavedDogProfile = { ...savedProfile, lat: result.coords.lat, lng: result.coords.lng };
      try {
        await saveUserDogProfile(authUser.uid, next);
        setSavedProfile(next);
        setUserDog(toFullProfile(next, authUser.uid));
      } catch {
        setLocationNote('We couldn’t save your location. Try again.');
      }
    } else {
      setLocationNote(
        result.status === 'denied'
          ? 'Location is blocked for this site. Allow it in your browser settings to see distances; until then we match by city.'
          : 'This browser couldn’t work out where you are. We’ll keep matching by city.',
      );
    }
    setLocationBusy(false);
  }

  function changeRadius(miles: number) {
    setRadiusMiles(miles);
    try { window.localStorage.setItem(RADIUS_KEY, String(miles)); } catch { /* per-person convenience only */ }
    trackEvent('discover_radius_changed', { miles });
  }

  // "Tell me when neighbors join": record the waitlist entry server-side, then offer
  // to turn on notifications (the one push is useless without them).
  useEffect(() => {
    if (!authUser) return;
    const memo = readWaitlistMemo(authUser.uid);
    setWaitlist(memo ? { city: memo.city, position: memo.position } : null);
  }, [authUser]);

  async function handleJoinWaitlist() {
    if (!authUser || waitlistBusy) return;
    setWaitlistBusy(true);
    setWaitlistNote(null);
    try {
      const result = await joinLocalWaitlist(authUser.uid);
      setWaitlist({ city: result.city, position: result.position });
      trackEvent('waitlist_joined', { position: result.position, already: result.alreadyJoined });
      let pushNote: string;
      if (!isPushConfigured() || typeof Notification === 'undefined') {
        pushNote = 'Notifications aren’t available in this browser, so check back here.';
      } else if (Notification.permission === 'denied') {
        pushNote = 'Notifications are blocked for this site, so check back here. You can allow them in your browser settings.';
      } else {
        const enabled = await enablePushNotifications(authUser.uid).catch(() => false);
        pushNote = enabled
          ? 'We’ll send one notification when a neighbor joins.'
          : 'Notifications are off, so check back here.';
      }
      setWaitlistNote(pushNote);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setWaitlistNote(
        /city and state/i.test(message)
          ? 'Add a city and state to your dog’s profile first, so we know where to look.'
          : 'We couldn’t add you just now. Check your connection and try again.',
      );
    } finally {
      setWaitlistBusy(false);
    }
  }

  async function handleLeaveWaitlist() {
    if (waitlistBusy) return;
    setWaitlistBusy(true);
    try {
      await leaveLocalWaitlist();
      setWaitlist(null);
      setWaitlistNote(null);
    } catch {
      setWaitlistNote('We couldn’t take you off the list just now. Try again.');
    } finally {
      setWaitlistBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const visibleDogs = activeFeed;
  const densityLine = describeDensity(deck, visibleDogs);
  const rangeText = describeRange(deck);
  const lastCheckedLabel =
    lastCheckedAt === null
      ? null
      : new Date(lastCheckedAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });

  // The empty deck says which kind of empty it is: nobody here yet, or everybody
  // here already swiped. "The neighborhood's still quiet" used to cover both, which
  // told a person who had just seen every dog that none existed.
  const inRange = deck?.inRangeCount ?? 0;
  let emptyHeadline: string;
  let emptyBody: string;
  if (feedError) {
    emptyHeadline = 'We couldn’t check for dogs';
    emptyBody = 'Check your connection and try again.';
  } else if (deck?.scope === 'none') {
    emptyHeadline = 'Where should we look?';
    emptyBody =
      'We can only find neighbors once we know roughly where you are. Add a city and state to your profile, or share your approximate location.';
  } else if (inRange > 0) {
    emptyHeadline = `You’ve seen all ${inRange} ${inRange === 1 ? 'dog' : 'dogs'} ${rangeText}`;
    emptyBody = 'That’s everyone on GoDoggyDate here so far. New dogs show up as they join.';
  } else {
    emptyHeadline = `No dogs ${rangeText} yet`;
    emptyBody = `${dogName || 'Your dog'} might be the first${deck?.viewerCity ? ` in ${deck.viewerCity}` : ''}. Here’s what you can do while the neighborhood fills up.`;
  }
  const canWiden = deck?.scope === 'radius' && (deck.beyondRadiusCount ?? 0) > 0 && radiusMiles < 100;
  const showWhileYouWait = !feedError && deck?.scope !== 'none';

  // Radius control: only meaningful when distances can be measured.
  const radiusControl =
    deck?.scope === 'radius' ? (
      <div role="group" aria-label="Search radius" className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-xs font-semibold text-brown-light">Radius</span>
        {DISCOVER_RADIUS_OPTIONS.map((miles) => (
          <button
            key={miles}
            type="button"
            onClick={() => changeRadius(miles)}
            aria-pressed={radiusMiles === miles}
            className={`chip min-h-[40px] px-3 text-xs ${radiusMiles === miles ? 'chip-active' : ''}`}
          >
            {miles} mi
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="min-h-screen w-full bg-cream flex flex-col relative overflow-x-hidden">

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* ── First-time payoff: the Dogtype reveal, right after the first save ── */}
      {reveal && (
        <DogtypeReveal
          dogtype={reveal.dogtype}
          dogName={reveal.name}
          photoUrl={reveal.photo}
          photoFocus={reveal.focus}
          onDone={() => {
            setReveal(null);
            flashSavedToast();
          }}
        />
      )}

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
        <span className="font-display text-xl text-brown whitespace-nowrap">🐾 GoDoggyDate</span>
        {!authLoading && (
          authUser ? (
            <div className="flex min-w-0 items-center gap-2">
              {/* Hidden on phones: with the logo and "Sign out" there's no room,
                  and a long dog name wrapped the whole header onto 3 lines. */}
              {dogName && (
                <span className="hidden min-w-0 truncate text-xs text-brown-light sm:inline">Hi, {dogName}&apos;s owner 👋</span>
              )}
              <button
                onClick={handleSignOut}
                className="shrink-0 whitespace-nowrap px-1 py-3 text-xs text-brown-light hover:text-rose transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-xs bg-primary/10 text-rose font-semibold rounded-full px-4 min-h-[40px] hover:bg-primary/20 transition-colors"
            >
              Sign in 🐾
            </button>
          )
        )}
      </header>

      {/* ── Profile saved confirmation ───────────────────────────────────────
          In the page flow under the header (not a floating toast): a floating one
          sat over the "Other dogs can't see you yet" notice at the top for the
          seconds it was most likely being read, and at the bottom it covered the
          Pass / WOOF buttons on a phone. */}
      {profileSavedToast && (
        <div
          role="status"
          className="mx-4 mt-2 flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2.5 text-white shadow-sm"
        >
          <span className="text-lg">✓</span>
          <p className="text-sm font-semibold">Profile saved.{' '}
            {deck && !feedDepleted ? 'Swipe right to like, left to pass.' : ''}
          </p>
        </div>
      )}

      {/* ── Guest sign-in nudge — non-blocking inline banner ────────────── */}
      {!authLoading && !authUser && (
        <div className="mx-4 mt-2 rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-brown-light flex-1 leading-snug">
            Sign in to save your matches and start chatting.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="shrink-0 text-xs font-bold text-rose bg-white/70 hover:bg-white rounded-full px-4 min-h-[40px] transition-colors"
          >
            Sign in 🐾
          </button>
        </div>
      )}

      {/* ── Visibility warning ────────────────────────────────────────────
          Profile is complete from the owner's view (e.g. ZIP entered) but
          lacks any public-readable location anchor (city/state or coords),
          so other dogs can't discover them. Surfaced once the profile form
          is closed, and it stays until it's fixed: the "saved" confirmation is a
          separate strip above it, so it can't cover this. */}
      {!authLoading &&
        authUser &&
        savedProfile &&
        profileIsComplete &&
        !showProfileForm &&
        !reveal &&
        !isPubliclyDiscoverable(savedProfile) && (
        <div
          role="status"
          className={`mx-4 mt-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 ${profileSavedToast ? 'ring-2 ring-amber-400' : ''}`}
        >
          <p className="text-xs text-amber-900 flex-1 leading-snug">
            <span className="font-bold">Other dogs can&apos;t see {dogName || 'your dog'} yet.</span>{' '}
            A ZIP alone stays private. Add a city and state, or allow location, to be discoverable.
          </p>
          <button
            onClick={() => setShowProfileForm(true)}
            className="shrink-0 min-h-[40px] text-xs font-bold text-amber-900 underline underline-offset-2"
          >
            Edit profile
          </button>
        </div>
      )}

      {/* ── Profile setup overlay ────────────────────────────────────────── */}
      {showProfileForm && authUser && (
        <div className="absolute inset-0 z-30 bg-cream overflow-y-auto pt-14 pb-20">
          {profileSaveError && (
            <div className="sticky top-14 z-40 mx-auto w-full max-w-md px-4 pt-4">
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

      {/* ── Discover content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex h-full w-full flex-col px-1 sm:px-2 pt-2 pb-0">

          {/* Skeleton until auth, the profile AND the first deck query have all
              resolved: nothing is computed from an empty deck before that, so no
              density line or empty state can flash up first. Later rebuilds are
              quiet and never come back here. */}
          {(authLoading || (authUser && profileIsComplete && deck === null && !feedError)) && (
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

          {/* Feed depleted — no real dogs in range right now. Used to silently
              recycle all 15 (mostly photoless) seed dogs back into the
              swipeable deck here; that taught the "Check Again" button to
              produce the exact same fake results every time. Now honest:
              real feed stays empty, and the demo gallery is opt-in and
              clearly labeled instead of auto-injected. */}
          {!authLoading && authUser && profileIsComplete && feedDepleted && (
            <div className="flex flex-1 flex-col items-center py-10 gap-4 text-center px-4">
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
              <p data-testid="empty-headline" className="font-display text-2xl text-brown">{emptyHeadline}</p>
              <p data-testid="empty-body" className="text-brown-light text-sm max-w-xs leading-relaxed">{emptyBody}</p>

              {deck?.scope === 'none' && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setShowProfileForm(true)}
                    className="btn-primary px-8 py-3"
                  >
                    Add city &amp; state
                  </button>
                  <button
                    type="button"
                    disabled={locationBusy}
                    onClick={handleUseLocation}
                    className="rounded-full border border-primary/20 bg-white px-8 py-3 text-sm font-semibold text-rose shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-60"
                  >
                    {locationBusy ? 'Checking…' : 'Use my location'}
                  </button>
                </div>
              )}

              {radiusControl}
              {canWiden && (
                <p className="max-w-xs text-xs text-brown-light">
                  {deck?.beyondRadiusCount} more {deck?.beyondRadiusCount === 1 ? 'dog is' : 'dogs are'} farther than {radiusMiles} mi. Try a wider radius.
                </p>
              )}

              {/* Distances need coordinates on both sides. Without them we match by
                  city/state and say so; this lets the person share their approximate
                  location on purpose. */}
              {deck && deck.scope !== 'radius' && deck.scope !== 'none' && (
                <div className="max-w-xs">
                  <p className="text-xs text-brown-light leading-relaxed">
                    We&apos;re matching by {deck.scope === 'city' ? 'city' : 'state'} because we don&apos;t have your approximate location.
                  </p>
                  <button
                    type="button"
                    disabled={locationBusy}
                    onClick={handleUseLocation}
                    className="mt-1 min-h-[40px] text-xs font-bold text-rose underline underline-offset-2 disabled:opacity-60"
                  >
                    {locationBusy ? 'Checking…' : 'Share my approximate location'}
                  </button>
                </div>
              )}
              {locationNote && <p role="status" className="max-w-xs text-xs text-amber-800">{locationNote}</p>}

              {/* Cold start: a short list of things to do now, and a way to be
                  told when someone nearby joins. */}
              {showWhileYouWait && (
                <div className="w-full max-w-sm rounded-2xl border border-border bg-white px-4 py-4 text-left" role="region" aria-labelledby="while-you-wait">
                  <p id="while-you-wait" className="font-display text-lg text-brown">While you wait</p>
                  <ul className="mt-2 divide-y divide-border/70 text-sm">
                    {[
                      { href: '/app/profile', emoji: '🧬', text: `See ${dogName || 'your dog'}’s Dogtype` },
                      { href: '/app/fun', emoji: '🔥', text: `Get ${dogName || 'your dog'} roasted (affectionately)` },
                      { href: '/barkle', emoji: '🟩', text: 'Play today’s Barkle breed puzzle' },
                      { href: '/app/profile', emoji: '🎂', text: `Add ${dogName || 'your dog'}’s birthday or Gotcha Day` },
                      { href: '/app/pack/new', emoji: '🐕', text: `Host the first Pack Day${savedProfile?.city ? ` in ${savedProfile.city}` : ''}` },
                    ].map((item) => (
                      <li key={item.text}>
                        <Link
                          href={item.href}
                          onClick={() => trackEvent('while_you_wait_click', { target: item.href })}
                          className="flex min-h-[44px] items-center gap-3 py-1.5 text-brown hover:text-rose"
                        >
                          <span aria-hidden="true">{item.emoji}</span>
                          <span className="flex-1">{item.text}</span>
                          <span aria-hidden="true" className="text-brown-light">›</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href="/app/fun" className="mt-1 inline-block min-h-[40px] py-2 text-xs font-bold text-rose underline underline-offset-2">
                    More in the Playroom
                  </Link>
                </div>
              )}

              {showWhileYouWait && (
                <div className="w-full max-w-sm">
                  {waitlist ? (
                    <div data-testid="waitlist-joined" className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-900">
                      <p className="font-semibold">
                        You’re #{waitlist.position} on the list for {waitlist.city}.
                      </p>
                      {waitlistNote && <p className="mt-0.5 text-xs">{waitlistNote}</p>}
                      <button
                        type="button"
                        disabled={waitlistBusy}
                        onClick={handleLeaveWaitlist}
                        className="mt-1 min-h-[40px] text-xs font-bold underline underline-offset-2 disabled:opacity-60"
                      >
                        Leave the list
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={waitlistBusy}
                        onClick={handleJoinWaitlist}
                        className="btn-primary w-full px-8 py-3 disabled:opacity-60"
                      >
                        {waitlistBusy ? 'Adding you…' : 'Tell me when neighbors join'}
                      </button>
                      {waitlistNote && <p role="status" className="mt-2 text-xs text-amber-800">{waitlistNote}</p>}
                    </>
                  )}
                </div>
              )}

              {/* Recruit Card — the actual growth lever here is a stranger
                  seeing this dog's card and wanting one for their own, not a
                  bare text link. Same Trading Card export the profile page
                  uses, framed as an invitation instead of an identity card. */}
              {savedProfile && (
                <>
                  <p className="text-brown-light text-sm max-w-xs leading-relaxed">
                    Share {dogName}’s card{savedProfile.ai?.vibeCheck?.archetype.name ? ` — a ${savedProfile.ai.vibeCheck.archetype.name}` : ''} to bring dog parents near you into the pack. The more locals join, the sooner {dogName} finds a playdate.
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
                {/* Genuine re-query, but bounded: a press inside a minute of the
                    last real read reuses it (lib/discover.ts), so this can't be
                    turned into hammering the database. The button reports when
                    the last query actually completed. */}
                <button
                  type="button"
                  disabled={feedLoading}
                  onClick={() => {
                    if (authUser && userDog) {
                      refreshDiscoverFeed(authUser, userDog, { force: true })
                        .catch(() => { /* handled inside refreshDiscoverFeed */ });
                    }
                  }}
                  className="rounded-full border border-primary/20 bg-white px-8 py-3 text-sm font-semibold text-rose shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-60"
                >
                  {feedLoading ? 'Checking…' : 'Check again'}
                </button>
                <button
                  type="button"
                  onClick={handleInviteFriend}
                  className="rounded-full border border-primary/20 bg-white px-8 py-3 text-sm font-semibold text-rose shadow-sm transition-colors hover:bg-primary/5"
                >
                  Invite dog parents{savedProfile?.city ? ` in ${savedProfile.city}` : ''}
                </button>
              </div>
              {inviteNote && <p role="status" className="text-xs text-green-800">{inviteNote}</p>}
              {lastCheckedLabel && (
                <p className="text-[11px] text-brown-light/80">
                  Last checked {lastCheckedLabel}
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowDemoGallery((v) => !v)}
                className="mt-1 py-3 text-xs font-semibold text-brown-light hover:text-brown transition-colors underline underline-offset-2"
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
          {!authLoading && authUser && profileIsComplete && deck !== null && !feedDepleted && (
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
                {densityLine && (
                  <p data-testid="density-line" className="text-xs font-medium text-brown-light">
                    {densityLine}
                  </p>
                )}
                {deck?.scope === 'radius' && (
                  <div className="mt-1.5">{radiusControl}</div>
                )}
                {deck && deck.scope !== 'radius' && deck.scope !== 'none' && (
                  <p className="mt-1 text-[11px] text-brown-light/80">
                    Matching by {deck.scope === 'city' ? 'city' : 'state'}: distances need your approximate location.{' '}
                    <button
                      type="button"
                      disabled={locationBusy}
                      onClick={handleUseLocation}
                      className="min-h-[40px] font-bold text-rose underline underline-offset-2 disabled:opacity-60"
                    >
                      {locationBusy ? 'Checking…' : 'Share it'}
                    </button>
                  </p>
                )}
                {locationNote && <p role="status" className="mt-1 text-[11px] text-amber-800">{locationNote}</p>}
                <p className="mt-1 text-[11px] text-brown-light/80">
                  Swipe to see dogs. It&apos;s a match when you both say WOOF.
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
              <h1 className="font-display text-2xl text-brown">See who&apos;s nearby</h1>
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
                className="mt-1 py-3 text-xs font-semibold text-brown-light hover:text-brown transition-colors underline underline-offset-2"
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
