import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Dimensions,
  Image,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { SEED_DOGS } from '../../../shared/data/seedDogs';
import { calculateCompatibility } from '../../../shared/utils/matchingEngine';
import { FeedDog } from '../../../shared/types';

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_W * 0.35;

// Build feed with scores (using a static user dog for demo)
const USER_DOG = SEED_DOGS[0];
const FEED: (FeedDog & { compat: ReturnType<typeof calculateCompatibility> })[] =
  SEED_DOGS.slice(1).map((dog, i) => ({
    ...dog,
    distanceMiles: 0.5 + i * 0.4,
    compat: calculateCompatibility(USER_DOG, dog, 0.5 + i * 0.4),
  }));

export default function DiscoverScreen() {
  const [index, setIndex] = useState(0);
  const [matchedDog, setMatchedDog] = useState<(typeof FEED)[0] | null>(null);
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_W / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const passOpacity = position.x.interpolate({
    inputRange: [-SCREEN_W / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) swipe('right');
        else if (g.dx < -SWIPE_THRESHOLD) swipe('left');
        else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const swipe = useCallback(
    (dir: 'left' | 'right') => {
      const x = dir === 'right' ? SCREEN_W * 1.4 : -SCREEN_W * 1.4;
      Animated.timing(position, {
        toValue: { x, y: 0 },
        duration: 300,
        useNativeDriver: false,
      }).start(() => {
        position.setValue({ x: 0, y: 0 });
        const currentDog = FEED[index];
        if (dir === 'right' && Math.random() > 0.4) {
          setMatchedDog(currentDog);
        } else {
          setIndex((i) => i + 1);
        }
      });
    },
    [index, position],
  );

  const current = FEED[index];
  const next = FEED[index + 1];

  if (!current || index >= FEED.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>You've seen all dogs nearby!</Text>
          <Text style={styles.emptySub}>Check back later for new matches in your area.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (matchedDog) {
    return (
      <MatchCelebration
        matched={matchedDog}
        onContinue={() => {
          setMatchedDog(null);
          setIndex((i) => i + 1);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>🐾 Discover</Text>
        <Text style={styles.headerSub}>Dogs near you</Text>
      </View>

      {/* Card Stack */}
      <View style={styles.cardStack}>
        {next && (
          <View style={[styles.card, styles.cardBack]}>
            <DogCardContent dog={next} />
          </View>
        )}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            {
              transform: [
                { translateX: position.x },
                { translateY: position.y },
                { rotate },
              ],
            },
          ]}
        >
          {/* Like / Pass overlays */}
          <Animated.View style={[styles.swipeLabel, styles.likeLabel, { opacity: likeOpacity }]}>
            <Text style={styles.swipeLabelText}>WOOF! 🐾</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeLabel, styles.passLabel, { opacity: passOpacity }]}>
            <Text style={styles.swipeLabelText}>PASS</Text>
          </Animated.View>
          <DogCardContent dog={current} />
        </Animated.View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.passBtn]} onPress={() => swipe('left')}>
          <Text style={styles.actionEmoji}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.superBtn]}>
          <Text style={styles.actionEmoji}>⭐</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.likeBtn]} onPress={() => swipe('right')}>
          <Text style={styles.actionEmoji}>🐾</Text>
        </TouchableOpacity>
      </View>

      {/* Compat Score Bar */}
      <View style={styles.compatBar}>
        <Text style={styles.compatText}>
          {current.compat.score}% match ·{' '}
          {current.compat.reasons[0] ?? 'Great energy match'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function DogCardContent({ dog }: { dog: (typeof FEED)[0] }) {
  return (
    <View style={styles.cardInner}>
      {/* Photo placeholder with breed color */}
      <LinearGradient
        colors={['#F5B731', '#E8633A']}
        style={styles.cardPhoto}
      >
        <Text style={styles.cardEmoji}>🐕</Text>
      </LinearGradient>

      {/* Info Panel */}
      <LinearGradient
        colors={['transparent', 'rgba(45,26,14,0.85)']}
        style={styles.cardInfo}
      >
        <View style={styles.cardTop}>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreText}>{dog.compat.score}</Text>
          </View>
          {dog.vaccinated === 'yes' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>✅ Vaccinated</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardName}>
          {dog.name}, {dog.age}
        </Text>
        <Text style={styles.cardBreed}>{dog.breed}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.metaChip}>{dog.size}</Text>
          <Text style={styles.metaChip}>⚡ {dog.energy}%</Text>
          <Text style={styles.metaChip}>📍 {dog.distanceMiles?.toFixed(1)} mi</Text>
        </View>
        {dog.compat.warnings.length > 0 && (
          <Text style={styles.warning}>⚠️ {dog.compat.warnings[0]}</Text>
        )}
      </LinearGradient>
    </View>
  );
}

function MatchCelebration({
  matched,
  onContinue,
}: {
  matched: (typeof FEED)[0];
  onContinue: () => void;
}) {
  return (
    <LinearGradient colors={['#2D1A0E', '#E8633A']} style={styles.matchScreen}>
      <Text style={styles.matchEmojis}>🐕 💛 🐶</Text>
      <Text style={styles.matchTitle}>It's a Match!</Text>
      <Text style={styles.matchSub}>
        You and {matched.name} could be playdate friends!
      </Text>
      <Text style={styles.matchScore}>{matched.compat.score}% compatible</Text>
      <TouchableOpacity style={styles.unlockBtn}>
        <Text style={styles.unlockBtnText}>💬 Unlock Chat · $4.99</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.continueLink} onPress={onContinue}>
        <Text style={styles.continueLinkText}>Keep Swiping →</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: { fontFamily: fonts.display, fontSize: 20, color: colors.brown },
  headerSub: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight },
  cardStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
  },
  card: {
    width: SCREEN_W - 32,
    height: (SCREEN_W - 32) * 1.35,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'absolute',
    ...shadow.card,
  },
  cardBack: {
    transform: [{ scale: 0.96 }, { translateY: 16 }],
    opacity: 0.9,
  },
  cardInner: { flex: 1 },
  cardPhoto: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 96 },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 60,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scoreRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  scoreText: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.white },
  cardName: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  cardBreed: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  metaChip: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.white,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  warning: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#FFD54F',
    marginTop: 6,
  },
  swipeLabel: {
    position: 'absolute',
    top: 48,
    zIndex: 10,
    borderWidth: 4,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  likeLabel: {
    right: 24,
    borderColor: colors.gold,
    transform: [{ rotate: '10deg' }],
  },
  passLabel: {
    left: 24,
    borderColor: '#FF6B6B',
    transform: [{ rotate: '-10deg' }],
  },
  swipeLabelText: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.white,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 16,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  passBtn: { backgroundColor: colors.white },
  superBtn: { backgroundColor: colors.gold, width: 52, height: 52, borderRadius: 26 },
  likeBtn: { backgroundColor: colors.primary },
  actionEmoji: { fontSize: 24 },
  compatBar: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: 'rgba(232,99,58,0.1)',
    borderRadius: radius.full,
    padding: 10,
    alignItems: 'center',
  },
  compatText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.brown, textAlign: 'center' },
  emptySub: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    textAlign: 'center',
    marginTop: 8,
  },
  matchScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  matchEmojis: { fontSize: 64, marginBottom: 16 },
  matchTitle: { fontFamily: fonts.display, fontSize: 40, color: colors.white, marginBottom: 8 },
  matchSub: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  matchScore: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.gold,
    marginTop: 12,
    marginBottom: 32,
  },
  unlockBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 32,
    ...shadow.button,
  },
  unlockBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.brown },
  continueLink: { marginTop: 20 },
  continueLinkText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
});
