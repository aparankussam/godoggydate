import { forwardRef, useImperativeHandle } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';
import type { DiscoverDog } from '../lib/discover';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const CARD_WIDTH = SCREEN_WIDTH - 32;
export const CARD_HEIGHT = Math.min(CARD_WIDTH * 1.45, 530);
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

export interface SwipeCardRef {
  triggerSwipe: (direction: 'like' | 'pass') => void;
}

interface Props {
  dog: DiscoverDog;
  onSwipe: (action: 'like' | 'pass') => void;
  isTop: boolean;
  stackIndex?: number;
}

const SwipeCard = forwardRef<SwipeCardRef, Props>(
  ({ dog, onSwipe, isTop, stackIndex = 0 }, ref) => {
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);

    useImperativeHandle(ref, () => ({
      triggerSwipe: (direction: 'like' | 'pass') => {
        const exitX =
          direction === 'like' ? SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH * 1.6;
        tx.value = withTiming(exitX, { duration: 300 }, () => {
          runOnJS(onSwipe)(direction);
        });
      },
    }));

    const gesture = Gesture.Pan()
      .enabled(isTop)
      .onUpdate((e) => {
        tx.value = e.translationX;
        ty.value = e.translationY * 0.2;
      })
      .onEnd((e) => {
        if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
          const dir = e.translationX > 0 ? 'like' : 'pass';
          const exitX =
            e.translationX > 0 ? SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH * 1.6;
          tx.value = withTiming(exitX, { duration: 280 }, () => {
            runOnJS(onSwipe)(dir);
          });
        } else {
          tx.value = withSpring(0, { damping: 14, stiffness: 120 });
          ty.value = withSpring(0, { damping: 14 });
        }
      });

    const cardStyle = useAnimatedStyle(() => {
      if (stackIndex > 0) {
        return {
          transform: [{ scale: 0.95 }, { translateY: 14 }],
          opacity: 0.72,
        };
      }
      const rotation = interpolate(
        tx.value,
        [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
        [-10, 0, 10],
        Extrapolation.CLAMP,
      );
      return {
        transform: [
          { translateX: tx.value },
          { translateY: ty.value },
          { rotate: `${rotation}deg` },
        ],
      };
    });

    const likeOpacity = useAnimatedStyle(() => ({
      opacity: interpolate(
        tx.value,
        [0, SWIPE_THRESHOLD * 0.55],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    }));

    const passOpacity = useAnimatedStyle(() => ({
      opacity: interpolate(
        tx.value,
        [-SWIPE_THRESHOLD * 0.55, 0],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    }));

    const photo = dog.photos[0];
    const ageLabel =
      dog.age === 'puppy' ? 'Puppy' : dog.age === 'senior' ? 'Senior' : 'Adult';
    const sexSymbol = dog.sex === 'M' ? '\u2642' : '\u2640';
    const distLabel =
      dog.distanceMiles != null
        ? `${dog.distanceMiles} mi away`
        : dog.location;

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={styles.photoFallbackEmoji}>🐕</Text>
            </View>
          )}

          <Animated.View style={[styles.woofBadge, likeOpacity]}>
            <Text style={styles.woofText}>WOOF 🐾</Text>
          </Animated.View>

          <Animated.View style={[styles.passBadge, passOpacity]}>
            <Text style={styles.passText}>PASS</Text>
          </Animated.View>

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.82)']}
            locations={[0, 0.45, 1]}
            style={styles.gradient}
            pointerEvents="none"
          >
            <View style={styles.nameLine}>
              <Text style={styles.name} numberOfLines={1}>
                {dog.name}
              </Text>
              <Text style={styles.sexSymbol}>{sexSymbol}</Text>
            </View>
            <Text style={styles.breedAge}>
              {dog.breed} · {ageLabel} · {dog.size}
            </Text>
            <Text style={styles.distance} numberOfLines={1}>
              {'\uD83D\uDCCD'} {distLabel}
            </Text>
            {dog.playStyles[0] ? (
              <View style={styles.tagRow}>
                <View style={styles.tag}>
                  <Text style={styles.tagText} numberOfLines={1}>
                    {dog.playStyles[0]}
                  </Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.tagline} numberOfLines={2}>
              {dog.tagline}
            </Text>
          </LinearGradient>
        </Animated.View>
      </GestureDetector>
    );
  },
);

SwipeCard.displayName = 'SwipeCard';
export default SwipeCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.creamDark,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
  },
  photoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.creamDark,
  },
  photoFallbackEmoji: { fontSize: 80 },
  woofBadge: {
    position: 'absolute',
    top: 22,
    left: 18,
    borderWidth: 3,
    borderColor: '#4CAF50',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    transform: [{ rotate: '-12deg' }],
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  woofText: {
    color: '#4CAF50',
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: 1,
  },
  passBadge: {
    position: 'absolute',
    top: 22,
    right: 18,
    borderWidth: 3,
    borderColor: '#F44336',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    transform: [{ rotate: '12deg' }],
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  passText: {
    color: '#F44336',
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: 1,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT * 0.58,
    paddingHorizontal: 18,
    paddingBottom: 20,
    justifyContent: 'flex-end',
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 3,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: '#fff',
    flex: 1,
  },
  sexSymbol: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: 'rgba(255,255,255,0.8)',
  },
  breedAge: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 3,
  },
  distance: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 9,
  },
  tagRow: {
    flexDirection: 'row',
    marginBottom: 9,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.full,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  tagText: {
    color: '#fff',
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
