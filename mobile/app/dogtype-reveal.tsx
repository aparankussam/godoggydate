// mobile/app/dogtype-reveal.tsx
// The Dogtype Reveal — the app's activation "aha". It does NOT re-quiz the
// owner: it dramatically unveils the type their REAL profile already implies
// (deterministic, from shared/dogtype.ts), so the moment is honest — a reveal
// of something true, not a slot-machine result. This is the peak-delight moment
// the research pinned as the highest-leverage first-session surface: read →
// reveal → share. The animation is for the screen-record; the card is the
// artifact that gets posted.

import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '../constants/theme';
import { PawCoin, PrimaryButton, SecondaryButton, SkyBackground, StickerDog } from '../components/sticker';
import { useSession } from '../lib/session';
import { markRevealed } from '../lib/dogtypeDiscovery';
import { getHeroPhoto } from '../lib/photos';
import { captureAndShare } from '../lib/shareCard';
import { webUrl } from '../lib/webLinks';
import { trackEvent } from '../lib/analytics';
import DogtypeCard from '../components/DogtypeCard';
import { computeDogtype } from '../../shared/dogtype';
import { resolveHeroIndex } from '../lib/coverPhoto';

const READING_MS = 1600;

export default function DogtypeRevealScreen() {
  const { profile, user } = useSession();
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
      if (user?.uid) void markRevealed(user.uid);
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
    // Same caption and /dogtype/<CODE> link as web's Dogtype share.
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype.png`,
      `Share ${dogName}'s Dogtype`,
      {
        caption: `${dogName} is ${dogtype.name} ${dogtype.emoji} on GoDoggyDate. What's your dog's Dogtype?`,
        url: webUrl(`/dogtype/${dogtype.code}`),
      },
    );
    if (result === 'shared') trackEvent('dogtype_shared', { code: dogtype.code, method: 'native_share', from: 'reveal' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  // No computable type yet — send them to finish the profile rather than fake one.
  if (!dogtype) {
    return (
      <SafeAreaView style={styles.container}>
        <SkyBackground />
        <View style={styles.center}>
          <View style={styles.emptyCard}>
            <StickerDog size={96} label="A drawn sticker dog standing in for your dog" />
            <Text style={styles.emptyTitle}>Almost there</Text>
            <Text style={styles.emptyBody}>
              Add {dogName === 'Your dog' ? 'your dog' : dogName}&apos;s energy, play style, and temperament and
              we&apos;ll reveal their Dogtype.
            </Text>
            <PrimaryButton
              label="Finish the profile"
              onPress={() => router.replace('/(tabs)/profile')}
              style={styles.fullWidth}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const pulseRotate = pulse.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });

  return (
    <SafeAreaView style={styles.container}>
      <SkyBackground />

      {phase === 'reading' ? (
        <View style={styles.center}>
          <Animated.View style={{ transform: [{ scale: pulseScale }, { rotate: pulseRotate }] }}>
            <PawCoin size={96} />
          </Animated.View>
          <Text style={styles.readingText}>Reading {dogName}&apos;s Dogtype…</Text>
          <Text style={styles.readingSub}>From everything you told us about them.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.revealed} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <PawCoin size={30} />
            <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={2}>
              {dogName}, meet your Dogtype
            </Text>
          </View>

          <Animated.View style={{ opacity: revealOpacity, transform: [{ scale: revealScale }] }}>
            <DogtypeCard ref={cardRef} dogtype={dogtype} dogName={dogName} photoUrl={photo ?? undefined} />
          </Animated.View>

          <Text style={styles.note}>Dogtype is a playful read, not a score.</Text>

          <View style={styles.actions}>
            <PrimaryButton
              label={sharing ? 'Preparing…' : `Share ${dogName}'s Dogtype`}
              icon={sharing ? undefined : <MaterialCommunityIcons name="export-variant" size={24} color={colors.ink} />}
              onPress={handleShare}
              disabled={sharing}
              style={styles.fullWidth}
            />
            <SecondaryButton
              label={`See ${dogName}'s whole profile`}
              onPress={() => router.replace('/(tabs)/profile')}
              style={styles.fullWidth}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  readingText: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: colors.ink,
    marginTop: 28,
    textAlign: 'center',
  },
  readingSub: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, marginTop: 8, textAlign: 'center' },
  revealed: { flexGrow: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 32 },
  header: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  note: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    marginTop: 14,
    textAlign: 'center',
  },
  actions: { alignSelf: 'stretch', paddingHorizontal: 18, marginTop: 16, gap: 12 },
  fullWidth: { alignSelf: 'stretch' },
  emptyCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 24,
    padding: 20,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 4,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink, marginTop: 12 },
  emptyBody: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brownMid,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },
});
