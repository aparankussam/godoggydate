import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import type { DiscoverDog } from '../lib/discover';
import { focusForPhoto, resolveHeroIndex, type CoverFocus } from '../lib/coverPhoto';
import { getRenderablePhotos } from '../lib/photos';
import { CoverImage } from './CoverPhotoEditor';
import { StickerDog } from './sticker';
import {
  FitSticker,
  FitTag,
  PlaceTicket,
  TrustSlip,
  factsLine,
  placeLabel,
  playsLine,
} from './discover/DiscoverBits';

// "Sticker Book, grown up" Discover card, minimized. Mirrors
// web/components/SwipeCard.tsx: the photo carries the card; on the photo only
// the fit tag + sticker (top-right), the kraft place ticket (bottom-left) and
// the photo counter (top-left). Below it on paper: the name, one facts line,
// one plays line and ONE calm trust slip.

// The crop for a photo with no owner-set focal point. Same as web's swipe card:
// a little above centre, where a dog's face usually is in a portrait shot.
const DEFAULT_CARD_FOCUS: CoverFocus = { x: 50, y: 24 };

// The photo the card should OPEN on — the owner's cover pick (or AI hero),
// clamped to the real photos so a stale index never lands out of range.
function heroIndexFor(dog: DiscoverDog): number {
  const real = getRenderablePhotos(dog.photos);
  const h = resolveHeroIndex(dog);
  return typeof h === 'number' && h >= 0 && h < real.length ? h : 0;
}

// Fixed scatter positions for the like-swipe paw burst — mirrors
// web/components/SwipeCard.tsx's PAW_BURST_OFFSETS. Each paw shares one
// opacity/scale animation.
const PAW_BURST_SPOTS: { top: DimensionValue; left: DimensionValue }[] = [
  { top: '32%', left: '20%' },
  { top: '24%', left: '62%' },
  { top: '48%', left: '72%' },
  { top: '52%', left: '14%' },
  { top: '18%', left: '42%' },
];

function triggerHaptic(direction: 'like' | 'pass') {
  // Drag-to-swipe gets the same haptic as the WOOF / Pass buttons.
  if (direction === 'like') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } else {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
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
  /** Opens the report/block sheet. Shown only on the top card. */
  onReport?: () => void;
}

const SwipeCard = forwardRef<SwipeCardRef, Props>(
  ({ dog, onSwipe, isTop, stackIndex = 0, onReport }, ref) => {
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);
    const swipeHandled = useSharedValue(false);
    const burstAnim = useSharedValue(0);
    const reactionKind = useSharedValue<0 | 1 | 2>(0); // 0 none, 1 like-burst, 2 pass-puff
    const [photoIndex, setPhotoIndex] = useState(() => heroIndexFor(dog));
    // Photos that failed to load, so one dead URL doesn't blank the card.
    const [failed, setFailed] = useState<string[]>([]);

    const photos = getRenderablePhotos(dog.photos);
    const photoCount = photos.length;

    // Reset to the dog's cover/hero photo whenever the dog changes (new card)
    useEffect(() => {
      setPhotoIndex(heroIndexFor(dog));
      setFailed([]);
      swipeHandled.value = false;
      tx.value = 0;
      ty.value = 0;
    }, [dog.id]);

    useImperativeHandle(ref, () => ({
      triggerSwipe: (direction: 'like' | 'pass') => {
        if (swipeHandled.value) return;
        swipeHandled.value = true;
        runOnJS(triggerHaptic)(direction);
        reactionKind.value = direction === 'like' ? 1 : 2;
        burstAnim.value = 0;
        burstAnim.value = withTiming(1, { duration: 300 });
        const exitX = direction === 'like' ? SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH * 1.6;
        tx.value = withTiming(exitX, { duration: 280 }, () => {
          runOnJS(onSwipe)(direction);
        });
      },
    }));

    // Any tap advances to the next photo and wraps back to the first after
    // the last. photoCount is always >= 2 when this is called.
    function advancePhoto() {
      setPhotoIndex((i) => (i + 1) % photoCount);
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
          runOnJS(triggerHaptic)(dir);
          reactionKind.value = dir === 'like' ? 1 : 2;
          burstAnim.value = 0;
          burstAnim.value = withTiming(1, { duration: 300 });
          const exitX = e.translationX > 0 ? SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH * 1.6;
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

    // The report button sits inside the card's own gesture area. An RN
    // Pressable there would lose to the card's tap (the native tap activates,
    // cancels the JS touch, and advances the photo instead), so the button is
    // its own RNGH tap and the card's tap waits for it to fail.
    const showReport = isTop && !!onReport;
    const reportTapGesture = Gesture.Tap()
      .enabled(showReport)
      .hitSlop(4)
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) onReport?.();
      });

    const tapGesture = Gesture.Tap()
      .enabled(isTop)
      .maxDuration(250)
      .maxDistance(10)
      .requireExternalGestureToFail(reportTapGesture)
      // RNGH fires onEnd with success=false on a cancelled/failed tap — without
      // this guard a cancelled tap would still advance the photo.
      .onEnd((_e, success) => {
        if (!success || photoCount <= 1) return;
        runOnJS(advancePhoto)();
      });

    const gesture = Gesture.Exclusive(panGesture, tapGesture);

    const cardStyle = useAnimatedStyle(() => {
      if (stackIndex > 0) {
        return {
          opacity: 0.9,
          transform: [{ translateX: 0 }, { translateY: 12 }, { rotate: '0deg' }, { scale: 0.96 }],
        };
      }
      const rotation = interpolate(
        tx.value,
        [-SCREEN_WIDTH * 0.5, 0, SCREEN_WIDTH * 0.5],
        [-8, 0, 8],
        Extrapolation.CLAMP,
      );
      // Every key the peek branch sets is set here too: the peek card becomes
      // the top card in place (same key), and a key left out would keep its
      // peek value (a see-through, shrunken top card).
      return {
        opacity: 1,
        transform: [
          { translateX: tx.value },
          { translateY: ty.value },
          { rotate: `${rotation}deg` },
          { scale: 1 },
        ],
      };
    });

    const likeOverlayStyle = useAnimatedStyle(() => ({
      opacity: interpolate(tx.value, [20, SWIPE_THRESHOLD * 0.6], [0, 1], Extrapolation.CLAMP),
    }));

    const passOverlayStyle = useAnimatedStyle(() => ({
      opacity: interpolate(tx.value, [-SWIPE_THRESHOLD * 0.6, -20], [1, 0], Extrapolation.CLAMP),
    }));

    // The fit sticker fades while a WOOF / PASS stamp shows, so they never overprint.
    const fitFadeStyle = useAnimatedStyle(() => ({
      opacity: interpolate(Math.abs(tx.value), [0, 20, 60], [1, 1, 0], Extrapolation.CLAMP),
    }));

    // Swipe-completion reactions.
    const pawBurstStyle = useAnimatedStyle(() => ({
      opacity:
        reactionKind.value === 1
          ? interpolate(burstAnim.value, [0, 0.15, 1], [0, 1, 0], Extrapolation.CLAMP)
          : 0,
      transform: [{ scale: interpolate(burstAnim.value, [0, 1], [0.5, 1.3], Extrapolation.CLAMP) }],
    }));
    const dustPuffStyle = useAnimatedStyle(() => ({
      opacity:
        reactionKind.value === 2 ? interpolate(burstAnim.value, [0, 1], [0.55, 0], Extrapolation.CLAMP) : 0,
      transform: [{ scale: interpolate(burstAnim.value, [0, 1], [0.4, 2.2], Extrapolation.CLAMP) }],
    }));

    const currentPhoto = photos[Math.min(photoIndex, Math.max(0, photoCount - 1))] ?? null;
    const showPhoto = currentPhoto && !failed.includes(currentPhoto);
    // The owner's focal point applies only while the card shows their cover,
    // and only when they actually set one — as on web.
    const photoFocus = focusForPhoto(dog, photoIndex, heroIndexFor(dog)) ?? DEFAULT_CARD_FOCUS;
    const hasScore = dog.compat.score > 0;
    const plays = playsLine(dog);

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.card, cardStyle]}
          accessibilityLabel={`${dog.name}, ${dog.breed}`}
          importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
          accessibilityElementsHidden={!isTop}
        >
          <View style={styles.inner}>
            {/* ── Photo ─────────────────────────────────────────────────── */}
            <View style={styles.photo}>
              {showPhoto ? (
                <CoverImage
                  uri={currentPhoto}
                  focus={photoFocus}
                  style={StyleSheet.absoluteFill}
                  accessibilityLabel={`${dog.name}, photo ${photoIndex + 1}`}
                />
              ) : (
                <View style={styles.photoFallback}>
                  <StickerDog size={96} label={`No photo of ${dog.name} yet`} />
                  <Text style={styles.photoFallbackText}>No photo yet</Text>
                </View>
              )}
              {/* Invisible probe so a dead URL moves to the next photo. */}
              {showPhoto ? (
                <ImageErrorProbe
                  uri={currentPhoto}
                  onError={() => {
                    const next = [...failed, currentPhoto];
                    setFailed(next);
                    const alive = photos.findIndex((p) => !next.includes(p));
                    if (alive >= 0) setPhotoIndex(alive);
                  }}
                />
              ) : null}

              {/* Photo counter, top-left — only with 2+ photos. */}
              {photoCount > 1 && isTop && (
                <View
                  style={styles.counter}
                  pointerEvents="none"
                  accessible
                  accessibilityLabel={`Photo ${photoIndex + 1} of ${photoCount}. Tap the photo for the next one.`}
                >
                  <Text style={styles.counterText}>
                    {photoIndex + 1} / {photoCount}
                  </Text>
                </View>
              )}

              {/* Fit: the tag and the sticker, top-right. */}
              {hasScore && (
                <Animated.View style={[styles.fitCorner, fitFadeStyle]} pointerEvents="none">
                  <FitTag />
                  <FitSticker compat={dog.compat} />
                </Animated.View>
              )}

              {/* Place ticket, bottom-left */}
              <View style={styles.ticketWrap} pointerEvents="none">
                <PlaceTicket text={placeLabel(dog)} />
              </View>

              {/* WOOF stamp */}
              <Animated.View style={[styles.stamp, styles.woofStamp, likeOverlayStyle]} pointerEvents="none">
                <Text style={styles.stampText}>WOOF</Text>
              </Animated.View>

              {/* PASS stamp */}
              <Animated.View style={[styles.stamp, styles.passStamp, passOverlayStyle]} pointerEvents="none">
                <Text style={styles.stampText}>PASS</Text>
              </Animated.View>

              {/* Like-swipe paw burst */}
              <Animated.View style={[StyleSheet.absoluteFill, pawBurstStyle]} pointerEvents="none">
                {PAW_BURST_SPOTS.map((spot, i) => (
                  <View key={i} style={[styles.burstPaw, spot]}>
                    <MaterialCommunityIcons name="paw" size={30} color={colors.ink} />
                  </View>
                ))}
              </Animated.View>

              {/* Pass-swipe dust puff */}
              <Animated.View style={[styles.dustPuff, dustPuffStyle]} pointerEvents="none" />
            </View>

            {/* ── Name, facts, one quiet trust slip ─────────────────────── */}
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
                  {dog.name}
                </Text>
                {/* Report / block — top card only. Its own RNGH tap so the
                    card's photo-advance tap doesn't swallow it. */}
                {showReport && (
                  <GestureDetector gesture={reportTapGesture}>
                    <View
                      style={styles.moreBtn}
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`Report or block ${dog.name}`}
                      onAccessibilityTap={onReport}
                    >
                      <MaterialCommunityIcons name="dots-horizontal" size={22} color={colors.ink} />
                    </View>
                  </GestureDetector>
                )}
              </View>
              <Text style={styles.facts} numberOfLines={2}>
                {factsLine(dog)}
              </Text>
              {plays ? (
                <Text style={styles.plays} numberOfLines={1}>
                  {plays}
                </Text>
              ) : null}
              <TrustSlip dog={dog} compat={dog.compat} style={styles.slip} />
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    );
  },
);

SwipeCard.displayName = 'SwipeCard';
export default SwipeCard;

/**
 * CoverImage has no error callback; a zero-size Image with the same URI does
 * (it shares the cache, so this costs no extra download).
 */
function ImageErrorProbe({ uri, onError }: { uri: string; onError: () => void }) {
  return (
    <Image
      source={{ uri }}
      onError={onError}
      style={styles.probe}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: colors.paper,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 6,
  },
  inner: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  photo: {
    flex: 1,
    minHeight: 180,
    backgroundColor: '#5B4A3A',
    borderBottomWidth: 2,
    borderBottomColor: colors.ink,
    overflow: 'hidden',
  },
  probe: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  photoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.note,
  },
  photoFallbackText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },

  counter: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  counterText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: colors.ink },

  fitCorner: {
    position: 'absolute',
    top: 12,
    right: 12,
    alignItems: 'flex-end',
    gap: 6,
  },
  ticketWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
  },

  stamp: {
    position: 'absolute',
    top: 120,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 0,
    elevation: 4,
  },
  woofStamp: { left: 18, transform: [{ rotate: '-8deg' }] },
  passStamp: { right: 18, transform: [{ rotate: '8deg' }] },
  stampText: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: 1 },

  burstPaw: { position: 'absolute' },
  dustPuff: {
    position: 'absolute',
    top: '38%',
    left: '38%',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  info: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ink,
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facts: {
    fontFamily: fonts.black,
    fontSize: 15,
    lineHeight: 19,
    color: colors.ink,
    marginTop: 2,
  },
  plays: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.brownMid,
  },
  slip: { marginTop: 10 },
});
