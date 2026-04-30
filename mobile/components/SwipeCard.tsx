import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
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
// 4:5 aspect ratio — same as Tinder/Hinge. Max 560px on large phones.
export const CARD_HEIGHT = Math.min(CARD_WIDTH * 1.25, 560);
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const VELOCITY_THRESHOLD = 700; // px/s — enables flick even if position < threshold

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
    const swipeHandled = useSharedValue(false);
    const [photoIndex, setPhotoIndex] = useState(0);

    // Filter out placeholder strings
    const photos = dog.photos.filter((p) => p && !p.startsWith('_'));
    const photoCount = photos.length;

    // Reset photo index whenever the dog changes (new card)
    useEffect(() => {
      setPhotoIndex(0);
      swipeHandled.value = false;
      tx.value = 0;
      ty.value = 0;
    }, [dog.id]);

    useImperativeHandle(ref, () => ({
      triggerSwipe: (direction: 'like' | 'pass') => {
        if (swipeHandled.value) return;
        swipeHandled.value = true;
        const exitX =
          direction === 'like' ? SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH * 1.6;
        tx.value = withTiming(exitX, { duration: 280 }, () => {
          runOnJS(onSwipe)(direction);
        });
      },
    }));

    // Called from worklet thread — must be defined before gesture
    function advancePhoto(tapX: number, cardWidth = CARD_WIDTH) {
      const isRight = tapX > cardWidth * 0.5;
      if (__DEV__) {
        console.log(
          `[SwipeCard] advancePhoto tapX=${tapX.toFixed(1)} cardWidth=${cardWidth} isRight=${isRight} photoIndex=${photoIndex} photoCount=${photoCount}`,
        );
      }
      if (isRight) {
        setPhotoIndex((i) => Math.min(i + 1, photoCount - 1));
      } else {
        setPhotoIndex((i) => Math.max(i - 1, 0));
      }
    }

    const panGesture = Gesture.Pan()
      .enabled(isTop)
      .activeOffsetX([-6, 6]) // must move 6px horizontally before activating
      .onUpdate((e) => {
        tx.value = e.translationX;
        ty.value = e.translationY * 0.15;
      })
      .onEnd((e) => {
        const positionSwipe = Math.abs(e.translationX) > SWIPE_THRESHOLD;
        const velocitySwipe = Math.abs(e.velocityX) > VELOCITY_THRESHOLD;

        if (positionSwipe || velocitySwipe) {
          if (swipeHandled.value) return;
          swipeHandled.value = true;
          const dir = e.translationX > 0 ? 'like' : 'pass';
          const exitX =
            e.translationX > 0 ? SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH * 1.6;
          tx.value = withTiming(exitX, { duration: 260 }, () => {
            if (__DEV__) {
              console.log('[SwipeCard] pan swipe complete', dir);
            }
            runOnJS(onSwipe)(dir);
          });
        } else {
          tx.value = withSpring(0, { damping: 18, stiffness: 180 });
          ty.value = withSpring(0, { damping: 18 });
        }
      });

    const tapGesture = Gesture.Tap()
      .enabled(isTop)
      .maxDuration(250)
      .maxDistance(10)
      .onEnd((e) => {
        if (photoCount <= 1) {
          return;
        }
        if (__DEV__) {
          console.log('[SwipeCard] tap recognized', { x: e.x, y: e.y });
        }
        runOnJS(advancePhoto)(e.x, CARD_WIDTH);
      });

    const gesture = Gesture.Exclusive(panGesture, tapGesture);

    const cardStyle = useAnimatedStyle(() => {
      if (stackIndex > 0) {
        return {
          transform: [{ scale: 0.94 }, { translateY: 16 }],
          opacity: 0.78,
        };
      }
      const rotation = interpolate(
        tx.value,
        [-SCREEN_WIDTH * 0.5, 0, SCREEN_WIDTH * 0.5],
        [-8, 0, 8],
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

    const likeOverlayStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        tx.value,
        [0, SWIPE_THRESHOLD * 0.6],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    }));

    const passOverlayStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        tx.value,
        [-SWIPE_THRESHOLD * 0.6, 0],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    }));

    const currentPhoto = photos[photoIndex] ?? null;
    const ageLabel =
      dog.age === 'puppy' ? 'Puppy' : dog.age === 'senior' ? 'Senior' : 'Adult';
    const sexLabel = dog.sex === 'M' ? 'Male' : 'Female';
    const distLabel =
      dog.distanceMiles != null
        ? `${dog.distanceMiles} mi away`
        : dog.location;

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Photo */}
          {currentPhoto ? (
            <Image
              source={{ uri: currentPhoto }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={styles.photoFallbackEmoji}>🐕</Text>
            </View>
          )}

          {/* Photo progress bars (Tinder-style) */}
          {photoCount > 1 && (
            <View style={styles.photoBars} pointerEvents="none">
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={[styles.photoBar, i === photoIndex && styles.photoBarActive]}
                />
              ))}
            </View>
          )}

          {/* WOOF badge */}
          <Animated.View style={[styles.woofBadge, likeOverlayStyle]} pointerEvents="none">
            <Text style={styles.woofText}>WOOF 🐾</Text>
          </Animated.View>

          {/* PASS badge */}
          <Animated.View style={[styles.passBadge, passOverlayStyle]} pointerEvents="none">
            <Text style={styles.passText}>PASS</Text>
          </Animated.View>

          {/* Info overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.5, 1]}
            style={styles.gradient}
            pointerEvents="none"
          >
            {/* Name + sex */}
            <View style={styles.nameLine}>
              <Text style={styles.name} numberOfLines={1}>
                {dog.name}
              </Text>
              <View style={styles.sexBadge}>
                <Text style={styles.sexText}>{sexLabel}</Text>
              </View>
            </View>

            {/* Breed · age */}
            <Text style={styles.breedAge} numberOfLines={1}>
              {dog.breed} · {ageLabel} · {dog.size}
            </Text>

            {/* Distance */}
            <Text style={styles.distance} numberOfLines={1}>
              📍 {distLabel}
            </Text>

            {/* Tags row */}
            {dog.playStyles.length > 0 && (
              <View style={styles.tagRow}>
                {dog.playStyles.slice(0, 2).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText} numberOfLines={1}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Tagline */}
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
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.creamDark,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  photoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.creamDark,
  },
  photoFallbackEmoji: { fontSize: 80 },

  // Photo progress bars
  photoBars: {
    position: 'absolute',
    top: 12,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  photoBar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  photoBarActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },

  // WOOF / PASS overlays
  woofBadge: {
    position: 'absolute',
    top: 28,
    left: 18,
    borderWidth: 3,
    borderColor: '#4CAF50',
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    transform: [{ rotate: '-14deg' }],
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  woofText: {
    color: '#4CAF50',
    fontFamily: fonts.bold,
    fontWeight: '800',
    fontSize: 24,
    letterSpacing: 2,
  },
  passBadge: {
    position: 'absolute',
    top: 28,
    right: 18,
    borderWidth: 3,
    borderColor: '#F44336',
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    transform: [{ rotate: '14deg' }],
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  passText: {
    color: '#F44336',
    fontFamily: fonts.bold,
    fontWeight: '800',
    fontSize: 24,
    letterSpacing: 2,
  },

  // Gradient info area
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT * 0.52,
    paddingHorizontal: 18,
    paddingBottom: 22,
    justifyContent: 'flex-end',
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: '#fff',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sexBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  sexText: {
    color: '#fff',
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 12,
  },
  breedAge: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  distance: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  tagText: {
    color: '#fff',
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 12,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
