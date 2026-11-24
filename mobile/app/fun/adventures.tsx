// mobile/app/fun/adventures.tsx
// The Dog Bucket List / Adventure Passport — a deck of playful real-world quests
// (shared/adventures.ts) the owner stamps off. Self-logged + local (no server),
// with a satisfying stamp pop + haptic, and a shareable passport summary. A
// quest only stamps with a photo of the real thing; the photo shows on the quest.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, PinkButton, card } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import NextToy from '../../components/playroom/NextToy';
import AdventurePassportCard from '../../components/AdventurePassportCard';
import { adventuresFor, ADVENTURE_COUNT } from '../../../shared/adventures';
import { loadCompleted, saveCompleted, type CompletedMap } from '../../lib/adventures';
import { adventurePhotoUri, deleteAdventurePhoto, saveAdventurePhoto } from '../../lib/adventurePhotos';
import { resolveHeroIndex } from '../../lib/coverPhoto';

export default function AdventuresScreen() {
  const { user, profile } = useSession();
  const dogId = user?.uid ?? '';
  const dogName = profile?.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(profile?.photos, resolveHeroIndex(profile));

  const deck = useMemo(() => adventuresFor(profile ?? undefined), [profile]);
  const [completed, setCompleted] = useState<CompletedMap>({});
  // The latest map, read by handlers: saving from inside a setState updater is
  // skipped when the screen is backgrounded right after a tap.
  const completedRef = useRef<CompletedMap>({});
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const passportRef = useRef<View>(null);
  const toast = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!dogId) return;
    let active = true;
    loadCompleted(dogId).then((c) => {
      if (active) {
        completedRef.current = c;
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

  // Bumped when a proof photo is saved or removed, so the thumbnails reload.
  const [photoVersion, setPhotoVersion] = useState(0);

  function commit(next: CompletedMap) {
    completedRef.current = next;
    setCompleted(next);
    void saveCompleted(dogId, next);
  }

  function stamp(id: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    popToast();
    trackEvent('adventure_stamped', { quest: id });
    commit({ ...completedRef.current, [id]: Date.now() });
  }

  function unstamp(id: string) {
    deleteAdventurePhoto(dogId, id);
    setPhotoVersion((v) => v + 1);
    const next = { ...completedRef.current };
    delete next[id];
    commit(next);
  }

  async function pickProof(id: string, source: 'camera' | 'library') {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access to add your proof photo.`);
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
      const uri = !result.canceled ? result.assets?.[0]?.uri : undefined;
      if (!uri) return;
      saveAdventurePhoto(dogId, id, uri);
      setPhotoVersion((v) => v + 1);
      stamp(id);
    } catch {
      Alert.alert('Could not add the photo', 'Please try again.');
    }
  }

  function toggle(id: string, title: string) {
    if (!ready) return;
    if (completedRef.current[id]) {
      Alert.alert(title, 'Remove this stamp and its photo?', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => unstamp(id) },
      ]);
      return;
    }
    Alert.alert('Prove it!', `Add a photo of ${dogName} doing it, and it stamps.`, [
      { text: 'Take a photo', onPress: () => void pickProof(id, 'camera') },
      { text: 'Choose from library', onPress: () => void pickProof(id, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
          const proof = done ? adventurePhotoUri(dogId, a.id) : null;
          return (
            <Pressable key={a.id} style={[styles.quest, done && styles.questDone]} onPress={() => toggle(a.id, a.title)}>
              <View style={[styles.questEmojiWrap, done && styles.questEmojiWrapDone]}>
                <Text style={styles.questEmoji}>{a.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.questTitle, done && styles.questTitleDone]}>{a.title}</Text>
                <Text style={styles.questBlurb}>{a.blurb}</Text>
              </View>
              {done && proof ? (
                <Image key={photoVersion} source={{ uri: proof }} style={styles.proof} />
              ) : (
                <View style={[styles.stampBtn, done && styles.stampBtnDone]}>
                  {done ? <Glyph name="check-bold" size={16} color={colors.cream} /> : <Text style={styles.stampBtnText}>Add photo</Text>}
                </View>
              )}
            </Pressable>
          );
        })}

        <PinkButton label={sharing ? 'Rendering…' : 'Share the passport'} icon="export-variant" onPress={sharePassport} busy={sharing} style={styles.shareButton} />
        <Text style={styles.disclaimer}>Do the quest for real, add a photo of it, and it stamps.</Text>
        <NextToy current="adventures" />
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
  proof: { width: 56, height: 56, borderRadius: 12, borderWidth: 2, borderColor: colors.ink },
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
