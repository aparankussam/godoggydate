import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import SwipeCard, { CARD_HEIGHT, CARD_WIDTH, QUALITY_RING_COLORS, type SwipeCardRef } from '../../components/SwipeCard';
import CompatBreakdown from '../../components/CompatBreakdown';
import { fetchDiscoverFeed, DEFAULT_DISCOVER_RADIUS_MILES, type DiscoverDog } from '../../lib/discover';
import { recordSwipe } from '../../lib/matching';
import { trackEvent } from '../../lib/analytics';
import { useSession } from '../../lib/session';
import { requestApproxLocation, type LocationStatus } from '../../lib/location';
import { isPubliclyDiscoverable } from '../../../shared/profile';
import { getChatUnlockPitch } from '../../../shared/utils/stripe';
import * as Haptics from 'expo-haptics';

const MATCH_HEADLINES = ["It's a Match!", 'MUTUAL WOOF'];

function getEnergyLabel(energyLevel: number): string {
  if (energyLevel >= 75) return 'High energy';
  if (energyLevel <= 35) return 'Mellow';
  return 'Balanced';
}

function formatMemberSince(timestamp?: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', year: 'numeric' });
}

function formatDensityLine(withinFive: number, withinRadius: number, radiusMiles: number): string {
  if (withinRadius === 0) return `Sniffed everyone within ${radiusMiles} mi. New dogs drop daily-ish.`;
  if (withinFive === withinRadius) {
    return `${withinRadius} within 5 mi`;
  }
  return `${withinFive} within 5 mi · ${withinRadius} within ${radiusMiles} mi`;
}

export default function DiscoverTab() {
  const { user, profile, profileComplete, saveProfile, loading: sessionLoading } = useSession();
  const [deck, setDeck] = useState<DiscoverDog[]>([]);
  const [radiusApplied, setRadiusApplied] = useState(false);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [detailDog, setDetailDog] = useState<DiscoverDog | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [matchedDog, setMatchedDog] = useState<DiscoverDog | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [matchHeadline, setMatchHeadline] = useState(MATCH_HEADLINES[0]);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | 'unknown'>('unknown');
  const [swipeError, setSwipeError] = useState<string | null>(null);
  const locationRequestedRef = useRef(false);
  const topCardRef = useRef<SwipeCardRef>(null);

  const likeScale = useSharedValue(1);
  const passScale = useSharedValue(1);

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

  useEffect(() => {
    if (!user) {
      setDeck([]);
      setRadiusApplied(false);
      setLoading(false);
      return;
    }
    fetchDiscoverFeed(user.uid)
      .then((result) => {
        setDeck(result.dogs);
        setRadiusApplied(result.radiusApplied);
      })
      .finally(() => setLoading(false));
  // Re-fetch when stored coords land so the radius filter actually engages.
  }, [user, profile?.lat, profile?.lng]);

  const handleSwipe = useCallback(
    async (action: 'like' | 'pass') => {
      const currentDog = deck[index];
      if (!user || !currentDog || swiping) return;

      setSwiping(true);
      try {
        const result = await recordSwipe({
          currentUserId: user.uid,
          currentDogId: user.uid,
          targetUserId: currentDog.ownerId,
          targetDogId: currentDog.id,
          action,
        });

        trackEvent('swipe_action', {
          action,
          dog_id: currentDog.id,
          compatibility_score: currentDog.compat.score,
        });
        if (action === 'like') {
          setLikeCount((n) => n + 1);
          if (result.isMatch && result.matchId) {
            trackEvent('match_created', {
              match_id: result.matchId,
              dog_id: currentDog.id,
              compatibility_score: currentDog.compat.score,
            });
            setMatchHeadline(MATCH_HEADLINES[Math.floor(Math.random() * MATCH_HEADLINES.length)]);
            setMatchedDog(currentDog);
            setMatchedMatchId(result.matchId);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
        setIndex((prev) => prev + 1);
      } catch (error) {
        console.warn('Failed to record swipe', error);
        setSwipeError('That like didn’t save — check your connection and try again.');
        setTimeout(() => setSwipeError(null), 3500);
      } finally {
        setSwiping(false);
      }
    },
    [deck, index, swiping, user],
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

  function handleReset() {
    if (!user) return;
    setLoading(true);
    fetchDiscoverFeed(user.uid)
      .then((result) => {
        setDeck(result.dogs);
        setRadiusApplied(result.radiusApplied);
        setIndex(0);
        setLikeCount(0);
      })
      .finally(() => setLoading(false));
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

  function handleOpenMatchedChat() {
    if (!matchedDog || !matchedMatchId) return;
    setMatchedDog(null);
    setMatchedMatchId(null);
    router.push({
      pathname: '/chat/[matchId]',
      params: { matchId: matchedMatchId, name: matchedDog.name },
    });
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
      ? `Sniffed everyone within ${DEFAULT_DISCOVER_RADIUS_MILES} mi. New dogs drop daily-ish.`
      : formatDensityLine(visibleWithinFive, visibleWithinRadius, DEFAULT_DISCOVER_RADIUS_MILES);

  return (
    <SafeAreaView style={styles.container}>
      <Modal
        visible={matchedDog !== null && matchedMatchId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setMatchedDog(null);
          setMatchedMatchId(null);
        }}
      >
        {matchedDog && matchedMatchId ? (
          <View style={styles.matchOverlay}>
            <View style={styles.matchModal}>
              <Text style={styles.matchBurst}>🐕 💛 🐶</Text>
              <Text style={styles.matchTitle}>{matchHeadline}</Text>

              {matchedDog.photos[0] ? (
                <Image source={{ uri: matchedDog.photos[0] }} style={styles.matchPhoto} />
              ) : (
                <View style={styles.matchPhotoFallback}>
                  <Text style={styles.matchPhotoFallbackEmoji}>🐕</Text>
                </View>
              )}

              <Text style={styles.matchDogName}>{matchedDog.name}</Text>
              <Text style={styles.matchDogMeta}>
                {matchedDog.breed} · {matchedDog.compat.label}
              </Text>

              <View style={styles.matchReasonCard}>
                <Text style={styles.matchReasonEyebrow}>Why you&apos;ll click</Text>
                {matchedDog.compat.reasons.slice(0, 3).map((reason) => (
                  <Text key={reason} style={styles.matchReasonText}>
                    <Text style={styles.matchReasonBullet}>• </Text>
                    {reason}
                  </Text>
                ))}
                {matchedDog.compat.warnings.length > 0 ? (
                  <View style={styles.matchWarningBox}>
                    <Text style={styles.matchWarningLabel}>Worth knowing</Text>
                    {matchedDog.compat.warnings.map((warning) => (
                      <Text key={warning} style={styles.matchWarningText}>{warning}</Text>
                    ))}
                  </View>
                ) : null}
              </View>

              <Text style={styles.matchUnlockText}>
                {getChatUnlockPitch()}
              </Text>

              <Pressable style={styles.matchPrimaryBtn} onPress={handleOpenMatchedChat}>
                <Text style={styles.matchPrimaryBtnText}>Say hi to {matchedDog.name}</Text>
              </Pressable>
              <Pressable
                style={styles.matchSecondaryBtn}
                onPress={() => {
                  setMatchedDog(null);
                  setMatchedMatchId(null);
                }}
              >
                <Text style={styles.matchSecondaryBtnText}>Keep swiping</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>

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
              onPress={() => { setShowBreakdown(false); setDetailDog(topDog); }}
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
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Text style={styles.visibilityBannerText}>
            Other dogs can&apos;t see you yet. Add a city or allow location to be
            discoverable.
          </Text>
          <Text style={styles.visibilityBannerCta}>Edit profile ›</Text>
        </Pressable>
      )}

      {/* Card stack area */}
      <View style={styles.stackArea}>
        {isDeckEmpty ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🐕</Text>
            <Text style={styles.emptyTitle}>That&apos;s everyone for now</Text>
            <Text style={styles.emptyBody}>
              We&apos;ll keep looking for new dogs within your radius. Invite a friend or check back soon to see who joins next.
            </Text>
            <Pressable style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Check again</Text>
            </Pressable>
            <Pressable style={styles.emptySecondaryButton} onPress={handleInviteFriends}>
              <Text style={styles.emptySecondaryButtonText}>Invite a dog parent</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {peekDog && (
              <SwipeCard
                key={peekDog.id}
                dog={peekDog}
                onSwipe={handleSwipe}
                isTop={false}
                stackIndex={1}
              />
            )}
            <SwipeCard
              ref={topCardRef}
              key={topDog!.id}
              dog={topDog!}
              onSwipe={handleSwipe}
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
            <Pressable style={[styles.actionBtn, styles.passBtn]} onPress={handlePassPress}>
              <Text style={styles.passIcon}>✕</Text>
            </Pressable>
          </Animated.View>

          {/* Like */}
          <Animated.View style={likeButtonStyle}>
            <Pressable style={[styles.actionBtn, styles.likeBtn]} onPress={handleLikePress}>
              <Text style={styles.likeIcon}>🐾</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Dog detail modal */}
      <Modal
        visible={detailDog !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailDog(null)}
        onDismiss={() => setDetailDog(null)}
      >
        {detailDog && (
          <SafeAreaView style={styles.detailContainer}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailName}>{detailDog.name}</Text>
              <Pressable onPress={() => setDetailDog(null)}>
                <Text style={styles.detailClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.detailBody}>
              <Text style={styles.detailSection}>About</Text>
              <Text style={styles.detailLine}>
                {detailDog.breed} · {detailDog.age} · {detailDog.size} · {detailDog.sex === 'M' ? 'Male' : 'Female'}
              </Text>
              <Text style={styles.detailLine}>📍 {detailDog.location}</Text>
              {formatMemberSince(detailDog.createdAt) ? (
                <Text style={styles.detailLine}>Member since {formatMemberSince(detailDog.createdAt)}</Text>
              ) : null}
              <View style={styles.detailStatsRow}>
                <View style={styles.detailStatCard}>
                  <Text style={styles.detailStatLabel}>Match</Text>
                  <Text style={styles.detailStatValue}>{detailDog.compat.score}%</Text>
                </View>
                <View style={styles.detailStatCard}>
                  <Text style={styles.detailStatLabel}>Energy</Text>
                  <Text style={styles.detailStatValue}>{getEnergyLabel(detailDog.energyLevel)}</Text>
                </View>
              </View>
              <View style={styles.compatCard}>
                <View style={styles.compatHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compatEyebrow}>Why you&apos;ll click</Text>
                    <Text style={styles.compatTitle}>{detailDog.compat.label}</Text>
                    {detailDog.compat.microcopy ? (
                      <Text style={styles.compatMicrocopy}>{detailDog.compat.microcopy}</Text>
                    ) : null}
                  </View>
                  {/* Ring color signals compat.quality — was a flat primary
                      border regardless of tier, so a blocked match and a
                      perfect one looked identically inviting. */}
                  <View style={[styles.compatScoreRing, { borderColor: QUALITY_RING_COLORS[detailDog.compat.quality] ?? colors.primary }]}>
                    <Text style={styles.compatScoreText}>{detailDog.compat.score}</Text>
                  </View>
                </View>
                {detailDog.compat.reasons.slice(0, 3).map((reason) => (
                  <Text key={reason} style={styles.compatReason}>
                    <Text style={styles.compatReasonBullet}>• </Text>
                    {reason}
                  </Text>
                ))}
                {/* All warnings, not just the first — a second safety flag
                    silently dropped is exactly the kind of detail an owner
                    needs before agreeing to a meetup. */}
                {detailDog.compat.warnings.length > 0 ? (
                  <View style={styles.compatWarningBox}>
                    <Text style={styles.compatWarningLabel}>Worth knowing</Text>
                    {detailDog.compat.warnings.map((warning) => (
                      <Text key={warning} style={styles.compatWarningText}>{warning}</Text>
                    ))}
                  </View>
                ) : null}
                <Pressable onPress={() => setShowBreakdown((v) => !v)} hitSlop={8}>
                  <Text style={styles.compatShowMath}>
                    {showBreakdown ? 'Hide the math' : 'Show the math'}
                  </Text>
                </Pressable>
                {showBreakdown && (
                  <View style={{ marginTop: 8 }}>
                    <CompatBreakdown breakdown={detailDog.compat.breakdown} score={detailDog.compat.score} />
                  </View>
                )}
              </View>
              {detailDog.tagline ? (
                <>
                  <Text style={styles.detailSection}>Bio</Text>
                  <Text style={styles.detailBio}>{detailDog.tagline}</Text>
                </>
              ) : null}
              {detailDog.playStyles.length > 0 && (
                <>
                  <Text style={styles.detailSection}>Play style</Text>
                  <View style={styles.detailTags}>
                    {detailDog.playStyles.map((tag) => (
                      <View key={tag} style={styles.detailTag}>
                        <Text style={styles.detailTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
              <View style={{ height: 32 }} />
              <Pressable
                style={styles.detailLikeBtn}
                onPress={() => {
                  setDetailDog(null);
                  topCardRef.current?.triggerSwipe('like');
                }}
              >
                <Text style={styles.detailLikeBtnText}>Woof! 🐾</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
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
  matchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45,26,14,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  matchModal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.brown,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  matchBurst: {
    fontSize: 34,
    marginBottom: 8,
  },
  matchTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.white,
    marginBottom: 16,
    textAlign: 'center',
  },
  matchPhoto: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: colors.gold,
  },
  matchPhotoFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: colors.gold,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchPhotoFallbackEmoji: {
    fontSize: 44,
  },
  matchDogName: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.white,
  },
  matchDogMeta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginTop: 6,
  },
  matchReasonCard: {
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 18,
  },
  matchReasonEyebrow: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  matchReasonText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.white,
    marginTop: 10,
  },
  matchReasonBullet: {
    color: colors.gold,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  matchWarningBox: {
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  matchWarningLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: 'rgba(255,255,255,0.68)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  matchWarningText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
    marginTop: 4,
  },
  matchUnlockText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.74)',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 14,
  },
  matchPrimaryBtn: {
    width: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    paddingVertical: 15,
    alignItems: 'center',
  },
  matchPrimaryBtnText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.brown,
    fontSize: 16,
  },
  matchSecondaryBtn: {
    paddingVertical: 12,
    marginTop: 6,
  },
  matchSecondaryBtnText: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
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
  emptyCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    ...shadow.card,
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
  // Detail modal
  detailContainer: { flex: 1, backgroundColor: colors.cream },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailName: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brown,
  },
  detailClose: {
    fontSize: 20,
    color: colors.brownLight,
    padding: 4,
  },
  detailBody: { padding: 20 },
  detailStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  detailStatCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailStatLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  detailStatValue: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 15,
    color: colors.brown,
    marginTop: 4,
  },
  compatCard: {
    marginTop: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(232,99,58,0.25)',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  compatHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compatEyebrow: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  compatTitle: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 16,
    color: colors.brown,
    marginTop: 6,
  },
  compatMicrocopy: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginTop: 2,
  },
  compatShowMath: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 12,
    color: colors.primary,
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  compatScoreRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compatScoreText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 16,
    color: colors.primary,
  },
  compatReason: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    lineHeight: 21,
    marginTop: 10,
  },
  compatReasonBullet: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  compatWarningBox: {
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(232,99,58,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  compatWarningLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  compatWarningText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    marginTop: 4,
    lineHeight: 20,
  },
  detailSection: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  detailLine: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.brown,
    marginBottom: 4,
    lineHeight: 24,
  },
  detailBio: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.brownMid,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  detailTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailTag: {
    backgroundColor: colors.creamDark,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailTagText: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 14,
    color: colors.brownMid,
  },
  detailLikeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  detailLikeBtnText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 17,
    color: '#fff',
  },
});
