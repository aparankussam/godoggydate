// mobile/app/fun/adventures.tsx
// The Dog Bucket List / Adventure Passport — a deck of playful real-world quests
// (shared/adventures.ts) the owner stamps off. Self-logged + local (no server),
// with a satisfying stamp pop + haptic, and a shareable passport summary.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
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

  const doneCount = Object.keys(completed).length;
  const completedAdventures = deck.filter((a) => completed[a.id]);

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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Adventure Passport</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.progressCard}>
          <Text style={styles.progressBig}>{doneCount}<Text style={styles.progressOf}> / {ADVENTURE_COUNT}</Text></Text>
          <Text style={styles.progressLabel}>quests stamped with {dogName}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((doneCount / ADVENTURE_COUNT) * 100)}%` }]} />
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
                <Text style={[styles.stampBtnText, done && styles.stampBtnTextDone]}>{done ? '✓' : 'STAMP'}</Text>
              </View>
            </Pressable>
          );
        })}

        <Pressable style={[styles.shareButton, sharing && { opacity: 0.6 }]} onPress={sharePassport} disabled={sharing}>
          <Text style={styles.shareText}>{sharing ? 'Rendering…' : '📤 Share the passport'}</Text>
        </Pressable>
        <Text style={styles.disclaimer}>Your own checklist — stamp a quest when you and {dogName} pull it off. 🐾</Text>
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
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  progressCard: {
    backgroundColor: colors.brown,
    borderRadius: radius.xl,
    padding: 20,
    marginBottom: 6,
    ...shadow.card,
  },
  progressBig: { fontFamily: fonts.display, fontSize: 44, color: colors.gold },
  progressOf: { fontFamily: fonts.display, fontSize: 22, color: 'rgba(255,255,255,0.6)' },
  progressLabel: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  progressTrack: { height: 8, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.gold },
  quest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questDone: { backgroundColor: '#F1F8F2', borderColor: '#BFE3C6' },
  questEmojiWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.cream,
    alignItems: 'center', justifyContent: 'center',
  },
  questEmojiWrapDone: { backgroundColor: '#DDF0E1' },
  questEmoji: { fontSize: 24 },
  questTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  questTitleDone: { color: '#2C6E3F' },
  questBlurb: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 1, lineHeight: 16 },
  stampBtn: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  stampBtnDone: { backgroundColor: '#2C6E3F', borderColor: '#2C6E3F' },
  stampBtnText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primary, letterSpacing: 0.5 },
  stampBtnTextDone: { color: '#fff', fontSize: 14 },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, textAlign: 'center', lineHeight: 17, marginTop: 2 },
  toast: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: colors.brown,
    borderRadius: radius.full,
    paddingHorizontal: 28,
    paddingVertical: 14,
    ...shadow.card,
  },
  toastText: { fontFamily: fonts.display, fontSize: 22, color: colors.gold },
  offscreen: { position: 'absolute', top: -2000, left: 0 },
});
