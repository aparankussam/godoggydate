import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  SafeAreaView,
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
import { fetchDiscoverFeed, type DiscoverDog } from '../../lib/discover';
import { useSession } from '../../lib/session';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DiscoverTab() {
  const { user, profile, profileComplete } = useSession();
  const [deck, setDeck] = useState<DiscoverDog[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const topCardRef = useRef<SwipeCardRef>(null);

  const likeScale = useSharedValue(1);
  const passScale = useSharedValue(1);

  useEffect(() => {
    if (!user) return;
    fetchDiscoverFeed(user.uid)
      .then(setDeck)
      .finally(() => setLoading(false));
  }, [user]);

  const handleSwipe = useCallback(
    (action: 'like' | 'pass') => {
      if (action === 'like') setLikeCount((n) => n + 1);
      setIndex((prev) => prev + 1);
    },
    [],
  );

  function animateButton(sv: Animated.SharedValue<number>) {
    sv.value = withSequence(
      withSpring(0.88, { damping: 6 }),
      withSpring(1, { damping: 10 }),
    );
  }

  function handlePassPress() {
    animateButton(passScale);
    topCardRef.current?.triggerSwipe('pass');
  }

  function handleLikePress() {
    animateButton(likeScale);
    topCardRef.current?.triggerSwipe('like');
  }

  function handleReset() {
    setIndex(0);
    setLikeCount(0);
  }

  const likeButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));
  const passButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: passScale.value }] }));

  if (!profileComplete) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.blockEmoji}>🐾</Text>
        <Text style={styles.blockTitle}>Finish your profile first</Text>
        <Text style={styles.blockBody}>
          Head to the Profile tab and complete your dog's profile to start discovering.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Fetching nearby pups…</Text>
      </SafeAreaView>
    );
  }

  const remaining = deck.length - index;
  const isDeckEmpty = remaining <= 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GoDoggyDate</Text>
        {likeCount > 0 && (
          <View style={styles.likesBadge}>
            <Text style={styles.likesBadgeText}>{likeCount} 🐾</Text>
          </View>
        )}
      </View>

      {/* Card stack */}
      <View style={styles.stackArea}>
        {isDeckEmpty ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🐕</Text>
            <Text style={styles.emptyTitle}>You've seen everyone!</Text>
            <Text style={styles.emptyBody}>
              Check back soon for new pups in your area.
            </Text>
            <Pressable style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Start over</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Peek card (behind top card) */}
            {deck[index + 1] && (
              <SwipeCard
                key={deck[index + 1].id}
                dog={deck[index + 1]}
                onSwipe={handleSwipe}
                isTop={false}
                stackIndex={1}
              />
            )}
            {/* Top card */}
            <SwipeCard
              ref={topCardRef}
              key={deck[index].id}
              dog={deck[index]}
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
          <Animated.View style={passButtonStyle}>
            <Pressable style={[styles.actionBtn, styles.passBtn]} onPress={handlePassPress}>
              <Text style={styles.passIcon}>✕</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.counterWrap}>
            <Text style={styles.counterText}>{remaining} left</Text>
          </View>

          <Animated.View style={likeButtonStyle}>
            <Pressable style={[styles.actionBtn, styles.likeBtn]} onPress={handleLikePress}>
              <Text style={styles.likeIcon}>🐾</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  center: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
  },
  likesBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  likesBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#fff',
  },
  stackArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16,
    paddingHorizontal: 24,
    gap: 24,
  },
  actionBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  passBtn: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#F44336',
  },
  likeBtn: {
    backgroundColor: colors.primary,
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  passIcon: { fontSize: 22, color: '#F44336' },
  likeIcon: { fontSize: 26 },
  counterWrap: { flex: 1, alignItems: 'center' },
  counterText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brownLight,
  },
  emptyCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: radius.xl,
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
    marginBottom: 24,
  },
  resetButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 28,
    paddingVertical: 13,
    ...shadow.button,
  },
  resetButtonText: {
    fontFamily: fonts.bold,
    color: '#fff',
    fontSize: 15,
  },
  blockEmoji: { fontSize: 56, marginBottom: 16 },
  blockTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    marginBottom: 10,
    textAlign: 'center',
  },
  blockBody: {
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
});
