import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
  withTiming,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import SwipeCard, { type SwipeCardRef } from '../../components/SwipeCard';
import DiscoverEmpty from '../../components/discover/DiscoverEmpty';
import {
  PawIcon,
  PrimaryButton,
  SkyBackground,
  StickerDog,
  StickerHeader,
  Tape,
} from '../../components/sticker';
import MatchModal, { type MatchReveal } from '../../components/MatchModal';
import { computeDogtype } from '../../../shared/dogtype';
import { discoveredOrder } from '../../../shared/progress';
import { discoverFromMatch, loadDiscoveries } from '../../lib/dogtypeDiscovery';
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
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../lib/firebase';
import type { SavedDogProfile } from '../../lib/profile';
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
  // The count of this session's WOOFs is no longer shown (no invented counts on
  // the card), but resetting it on a manual re-check stays as it was.
  const [, setLikeCount] = useState(0);
  const [detailDog, setDetailDog] = useState<DiscoverDog | null>(null);
  const [matchedDog, setMatchedDog] = useState<DiscoverDog | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [matchReveal, setMatchReveal] = useState<MatchReveal | null>(null);
  const [, setLocationStatus] = useState<LocationStatus | 'unknown'>('unknown');
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
        // Dogtype reveal: save the discovery BEFORE the pop-up so it can say
        // whether this type is new. Quiet on any failure (no reveal then).
        let reveal: MatchReveal | null = null;
        try {
          const own = profileRef.current ? computeDogtype(profileRef.current) : null;
          // The deck's copy of a dog lacks behavior flags, so read the full profile: the type must be
          // the same one the Matches tab and the other owner's own profile compute.
          const otherSnap = await getDoc(doc(getFirebase().db, 'dogs', fresh.ownerId ?? fresh.id));
          const other = otherSnap.exists() ? computeDogtype(otherSnap.data() as SavedDogProfile) : null;
          if (own && other) {
            const { isNew } = await discoverFromMatch(uid, { code: other.code, dogId: fresh.id, dogName: fresh.name, at: Date.now() });
            const ledger = await loadDiscoveries(uid);
            reveal = {
              ownCode: own.code,
              otherCode: other.code,
              ownName: profileRef.current?.name?.trim() || 'Your dog',
              discovered: discoveredOrder(ledger, own.code).length,
              variant: own.code === other.code ? 'same' : isNew ? 'new' : 'met',
            };
          }
        } catch {
          reveal = null;
        }
        setMatchReveal(reveal);
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
    // A quick squash, then a settle back to exactly 1. The old three-spring
    // chain (0.84 -> 1.08 -> 1) could stall part-way on react-native-web and
    // leave the button shrunken; a timed squash always hands over.
    sv.value = withSequence(
      withTiming(0.88, { duration: 90 }),
      withSpring(1, { damping: 12, stiffness: 260 }),
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
    setMatchReveal(null);
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
      <DiscoverGate>
        <ActivityIndicator color={colors.ink} size="large" />
      </DiscoverGate>
    );
  }

  if (!user) {
    return (
      <DiscoverGate
        title="Sign in to meet dogs near you"
        body="Start from the welcome screen to see dogs nearby who might play like yours."
        action={
          <PrimaryButton
            label="Go to the welcome screen"
            onPress={() => router.replace('/welcome')}
            icon={<PawIcon size={22} />}
          />
        }
      />
    );
  }

  if (!profileComplete) {
    return (
      <DiscoverGate
        title="Finish your dog’s profile first"
        body="Other dogs can only find yours, and you theirs, once the profile is complete."
        action={
          <PrimaryButton
            label="Finish the profile"
            onPress={() => router.push('/(tabs)/profile?edit=1')}
            icon={<PawIcon size={22} />}
          />
        }
      />
    );
  }

  if (loading) {
    return (
      <DiscoverGate title="Sniffing the neighborhood…">
        <ActivityIndicator color={colors.ink} size="large" />
      </DiscoverGate>
    );
  }

  const remaining = deck.length - index;
  const isDeckEmpty = remaining <= 0;
  const topDog = deck[index] ?? null;
  const peekDog = deck[index + 1] ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <SkyBackground />
      <MatchModal
        dog={matchedDog}
        matchId={matchedMatchId}
        viewer={profile}
        reveal={matchReveal}
        onSayHi={handleOpenMatchedChat}
        onKeepSwiping={closeMatch}
      />

      {swipeError && (
        <View style={styles.swipeError} accessibilityLiveRegion="polite">
          <Text style={styles.swipeErrorText}>{swipeError}</Text>
        </View>
      )}

      {isDeckEmpty ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.emptyScroll}>
          <VisibilityNotice show={!!profile && profileComplete && !isPubliclyDiscoverable(profile)} onPress={openProfileTab} />
          <DiscoverEmpty
            uid={user.uid}
            profile={profile}
            deckTotal={deck.length}
            radiusApplied={radiusApplied}
            radiusMiles={DEFAULT_DISCOVER_RADIUS_MILES}
            checking={checking}
            lastCheckedLabel={lastCheckedAt !== null ? formatClockTime(lastCheckedAt) : null}
            onCheckAgain={handleCheckAgain}
            onInvite={handleInviteFriends}
            onShareCard={handleShareRecruitCard}
            sharingCard={sharingRecruitCard}
            recruitCardRef={recruitCardRef}
            today={
              // Today — reminders, profile gaps, the things that are true for
              // THIS dog right now. Renders nothing when there's nothing to say.
              <TodayPanel
                dogId={user.uid}
                profile={profile}
                variant="full"
                onEditProfile={openProfileTab}
                onOpenReminders={openProfileTab}
              />
            }
          />
        </ScrollView>
      ) : (
        <>
          <StickerHeader title="Who wants to play?" style={styles.header} />

          <VisibilityNotice show={!!profile && profileComplete && !isPubliclyDiscoverable(profile)} onPress={openProfileTab} />

          {/* Above a live deck only something already due earns space. */}
          <TodayPanel
            dogId={user.uid}
            profile={profile}
            variant="strip"
            onEditProfile={openProfileTab}
            onOpenReminders={openProfileTab}
          />

          {/* Card stack area */}
          <View style={styles.stackArea}>
            <View style={styles.stack}>
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
            </View>
          </View>

          {/* Tray: Pass | WOOF | Details */}
          <View style={styles.tray}>
            <View style={styles.trayRow}>
              <Animated.View style={passButtonStyle}>
                <Pressable
                  style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
                  onPress={handlePassPress}
                  accessibilityRole="button"
                  accessibilityLabel={`Pass on ${topDog!.name}`}
                >
                  <View pointerEvents="none" style={styles.sideEdge} />
                  <Ionicons name="close" size={24} color={colors.ink} style={styles.sideIcon} />
                  <Text style={styles.sideText}>Pass</Text>
                </Pressable>
              </Animated.View>

              <Animated.View style={[styles.woofWrap, likeButtonStyle]}>
                <Pressable
                  style={({ pressed }) => [styles.woofBtn, pressed && styles.pressed]}
                  onPress={handleLikePress}
                  accessibilityRole="button"
                  accessibilityLabel={`WOOF at ${topDog!.name}`}
                >
                  <View pointerEvents="none" style={styles.woofEdge} />
                  <PawIcon size={27} />
                  <Text style={styles.woofText}>WOOF</Text>
                </Pressable>
              </Animated.View>

              <Pressable
                style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
                onPress={() => setDetailDog(topDog)}
                accessibilityRole="button"
                accessibilityLabel={`Details for ${topDog!.name}`}
              >
                <View pointerEvents="none" style={styles.sideEdge} />
                <MaterialCommunityIcons
                  name="card-account-details"
                  size={23}
                  color={colors.ink}
                  style={styles.sideIcon}
                />
                <Text style={styles.sideText}>Details</Text>
              </Pressable>
            </View>
            <Text style={styles.helper}>It’s a match when you both say WOOF. Then propose a playdate.</Text>
          </View>
        </>
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
        onPass={() => {
          const dog = detailDog;
          setDetailDog(null);
          if (dog && topDog?.id === dog.id) topCardRef.current?.triggerSwipe('pass');
        }}
        onReport={detailDog ? () => handleReport(detailDog) : undefined}
      />
    </SafeAreaView>
  );
}

/** Sky page with the paw coin, one Chewy line, a plain sentence and (optionally) one pink action. */
function DiscoverGate({
  title,
  body,
  action,
  children,
}: {
  title?: string;
  body?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <SkyBackground />
      <View style={styles.gate}>
        {title ? (
          <View style={styles.gateCard}>
            <Tape width={84} height={22} angle={-4} style={{ top: -9, left: 28 }} />
            <StickerDog size={84} style={styles.gateDog} />
            <Text style={styles.gateTitle} accessibilityRole="header">
              {title}
            </Text>
            {body ? <Text style={styles.gateBody}>{body}</Text> : null}
            {children ? <View style={styles.gateSpinner}>{children}</View> : null}
          </View>
        ) : (
          children
        )}
        {action ? <View style={styles.gateAction}>{action}</View> : null}
      </View>
    </SafeAreaView>
  );
}

/** Shown when the profile is complete but has no public place, so nobody can find it. */
function VisibilityNotice({ show, onPress }: { show: boolean; onPress: () => void }) {
  if (!show) return null;
  return (
    <Pressable style={styles.notice} onPress={onPress} accessibilityRole="button">
      <Text style={styles.noticeText}>
        Other dogs can’t see you yet. Add a city or allow location to be discoverable.
      </Text>
      <View style={styles.noticeCta}>
        <Text style={styles.noticeCtaText}>Edit profile</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  header: { paddingTop: 6 },

  gate: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, gap: 22 },
  gateCard: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 24,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 4,
  },
  gateDog: { marginBottom: 8 },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
  },
  gateBody: {
    marginTop: 8,
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.brownMid,
    textAlign: 'center',
  },
  gateSpinner: { marginTop: 16 },
  gateAction: {},

  swipeError: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 6,
  },
  swipeErrorText: {
    fontFamily: fonts.black,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'center',
  },

  notice: {
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderLeftWidth: 6,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, color: colors.ink },
  noticeCta: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  noticeCtaText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, textDecorationLine: 'underline' },

  stackArea: { flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12 },
  stack: { flex: 1 },

  tray: { paddingHorizontal: 14, paddingBottom: 6 },
  trayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideBtn: {
    width: 66,
    height: 54,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 5,
    overflow: 'hidden',
  },
  sideEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: colors.border },
  sideIcon: { marginBottom: -1 },
  sideText: { fontFamily: fonts.black, fontSize: 12.5, lineHeight: 15, color: colors.ink },
  woofWrap: { flex: 1 },
  woofBtn: {
    height: 54,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: colors.ink,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  woofEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, backgroundColor: colors.primaryDark },
  woofText: { fontFamily: fonts.display, fontSize: 31, lineHeight: 36, letterSpacing: 1, color: colors.ink },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.94 },
  helper: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 12.5,
    lineHeight: 16,
    color: colors.ink,
  },

  emptyScroll: { paddingTop: 4, paddingBottom: 24 },
});
