import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import SwipeCard, { CARD_HEIGHT, CARD_WIDTH, type SwipeCardRef } from '../../components/SwipeCard';
import { fetchDiscoverFeed, DEFAULT_DISCOVER_RADIUS_MILES, type DiscoverDog } from '../../lib/discover';
import { recordSwipe } from '../../lib/matching';
import { useSession } from '../../lib/session';
import { requestApproxLocation, type LocationStatus } from '../../lib/location';

export default function DiscoverTab() {
  const { user, profile, profileComplete, saveProfile } = useSession();
  const [deck, setDeck] = useState<DiscoverDog[]>([]);
  const [radiusApplied, setRadiusApplied] = useState(false);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [detailDog, setDetailDog] = useState<DiscoverDog | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | 'unknown'>('unknown');
  const locationRequestedRef = useRef(false);
  const topCardRef = useRef<SwipeCardRef>(null);

  const likeScale = useSharedValue(1);
  const passScale = useSharedValue(1);
  const starScale = useSharedValue(1);

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
        await recordSwipe({
          currentUserId: user.uid,
          currentDogId: user.uid,
          targetUserId: currentDog.ownerId,
          targetDogId: currentDog.id,
          action,
        });

        if (action === 'like') setLikeCount((n) => n + 1);
        setIndex((prev) => prev + 1);
      } catch (error) {
        console.warn('Failed to record swipe', error);
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
    topCardRef.current?.triggerSwipe('pass');
  }

  function handleLikePress() {
    bounce(likeScale);
    topCardRef.current?.triggerSwipe('like');
  }

  function handleSuperLike() {
    bounce(starScale);
    // Superlike = like for now; wire to separate action in Phase 3
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

  const likeButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));
  const passButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: passScale.value }] }));
  const starButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: starScale.value }] }));

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
        <Text style={styles.loadingText}>Fetching nearby pups…</Text>
      </SafeAreaView>
    );
  }

  const remaining = deck.length - index;
  const isDeckEmpty = remaining <= 0;
  const topDog = deck[index] ?? null;
  const peekDog = deck[index + 1] ?? null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>GoDoggyDate</Text>
          <Text style={styles.headerSubtitle}>
            {radiusApplied
              ? `Dogs within ${DEFAULT_DISCOVER_RADIUS_MILES} miles`
              : locationStatus === 'denied' || locationStatus === 'unavailable'
                ? 'Showing all dogs'
                : 'Dogs near you'}
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
            >
              <Text style={styles.infoBtnText}>ℹ</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Card stack area */}
      <View style={styles.stackArea}>
        {isDeckEmpty ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🐕</Text>
            <Text style={styles.emptyTitle}>You've seen everyone!</Text>
            <Text style={styles.emptyBody}>
              Check back soon — new pups join every day.
            </Text>
            <Pressable style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Start over</Text>
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

          {/* Superlike */}
          <Animated.View style={starButtonStyle}>
            <Pressable style={[styles.actionBtn, styles.starBtn]} onPress={handleSuperLike}>
              <Text style={styles.starIcon}>⭐</Text>
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
  starBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.gold,
    shadowColor: colors.gold,
  },
  likeBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
  },
  passIcon: { fontSize: 22, color: colors.danger },
  starIcon: { fontSize: 20 },
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
