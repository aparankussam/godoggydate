// mobile/app/fun/adventures.tsx
// The Dog Bucket List / Adventure Passport — a deck of playful real-world quests
// (shared/adventures.ts) the owner stamps off. Self-logged + local (no server),
// with a satisfying stamp pop + haptic, and a shareable passport summary.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, PinkButton, card } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import AdventurePassportCard from '../../components/AdventurePassportCard';
import { adventuresFor, ADVENTURE_COUNT } from '../../../shared/adventures';
import { loadCompleted, saveCompleted, type CompletedMap } from '../../lib/adventures';
import { resolveHeroIndex } from '../../lib/coverPhoto';

export default function AdventuresScreen() {
  const { user, profile } = useSession();
  const dogId = user?.uid ?? '';
  const dogName = profile?.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(profile?.photos, resolveHeroIndex(profile));

  const deck = useMemo(() => adventuresFor(profile ?? undefined), [profile]);
  const [completed, setCompleted] = useState<CompletedMap>({});
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const passportRef = useRef<View>(null);
  const toast = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!dogId) return;
    let active = true;
    loadCompleted(dogId).then((c) => {
      if (active) {
        setCompleted(c);
        setReady(true);
      }
    });
    trackEvent('adventures_open');
    return () => { active = false; };
  }, [dogId]);

  function popToast() {
    toast.setValue(0);
    Animated.sequence([
      Animated.spring(toast, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(toast, { toValue: 0, duration: 450, delay: 700, useNativeDriver: true }),
    ]).start();
  }

  function toggle(id: string) {
    if (!ready) return;
    setCompleted((prev) => {
      const next = { ...prev };
      const wasDone = Boolean(next[id]);
      if (wasDone) {
        delete next[id];
        Haptics.selectionAsync().catch(() => {});
      } else {
        next[id] = Date.now();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        popToast();
        trackEvent('adventure_stamped', { quest: id });
      }
      void saveCompleted(dogId, next);
      return next;
    });
  }

  // Count only quests that are in the current deck, as web does
  // (AdventurePassportWeb.tsx), so a stale or renamed stored key can't push the
  // count past the total (e.g. "19 / 18").
  const completedAdventures = deck.filter((a) => completed[a.id]);
  const doneCount = completedAdventures.length;

  async function sharePassport() {
    if (sharing) return;
    setSharing(true);
    trackEvent('adventures_share_click', { done: doneCount });
    const result = await captureAndShare(passportRef, `${dogName.toLowerCase().replace(/\s+/g, '-')}-passport.png`, `${dogName}'s Adventure Passport`);
    if (result === 'shared') trackEvent('adventures_shared', { done: doneCount, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Adventure Passport" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.progressCard}>
          <Text style={styles.progressBig}>{doneCount}<Text style={styles.progressOf}> / {ADVENTURE_COUNT}</Text></Text>
          <Text style={styles.progressLabel}>quests stamped with {dogName}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.round((doneCount / ADVENTURE_COUNT) * 100))}%` }]} />
          </View>
        </View>

        {deck.map((a) => {
          const done = Boolean(completed[a.id]);
          return (
            <Pressable key={a.id} style={[styles.quest, done && styles.questDone]} onPress={() => toggle(a.id)}>
              <View style={[styles.questEmojiWrap, done && styles.questEmojiWrapDone]}>
                <Text style={styles.questEmoji}>{a.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.questTitle, done && styles.questTitleDone]}>{a.title}</Text>
                <Text style={styles.questBlurb}>{a.blurb}</Text>
              </View>
              <View style={[styles.stampBtn, done && styles.stampBtnDone]}>
                {done ? <Glyph name="check-bold" size={16} color={colors.cream} /> : <Text style={styles.stampBtnText}>Stamp</Text>}
              </View>
            </Pressable>
          );
        })}

        <PinkButton label={sharing ? 'Rendering…' : 'Share the passport'} icon="export-variant" onPress={sharePassport} busy={sharing} style={styles.shareButton} />
        <Text style={styles.disclaimer}>Your own checklist — stamp a quest when you and {dogName} pull it off.</Text>
      </ScrollView>

      {/* "STAMPED!" toast */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            opacity: toast,
            transform: [{ scale: toast.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
          },
        ]}
      >
        <Text style={styles.toastText}>✅ STAMPED!</Text>
      </Animated.View>

      {/* Off-screen capturable passport */}
      <View style={styles.offscreen} pointerEvents="none">
        <AdventurePassportCard ref={passportRef} dogName={dogName} photoUrl={photo ?? undefined} completed={completedAdventures} total={ADVENTURE_COUNT} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontFamily: fonts.bold, fontSize: 16, color: colors.rose, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  progressCard: {
    ...card.paper,
    padding: 20,
    marginBottom: 8,
  },
  progressBig: { fontFamily: fonts.display, fontSize: 44, color: colors.ink },
  progressOf: { fontFamily: fonts.display, fontSize: 22, color: colors.brownMid },
  progressLabel: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, marginTop: 2 },
  progressTrack: { height: 12, borderRadius: radius.full, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', backgroundColor: colors.ink },
  quest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  questDone: { backgroundColor: colors.note },
  questEmojiWrap: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.note,
    alignItems: 'center', justifyContent: 'center',
  },
  questEmojiWrapDone: { backgroundColor: colors.cream },
  questEmoji: { fontSize: 24 },
  questTitle: { fontFamily: fonts.black, fontSize: 15, color: colors.brown },
  questTitleDone: { color: colors.ink },
  questBlurb: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid, marginTop: 1, lineHeight: 16 },
  stampBtn: {
    minWidth: 64,
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  stampBtnDone: { backgroundColor: colors.ink },
  stampBtnText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  shareButton: { marginTop: 10 },
  disclaimer: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center', lineHeight: 17, marginTop: 2 },
  toast: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingHorizontal: 28,
    paddingVertical: 14,
    ...shadow.card,
  },
  toastText: { fontFamily: fonts.display, fontSize: 22, color: colors.cream },
  offscreen: { position: 'absolute', top: -2000, left: 0 },
});
