// mobile/app/dogtype-reveal.tsx
// The Dogtype Reveal — the app's activation "aha". It does NOT re-quiz the
// owner: it dramatically unveils the type their REAL profile already implies
// (deterministic, from shared/dogtype.ts), so the moment is honest — a reveal
// of something true, not a slot-machine result. This is the peak-delight moment
// the research pinned as the highest-leverage first-session surface: read →
// reveal → share. The animation is for the screen-record; the card is the
// artifact that gets posted.

import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius } from '../constants/theme';
import { useSession } from '../lib/session';
import { getHeroPhoto } from '../lib/photos';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import DogtypeCard from '../components/DogtypeCard';
import { computeDogtype } from '../../shared/dogtype';
import { resolveHeroIndex } from '../lib/coverPhoto';

const READING_MS = 1600;

export default function DogtypeRevealScreen() {
  const { profile } = useSession();
  const dogtype = computeDogtype(profile ?? undefined);
  const dogName = profile?.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(profile?.photos, resolveHeroIndex(profile));

  const [phase, setPhase] = useState<'reading' | 'revealed'>('reading');
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  // Animated values (RN core — stable API, no worklet setup needed).
  const pulse = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.82)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!dogtype) return;
    trackEvent('dogtype_reveal_open', { code: dogtype.code });

    // Phase 1: a soft pulse while we "read" the profile.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();

    // Phase 2: reveal — stop the pulse, fire a success haptic, spring the card in.
    const timer = setTimeout(() => {
      loop.stop();
      setPhase('revealed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.parallel([
        Animated.spring(revealScale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
        Animated.timing(revealOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }, READING_MS);

    return () => {
      loop.stop();
      clearTimeout(timer);
    };
    // Keyed on the (stable) code so the reveal plays once per type, not on every
    // render — computeDogtype returns a fresh object each render.
  }, [dogtype?.code]);

  async function handleShare() {
    if (sharing || !dogtype) return;
    setSharing(true);
    trackEvent('dogtype_share_click', { code: dogtype.code, from: 'reveal' });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype.png`,
      `Share ${dogName}'s Dogtype`,
    );
    if (result === 'shared') trackEvent('dogtype_shared', { code: dogtype.code, method: 'native_share', from: 'reveal' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  // No computable type yet — send them to finish the profile rather than fake one.
  if (!dogtype) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#241A2E', '#5C3D2E', '#C98A5E']} style={StyleSheet.absoluteFill} />
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>Almost there</Text>
          <Text style={styles.emptyBody}>
            Add {dogName === 'Your dog' ? 'your dog' : dogName}&apos;s energy, play style, and temperament and
            we&apos;ll reveal their Dogtype.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.primaryText}>Finish the profile</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={dogtype.code[0] === 'E' ? ['#7A2E0E', '#B8431F', '#241A2E'] : ['#241A2E', '#3C2A3E', '#5C3D2E']}
        style={StyleSheet.absoluteFill}
      />

      {phase === 'reading' ? (
        <View style={styles.center}>
          <Animated.Text style={[styles.readingEmoji, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]}>
            🔮
          </Animated.Text>
          <Text style={styles.readingText}>Reading {dogName}&apos;s Dogtype…</Text>
          <Text style={styles.readingSub}>From everything you told us about them.</Text>
        </View>
      ) : (
        <View style={styles.revealed}>
          <Animated.View style={{ opacity: revealOpacity, transform: [{ scale: revealScale }] }}>
            <DogtypeCard ref={cardRef} dogtype={dogtype} dogName={dogName} photoUrl={photo ?? undefined} />
          </Animated.View>

          <View style={styles.actions}>
            <Pressable style={[styles.primaryButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
              <Text style={styles.primaryText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s Dogtype`}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/(tabs)/profile')}>
              <Text style={styles.secondaryText}>See {dogName}&apos;s whole profile</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brown },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  readingEmoji: { fontSize: 72 },
  readingText: { fontFamily: fonts.display, fontSize: 26, color: '#fff', marginTop: 24, textAlign: 'center' },
  readingSub: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8, textAlign: 'center' },
  revealed: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  actions: { width: '100%', paddingHorizontal: 28, marginTop: 24, gap: 14, alignItems: 'center' },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    paddingHorizontal: 28,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 26, color: '#fff', marginTop: 16 },
  emptyBody: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 22, marginTop: 8, marginBottom: 24 },
});
