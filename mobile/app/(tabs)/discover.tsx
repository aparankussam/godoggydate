import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import SwipeCard, { type SwipeCardRef } from '../../components/SwipeCard';
import DogTradingCard from '../../components/DogTradingCard';
import MatchModal from '../../components/MatchModal';
import TodayPanel from '../../components/TodayPanel';
import DiscoverDetailsSheet from '../../components/DiscoverDetailsSheet';
import {
  fetchDiscoverFeed,
  refreshDiscoverDog,
  DEFAULT_DISCOVER_RADIUS_MILES,
  type DiscoverDog,
} from '../../lib/discover';
import { recordSwipe } from '../../lib/matching';
import { openReportSheet } from '../../lib/reports';
import { maybeAskForPushPermission } from '../../lib/push';
import { trackEvent } from '../../lib/analytics';
import { useSession } from '../../lib/session';
import { requestApproxLocation, type LocationStatus } from '../../lib/location';
import { isPubliclyDiscoverable } from '../../../shared/profile';
import * as Haptics from 'expo-haptics';

/**
 * Minimum gap between automatic deck refreshes (the tab regaining focus, the
 * app returning to the foreground). Every refresh re-reads the whole dogs
 * collection plus the viewer's swipes and blocks, so flicking between tabs
 * must not re-run it each time. "Check again" ignores the gap.
 */
const AUTO_REFRESH_MIN_GAP_MS = 60_000;

/**
 * How a deck load was started:
 * - initial: first load for this account; shows the full-screen spinner.
 * - manual:  the "Check again" button; shows "Checking…" on the button.
 * - silent:  something the deck depends on changed (coords landed, profile
 *            completed); swaps the deck in place.
 * - auto:    focus or foreground; silent, and skipped inside the minimum gap.
 */
type DeckLoadMode = 'initial' | 'manual' | 'silent' | 'auto';

// Every dog in the deck lands in exactly one bucket, so the line can only ever
// under-describe the deck — never claim a proximity it didn't measure. Mirrors
// web/app/app/page.tsx.
interface DensityCounts {
  withinFive: number;
  withinRadius: number;
  beyondRadius: number;
  unknownDistance: number;
}

function countDensity(dogs: DiscoverDog[], radiusMiles: number): DensityCounts {
  const located = dogs.filter(
    (dog) => typeof dog.distanceMiles === 'number' && dog.distanceMiles >= 0,
  ) as (DiscoverDog & { distanceMiles: number })[];
  return {
    withinFive: located.filter((dog) => dog.distanceMiles <= 5).length,
    withinRadius: located.filter((dog) => dog.distanceMiles <= radiusMiles).length,
    beyondRadius: located.filter((dog) => dog.distanceMiles > radiusMiles).length,
    unknownDistance: dogs.length - located.length,
  };
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

/** "3:07 PM" — built by hand so it reads the same on every Hermes build. */
function formatClockTime(ms: number): string {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

function swipeErrorMessage(action: 'like' | 'pass', name: string): string {
  // The deck has already moved on, so the message says what happens next: no
  // decision was saved, so the dog comes back on a later refresh.
  return action === 'like'
    ? `That like for ${name} didn’t save — check your connection. ${name} will come back round so you can try again.`
    : `That pass didn’t save — check your connection. ${name} may come back round.`;
}

export default function DiscoverTab() {
  const { user, profile, profileComplete, saveProfile, loading: sessionLoading } = useSession();
  const [deck, setDeck] = useState<DiscoverDog[]>([]);
  const [radiusApplied, setRadiusApplied] = useState(false);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [detailDog, setDetailDog] = useState<DiscoverDog | null>(null);
  const [matchedDog, setMatchedDog] = useState<DiscoverDog | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | 'unknown'>('unknown');
  const [swipeError, setSwipeError] = useState<string | null>(null);
  const [sharingRecruitCard, setSharingRecruitCard] = useState(false);
  const locationRequestedRef = useRef(false);
  const topCardRef = useRef<SwipeCardRef>(null);
  const recruitCardRef = useRef<View>(null);

  // Latest values for callbacks that outlive a render (swipe saves, AppState).
  const deckRef = useRef<DiscoverDog[]>(deck);
  deckRef.current = deck;
  const indexRef = useRef(index);
  indexRef.current = index;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const detailOpenRef = useRef(false);
  detailOpenRef.current = detailDog !== null;

  // Deck-load bookkeeping.
  const loadedUidRef = useRef<string | null>(null);
  const lastFetchStartedRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const isFocusedRef = useRef(false);
  const swipeErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const likeScale = useSharedValue(1);
  const passScale = useSharedValue(1);

  const uid = user?.uid ?? null;

  // Ask for approximate location once per session if the dog profile has none stored.
  // Persists rounded coords to the user's own dog doc; respects denial silently.
  useEffect(() => {
    if (!user || !profileComplete || !profile) return;
    if (locationRequestedRef.current) return;
    const alreadyHasCoords =
      typeof profile.lat === 'number' && typeof profile.lng === 'number';
    if (alreadyHasCoords) {
      setLocationStatus('granted');
      return;
    }
    locationRequestedRef.current = true;
    requestApproxLocation()
      .then(async (result) => {
        setLocationStatus(result.status);
        if (result.status === 'granted' && result.coords) {
          try {
            await saveProfile({
              ...profile,
              lat: result.coords.lat,
              lng: result.coords.lng,
            });
          } catch (error) {
            console.warn('Failed to persist approximate location', error);
          }
        }
      })
      .catch(() => {
        setLocationStatus('unavailable');
      });
  }, [profile, profileComplete, saveProfile, user]);

  const loadDeck = useCallback(
    async (mode: DeckLoadMode) => {
      if (!uid) return;
      if (mode === 'auto') {
        // Only refresh a deck that has already loaded once for this account,
        // never on top of a load in flight, never inside the minimum gap, and
        // never while the details sheet is open (its "Woof!" acts on the top
        // card, which a refresh could swap out underneath it).
        if (loadedUidRef.current !== uid) return;
        if (fetchInFlightRef.current) return;
        if (Date.now() - lastFetchStartedRef.current < AUTO_REFRESH_MIN_GAP_MS) return;
        if (detailOpenRef.current) return;
      }

      const seq = ++fetchSeqRef.current;
      fetchInFlightRef.current = true;
      lastFetchStartedRef.current = Date.now();
      loadedUidRef.current = uid;
      if (mode === 'initial') setLoading(true);
      if (mode === 'manual') setChecking(true);

      try {
        const result = await fetchDiscoverFeed(uid);
        if (seq !== fetchSeqRef.current) return;
        setDeck(result.dogs);
        setRadiusApplied(result.radiusApplied);
        setIndex(0);
        if (mode === 'manual') setLikeCount(0);
        // Only a completed query counts as a check — a failed one must not be
        // able to render a timestamp claiming we looked.
        setLastCheckedAt(Date.now());
      } catch (error) {
        console.warn('Failed to load the Discover deck', error);
      } finally {
        if (seq === fetchSeqRef.current) {
          fetchInFlightRef.current = false;
          setLoading(false);
          setChecking(false);
        }
      }
    },
    [uid],
  );

  const loadDeckRef = useRef(loadDeck);
  loadDeckRef.current = loadDeck;

  // First load for this account, then a silent reload whenever something the
  // deck depends on changes: stored coords landing (so the radius filter
  // engages) or the profile becoming complete.
  useEffect(() => {
    if (!uid) {
      fetchSeqRef.current += 1;
      fetchInFlightRef.current = false;
      loadedUidRef.current = null;
      setDeck([]);
      setRadiusApplied(false);
      setIndex(0);
      setLastCheckedAt(null);
      setLoading(false);
      return;
    }
    void loadDeck(loadedUidRef.current === uid ? 'silent' : 'initial');
  }, [uid, loadDeck, profile?.lat, profile?.lng, profileComplete]);

  // Refresh when the tab regains focus, as web does on visibilitychange/focus.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      void loadDeckRef.current('auto');
      return () => {
        isFocusedRef.current = false;
      };
    }, []),
  );

  // …and when the app comes back to the foreground with this tab showing.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isFocusedRef.current) {
        void loadDeckRef.current('auto');
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    if (swipeErrorTimerRef.current) clearTimeout(swipeErrorTimerRef.current);
  }, []);

  const showSwipeError = useCallback((message: string) => {
    if (swipeErrorTimerRef.current) clearTimeout(swipeErrorTimerRef.current);
    setSwipeError(message);
    swipeErrorTimerRef.current = setTimeout(() => setSwipeError(null), 4500);
  }, []);

  // Advance first, then save — as web/components/SwipeStack.tsx does. The card
  // has already flown off screen by the time this runs, so waiting on the
  // write left the deck stuck on an invisible card whenever the save failed.
  const handleSwipe = useCallback(
    (dog: DiscoverDog, action: 'like' | 'pass') => {
      if (!uid) return;

      // Only advance if this dog is still the top card (a block or a refresh
      // may already have moved the deck on).
      setIndex((prev) => (deckRef.current[prev]?.id === dog.id ? prev + 1 : prev));
      trackEvent('swipe_action', {
        action,
        dog_id: dog.id,
        compatibility_score: dog.compat.score,
      });

      void (async () => {
        let result: Awaited<ReturnType<typeof recordSwipe>>;
        try {
          result = await recordSwipe({
            currentUserId: uid,
            currentDogId: uid,
            targetUserId: dog.ownerId,
            targetDogId: dog.id,
            action,
          });
        } catch (error) {
          console.warn('Failed to record swipe', error);
          showSwipeError(swipeErrorMessage(action, dog.name));
          return;
        }

        if (action !== 'like') return;
        setLikeCount((n) => n + 1);
        if (!result.isMatch || !result.matchId) return;

        // Re-read the other dog before showing the pop-up, so a vaccination
        // answer changed since the deck loaded can't be shown stale.
        const fresh = await refreshDiscoverDog(uid, profileRef.current, dog);
        trackEvent('match_created', {
          match_id: result.matchId,
          dog_id: fresh.id,
          compatibility_score: fresh.compat.score,
        });
        setMatchedDog(fresh);
        setMatchedMatchId(result.matchId);
        void Haptics.notificationAsync(
          fresh.compat.quality === 'blocked'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
        );
      })();
    },
    [showSwipeError, uid],
  );

  // After a block, the dog leaves the deck at once (getBlockedUserIds keeps it
  // out of every later load). No pass is recorded; the block is the decision.
  const dropDog = useCallback((dogId: string) => {
    const position = deckRef.current.findIndex((dog) => dog.id === dogId);
    if (position === -1) return;
    setDetailDog((current) => (current?.id === dogId ? null : current));
    setDeck((prev) => prev.filter((dog) => dog.id !== dogId));
    if (position < indexRef.current) setIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleReport = useCallback(
    (dog: DiscoverDog) => {
      if (!uid) return;
      openReportSheet(
        { reporterId: uid, targetUserId: dog.ownerId, source: 'profile' },
        { name: dog.name, onBlocked: () => dropDog(dog.id) },
      );
    },
    [dropDog, uid],
  );

  function bounce(sv: { value: number }) {
    sv.value = withSequence(
      withSpring(0.84, { damping: 5, stiffness: 400 }),
      withSpring(1.08, { damping: 8 }),
      withSpring(1, { damping: 12 }),
    );
  }

  function handlePassPress() {
    bounce(passScale);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    topCardRef.current?.triggerSwipe('pass');
  }

  function handleLikePress() {
    bounce(likeScale);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    topCardRef.current?.triggerSwipe('like');
  }

  function handleCheckAgain() {
    if (checking) return;
    void loadDeck('manual');
  }

  async function handleInviteFriends() {
    try {
      await Share.share({
        message: 'My dog needs friends and honestly so do I. https://godoggydate.com',
      });
    } catch {
      // User likely cancelled the share sheet.
    }
  }

  // Recruit Card — the empty-deck invite previously shared a bare text
  // link. Sharing an actual image of the user's own dog (reusing the same
  // Trading Card export as the profile tab) is a far stronger ask, and
  // doubles as free advertising the moment it's posted. Mirrors
  // web/app/app/page.tsx's handleShareRecruitCard.
  async function handleShareRecruitCard() {
    if (!recruitCardRef.current || sharingRecruitCard) return;
    setSharingRecruitCard(true);
    trackEvent('recruit_card_share_click');
    try {
      const uri = await captureRef(recruitCardRef, { format: 'png', quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
        trackEvent('recruit_card_shared', { method: 'native_share' });
      } else {
        Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
      }
    } catch (error) {
      console.warn('Failed to share recruit card', error);
      Alert.alert('Could not share card', 'Please try again in a moment.');
    } finally {
      setSharingRecruitCard(false);
    }
  }

  function closeMatch() {
    const askedFor = matchedDog?.name;
    setMatchedDog(null);
    setMatchedMatchId(null);
    // A first match is the natural moment to ask about notifications: there's
    // now someone to hear back from. Asked after the pop-up closes, and only
    // while iOS's one-time prompt is still unused (the helper checks).
    if (uid && askedFor) {
      setTimeout(() => {
        void maybeAskForPushPermission(uid, {
          title: `Want to know when ${askedFor} replies?`,
        });
      }, 600);
    }
  }

  function handleOpenMatchedChat() {
    if (!matchedDog || !matchedMatchId) return;
    const params = { matchId: matchedMatchId, name: matchedDog.name };
    closeMatch();
    router.push({ pathname: '/chat/[matchId]', params });
  }

  function openProfileTab() {
    router.push('/(tabs)/profile');
  }

  const likeButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));
  const passButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: passScale.value }] }));

  // Check session resolution BEFORE the sign-in/profile gates. Firebase auth
  // reports `user: null` and `profile: null` until it finishes restoring a
  // previous session on launch, so a returning signed-in user briefly saw
  // "Sign in to discover pups" then "Finish your profile first" flash before
  // their real deck loaded — the app appeared to forget them on every launch.
  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <Text style={styles.gateTitle}>Sign in to discover pups</Text>
        <Text style={styles.gateBody}>
          Start a session from the welcome screen to browse nearby dogs.
        </Text>
      </SafeAreaView>
    );
  }

  if (!profileComplete) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <Text style={styles.gateEmoji}>🐾</Text>
        <Text style={styles.gateTitle}>Finish your profile first</Text>
        <Text style={styles.gateBody}>
          Go to the Profile tab and complete your dog's profile to start discovering nearby pups.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Sniffing the neighborhood…</Text>
      </SafeAreaView>
    );
  }

  const remaining = deck.length - index;
  const isDeckEmpty = remaining <= 0;
  const topDog = deck[index] ?? null;
  const peekDog = deck[index + 1] ?? null;
  const visibleDogs = deck.slice(index);
  const densityLine =
    visibleDogs.length === 0
      ? `Sniffed everyone within ${DEFAULT_DISCOVER_RADIUS_MILES} mi. New dogs drop daily-ish.`
      : formatDensityLine(
          countDensity(visibleDogs, DEFAULT_DISCOVER_RADIUS_MILES),
          DEFAULT_DISCOVER_RADIUS_MILES,
        );

  return (
    <SafeAreaView style={styles.container}>
      <MatchModal
        dog={matchedDog}
        matchId={matchedMatchId}
        onSayHi={handleOpenMatchedChat}
        onKeepSwiping={closeMatch}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>GoDoggyDate</Text>
          <Text style={styles.headerSubtitle}>
            {radiusApplied
              ? densityLine
              : locationStatus === 'denied' || locationStatus === 'unavailable'
                ? `${visibleDogs.length} dogs ready to meet`
                : densityLine}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {likeCount > 0 && (
            <View style={styles.likesBadge}>
              <Text style={styles.likesBadgeText}>{likeCount} 🐾</Text>
            </View>
          )}
          {topDog && (
            <Pressable
              style={styles.infoBtn}
              onPress={() => setDetailDog(topDog)}
              accessibilityRole="button"
              accessibilityLabel={`Details for ${topDog.name}`}
            >
              <Text style={styles.infoBtnText}>ℹ</Text>
            </Pressable>
          )}
        </View>
      </View>

      {swipeError && (
        <View style={styles.swipeErrorBanner}>
          <Text style={styles.swipeErrorBannerText}>{swipeError}</Text>
        </View>
      )}

      {/* Visibility warning — shows when the profile is complete from the
          owner's view (e.g. has a ZIP) but lacks a public location anchor
          (city/state or lat/lng), so other dogs cannot discover them. */}
      {profile && profileComplete && !isPubliclyDiscoverable(profile) && (
        <Pressable
          style={styles.visibilityBanner}
          onPress={openProfileTab}
        >
          <Text style={styles.visibilityBannerText}>
            Other dogs can&apos;t see you yet. Add a city or allow location to be
            discoverable.
          </Text>
          <Text style={styles.visibilityBannerCta}>Edit profile ›</Text>
        </Pressable>
      )}

      {/* Same Today panel as the empty state, one line: above a live deck only
          something already due earns space — swiping is the job here. */}
      {!isDeckEmpty && (
        <TodayPanel
          dogId={user.uid}
          profile={profile}
          variant="strip"
          onEditProfile={openProfileTab}
          onOpenReminders={openProfileTab}
        />
      )}

      {/* Card stack area */}
      <View style={styles.stackArea}>
        {isDeckEmpty ? (
          <ScrollView contentContainerStyle={styles.emptyScrollContent} showsVerticalScrollIndicator={false}>
            {/* Today — reminders, profile gaps, the things that are true for
                THIS dog right now. Renders nothing when there's nothing real
                to say. */}
            <TodayPanel
              dogId={user.uid}
              profile={profile}
              variant="full"
              onEditProfile={openProfileTab}
              onOpenReminders={openProfileTab}
            />

            <Text style={styles.emptyEmoji}>🐕</Text>
            <Text style={styles.emptyTitle}>That&apos;s everyone for now</Text>
            <Text style={styles.emptyBody}>
              We check again each time you come back to Discover. New dogs drop daily-ish.
            </Text>

            {/* Recruit Card — the actual growth lever here is a stranger
                seeing this dog's card and wanting one for their own, not a
                bare text link. Same Trading Card export the profile tab
                uses, framed as an invitation instead of an identity card. */}
            {profile && (
              <>
                <Text style={styles.recruitCaption}>
                  Share {profile.name}&apos;s card{profile.ai?.vibeCheck?.archetype.name ? ` — a ${profile.ai.vibeCheck.archetype.name}` : ''} to bring dog parents near you into the pack. The more locals join, the sooner {profile.name} finds a playdate.
                </Text>
                <View style={styles.recruitCardWrap}>
                  <DogTradingCard ref={recruitCardRef} profile={profile} />
                </View>
                <Pressable
                  style={[styles.resetButton, sharingRecruitCard && { opacity: 0.6 }]}
                  onPress={handleShareRecruitCard}
                  disabled={sharingRecruitCard}
                >
                  <Text style={styles.resetButtonText}>
                    {sharingRecruitCard ? 'Preparing…' : `Share ${profile.name}'s Card`}
                  </Text>
                </Pressable>
              </>
            )}

            <View style={styles.emptySecondaryRow}>
              {/* A genuine re-query (fetchDiscoverFeed re-reads the dogs
                  collection every call). The empty state stays mounted while
                  it runs, and the time below says when the last one finished —
                  the only honest answer when nothing changed. */}
              <Pressable
                style={[styles.emptySecondaryButton, checking && { opacity: 0.6 }]}
                onPress={handleCheckAgain}
                disabled={checking}
                accessibilityRole="button"
              >
                <Text style={styles.emptySecondaryButtonText}>
                  {checking ? 'Checking…' : 'Check again'}
                </Text>
              </Pressable>
              <Pressable style={styles.emptySecondaryButton} onPress={handleInviteFriends}>
                <Text style={styles.emptySecondaryButtonText}>Invite dog parents nearby</Text>
              </Pressable>
            </View>
            {lastCheckedAt !== null && (
              <Text style={styles.lastChecked}>Last checked {formatClockTime(lastCheckedAt)}</Text>
            )}
          </ScrollView>
        ) : (
          <>
            {peekDog && (
              <SwipeCard
                key={peekDog.id}
                dog={peekDog}
                onSwipe={(action) => handleSwipe(peekDog, action)}
                isTop={false}
                stackIndex={1}
              />
            )}
            <SwipeCard
              ref={topCardRef}
              key={topDog!.id}
              dog={topDog!}
              onSwipe={(action) => handleSwipe(topDog!, action)}
              onReport={() => handleReport(topDog!)}
              isTop
              stackIndex={0}
            />
          </>
        )}
      </View>

      {/* Action buttons */}
      {!isDeckEmpty && (
        <View style={styles.actionRow}>
          {/* Pass */}
          <Animated.View style={passButtonStyle}>
            <Pressable
              style={[styles.actionBtn, styles.passBtn]}
              onPress={handlePassPress}
              accessibilityRole="button"
              accessibilityLabel="Pass"
            >
              <Text style={styles.passIcon}>✕</Text>
            </Pressable>
          </Animated.View>

          {/* Like */}
          <Animated.View style={likeButtonStyle}>
            <Pressable
              style={[styles.actionBtn, styles.likeBtn]}
              onPress={handleLikePress}
              accessibilityRole="button"
              accessibilityLabel="Woof"
            >
              <Text style={styles.likeIcon}>🐾</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      <DiscoverDetailsSheet
        dog={detailDog}
        onClose={() => setDetailDog(null)}
        onLike={() => {
          const dog = detailDog;
          setDetailDog(null);
          // The sheet only opens for the top card, and auto-refresh waits
          // while it's open — but only ever like the dog the sheet showed.
          if (dog && topDog?.id === dog.id) topCardRef.current?.triggerSwipe('like');
        }}
        onReport={detailDog ? () => handleReport(detailDog) : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  gateEmoji: { fontSize: 56, marginBottom: 16 },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    marginBottom: 10,
    textAlign: 'center',
  },
  gateBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    marginTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerLeft: {
    flexShrink: 1,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.brown,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginTop: 2,
  },
  swipeErrorBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.brown,
  },
  swipeErrorBannerText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
  },
  visibilityBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(245,183,49,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.30)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  visibilityBannerText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.brown,
  },
  visibilityBannerCta: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: colors.primary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  likesBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  likesBadgeText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: '#fff',
  },
  infoBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.creamDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    fontSize: 16,
    color: colors.brownMid,
  },
  stackArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 18,
    paddingHorizontal: 20,
    gap: 18,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  passBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: colors.danger,
    shadowColor: colors.danger,
  },
  likeBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
  },
  passIcon: { fontSize: 22, color: colors.danger },
  likeIcon: { fontSize: 28 },
  emptyScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  recruitCaption: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    maxWidth: 280,
    lineHeight: 20,
  },
  recruitCardWrap: {
    marginBottom: 18,
  },
  emptySecondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.brown,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  resetButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 30,
    paddingVertical: 14,
    ...shadow.button,
  },
  resetButtonText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: '#fff',
    fontSize: 15,
  },
  emptySecondaryButton: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  emptySecondaryButtonText: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.brownMid,
    fontSize: 14,
  },
  lastChecked: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    marginTop: 12,
  },
});
