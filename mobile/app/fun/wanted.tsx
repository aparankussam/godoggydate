// mobile/app/fun/wanted.tsx
// "WANTED" poster generator — pick a mugshot (the hero photo by default, or a
// fresh camera/library shot), then share the outlaw poster built from the dog's
// real profile (shared/wanted.ts). Pure fun, no network, no AI.

import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import WantedPosterCard from '../../components/WantedPosterCard';
import { computeWanted } from '../../../shared/wanted';

export default function WantedScreen() {
  const { profile } = useSession();
  const dogName = profile?.name?.trim() || 'Your dog';
  const heroPhoto = getHeroPhoto(profile?.photos, profile?.ai?.vibeCheck?.heroPhotoIndex);
  const poster = computeWanted(profile ?? undefined);

  const [photoUri, setPhotoUri] = useState<string | undefined>(heroPhoto ?? undefined);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
  const stamp = useRef(new Animated.Value(0.9)).current;
  const pickedManually = useRef(false);

  // On a cold deep-link the profile (and hero photo) resolve AFTER first render,
  // so adopt the hero photo once it arrives — unless the user already chose one.
  useEffect(() => {
    if (!pickedManually.current && heroPhoto) setPhotoUri(heroPhoto);
  }, [heroPhoto]);

  useEffect(() => {
    if (!poster) return;
    trackEvent('wanted_open', { alias: poster.alias });
    // A little "stamped onto the wall" entrance + a heavy thunk.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Animated.spring(stamp, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [poster?.alias]);

  async function pickFrom(source: 'camera' | 'library') {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access to set a new mugshot.`);
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1], mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled && result.assets?.[0]?.uri) {
        pickedManually.current = true;
        setPhotoUri(result.assets[0].uri);
        Haptics.selectionAsync().catch(() => {});
      }
    } catch {
      Alert.alert('Could not open', 'Please try again.');
    }
  }

  function changeMugshot() {
    Alert.alert('New mugshot', `Give ${dogName} a fresh mugshot for the poster`, [
      { text: '📸 Take a photo', onPress: () => pickFrom('camera') },
      { text: '🖼 Choose from library', onPress: () => pickFrom('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleShare() {
    if (sharing || !poster) return;
    setSharing(true);
    trackEvent('wanted_share_click', { alias: poster.alias });
    const result = await captureAndShare(cardRef, `${dogName.toLowerCase().replace(/\s+/g, '-')}-wanted.png`, `${dogName} is WANTED`);
    if (result === 'shared') trackEvent('wanted_shared', { alias: poster.alias, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  if (!poster) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🤠</Text>
          <Text style={styles.emptyTitle}>No outlaw yet</Text>
          <Text style={styles.emptyBody}>Create {dogName === 'Your dog' ? 'your dog' : dogName}&apos;s profile first, then come collect the bounty.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.primaryText}>Back to profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Wanted Poster</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={{ transform: [{ scale: stamp }] }}>
          <WantedPosterCard ref={cardRef} poster={poster} dogName={dogName} photoUrl={photoUri} />
        </Animated.View>

        <Pressable style={styles.secondaryButton} onPress={changeMugshot}>
          <Text style={styles.secondaryText}>📸 Change the mugshot</Text>
        </Pressable>
        <Pressable style={[styles.primaryButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
          <Text style={styles.primaryText}>{sharing ? 'Printing…' : `📤 Share ${dogName}'s poster`}</Text>
        </Pressable>
        <Text style={styles.disclaimer}>
          Charges are built from {dogName}&apos;s real profile — with a few playful frontier extras. 🤠
        </Text>
      </ScrollView>
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
  content: { padding: 20, paddingBottom: 40, alignItems: 'center', gap: 12 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 6,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...shadow.button,
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, textAlign: 'center', lineHeight: 17, marginTop: 4 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.brown },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.brownLight, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
});
