// mobile/app/fun/sticker-studio.tsx
// Sticker Studio — the payoff for booping. Every milestone unlocks decals; here
// you drop them onto your dog's photo, drag them around, and share the result.
// Mirrors web/app/app/fun/sticker-studio: the photo is one of the dog's own
// uploads (or one picked from the library), and the tray shows every sticker,
// the locked ones with the boop count that unlocks them. Pure local fun:
// PanResponder for drag (no extra native dep), react-native-view-shot to
// flatten + share. Honest by construction — the stickers are earned by the
// user's own tap count.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Image, PanResponder, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, PaperButton, PinkButton } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { getHeroPhoto, getRenderablePhotos } from '../../lib/photos';
import { captureAndShare } from '../../lib/shareCard';
import { webUrl } from '../../lib/webLinks';
import { trackEvent } from '../../lib/analytics';
import NextToy from '../../components/playroom/NextToy';
import { loadBoopAllTime, unlockedStickers, STICKERS, type Sticker } from '../../lib/boops';
import { resolveHeroIndex } from '../../lib/coverPhoto';

const CANVAS = Math.min(Dimensions.get('window').width - 40, 360);
const STICKER = 60;

interface Placed { key: string; emoji: string; startX: number; startY: number; }

function DraggableSticker({ emoji, startX, startY, onRemove }: { emoji: string; startX: number; startY: number; onRemove: () => void }) {
  const pan = useRef(new Animated.ValueXY({ x: startX, y: startY })).current;
  const last = useRef({ x: startX, y: startY });
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        pan.setOffset(last.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, g) => {
        last.current = {
          x: Math.max(-STICKER / 2, Math.min(CANVAS - STICKER / 2, last.current.x + g.dx)),
          y: Math.max(-STICKER / 2, Math.min(CANVAS - STICKER / 2, last.current.y + g.dy)),
        };
        pan.flattenOffset();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[styles.placed, { transform: pan.getTranslateTransform() }]}
      {...responder.panHandlers}
    >
      <Pressable onLongPress={onRemove} delayLongPress={300}>
        <Text style={styles.placedEmoji}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function StickerStudioScreen() {
  const { user, profile } = useSession();
  const dogId = user?.uid ?? '';
  const dogName = profile?.name?.trim() || 'Your dog';
  const hero = getHeroPhoto(profile?.photos, resolveHeroIndex(profile));
  const gallery = getRenderablePhotos(profile?.photos);

  const [photoUri, setPhotoUri] = useState<string | undefined>(hero ?? undefined);
  const [allTime, setAllTime] = useState(0);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [seq, setSeq] = useState(0);
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef<View>(null);

  useEffect(() => {
    if (dogId) trackEvent('sticker_studio_open');
  }, [dogId]);

  // Re-read the count whenever the screen comes back into view, so boops
  // earned on the Snoot screen show up as unlocked stickers straight away.
  useFocusEffect(
    useCallback(() => {
      if (!dogId) return;
      let active = true;
      // Read-only, so it never moves Snoot Boop's save baseline.
      loadBoopAllTime(dogId).then((count) => { if (active) setAllTime(count); });
      return () => { active = false; };
    }, [dogId]),
  );

  // Default the canvas to the hero photo once the profile is there (unless a
  // photo was already chosen).
  useEffect(() => {
    if (!photoUri && hero) setPhotoUri(hero);
  }, [hero, photoUri]);

  const stickers = unlockedStickers(allTime);
  // The next sticker to earn (STICKERS is in unlock order).
  const next = STICKERS.find((s) => allTime < s.unlockAt) ?? null;

  // Back to the Snoot screen if it's already open underneath (opening a second
  // one would leave two counters that overwrite each other's saves), else
  // swap this screen for it.
  function goBoop() {
    Haptics.selectionAsync().catch(() => {});
    router.dismissTo('/fun/snoot');
  }

  function choosePhoto(uri: string) {
    Haptics.selectionAsync().catch(() => {});
    setPhotoUri(uri);
  }

  function addSticker(s: Sticker) {
    Haptics.selectionAsync().catch(() => {});
    const key = `${s.id}-${seq}`;
    setSeq((n) => n + 1);
    // Drop it slightly off-center so stacking several is visible.
    const jitter = (placed.length % 5) * 18 - 36;
    setPlaced((prev) => [...prev, { key, emoji: s.emoji, startX: CANVAS / 2 - STICKER / 2 + jitter, startY: CANVAS / 2 - STICKER / 2 + jitter }]);
  }

  function removePlaced(key: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPlaced((prev) => prev.filter((p) => p.key !== key));
  }

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to choose a picture.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, allowsEditing: true, aspect: [1, 1], mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled && result.assets?.[0]?.uri) setPhotoUri(result.assets[0].uri);
    } catch { Alert.alert('Could not open', 'Please try again.'); }
  }

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    trackEvent('sticker_studio_share_click', { stickers: placed.length });
    const result = await captureAndShare(
      canvasRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-stickered.png`,
      `${dogName}, decorated`,
      {
        caption: `I decorated ${dogName} with stickers I earned by booping 🐾 Make your own on GoDoggyDate.`,
        url: webUrl('/'),
      },
    );
    if (result === 'shared') trackEvent('sticker_studio_shared', { stickers: placed.length, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Sticker Studio" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Canvas */}
        <View ref={canvasRef} collapsable={false} style={styles.canvas}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.canvasEmpty]}><Glyph name="paw" size={72} /></View>
          )}
          {placed.map((p) => (
            <DraggableSticker key={p.key} emoji={p.emoji} startX={p.startX} startY={p.startY} onRemove={() => removePlaced(p.key)} />
          ))}
          <View style={styles.canvasBrand} pointerEvents="none">
            <Text style={styles.canvasBrandText}>GoDoggyDate · godoggydate.com</Text>
          </View>
        </View>

        <Text style={styles.hint}>Tap a sticker to add it · drag to move · long-press to remove</Text>

        {/* Photo: the dog's own uploads, plus one from the library */}
        <View style={styles.photoSection}>
          <Text style={styles.trayLabel}>Photo</Text>
          <View style={styles.photoRow}>
            {gallery.map((src, i) => {
              const selected = photoUri === src;
              return (
                <Pressable
                  key={`${i}-${src}`}
                  style={[styles.photoThumb, selected && styles.photoThumbSelected]}
                  onPress={() => choosePhoto(src)}
                  accessibilityRole="button"
                  accessibilityLabel={`${dogName} photo ${i + 1}`}
                  accessibilityState={{ selected }}
                >
                  <Image source={{ uri: src }} style={styles.photoThumbImage} />
                </Pressable>
              );
            })}
            <Pressable
              style={styles.photoAdd}
              onPress={pickPhoto}
              accessibilityRole="button"
              accessibilityLabel="Choose a photo from your library"
            >
              <Glyph name="plus" size={28} />
            </Pressable>
          </View>
        </View>

        {/* Sticker tray */}
        {stickers.length === 0 ? (
          <View style={styles.locked}>
            <Glyph name="lock" size={40} />
            <Text style={styles.lockedText}>Boop {dogName}&apos;s snoot to earn your first stickers — the first two unlock at 10 boops.</Text>
            <PinkButton label="Go boop" icon="gesture-tap" onPress={goBoop} style={styles.lockedBtn} />
          </View>
        ) : (
          <>
            <Text style={styles.trayLabel}>Your stickers ({stickers.length})</Text>
            <View style={styles.tray}>
              {STICKERS.map((s) =>
                allTime >= s.unlockAt ? (
                  <Pressable
                    key={s.id}
                    style={styles.trayItem}
                    onPress={() => addSticker(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add the ${s.label} sticker`}
                  >
                    <Text style={styles.trayEmoji}>{s.emoji}</Text>
                    <Text style={styles.trayName}>{s.label}</Text>
                  </Pressable>
                ) : (
                  <View
                    key={s.id}
                    style={[styles.trayItem, styles.trayItemLocked]}
                    accessible
                    accessibilityLabel={`Locked sticker. Unlocks at ${s.unlockAt.toLocaleString()} boops`}
                  >
                    <Glyph name="lock" size={22} color={colors.brownMid} />
                    <Text style={styles.trayUnlockAt}>{s.unlockAt.toLocaleString()}</Text>
                  </View>
                ),
              )}
            </View>

            {next && (
              <Text style={styles.nextLine}>
                Next: {next.emoji} {next.label} at {next.unlockAt.toLocaleString()} boops ·{' '}
                <Text style={styles.nextLink} onPress={goBoop} accessibilityRole="link">
                  keep booping
                </Text>
              </Text>
            )}

            <View style={styles.actions}>
              {placed.length > 0 && (
                <PaperButton label="Clear" icon="eraser" onPress={() => setPlaced([])} style={styles.clearButton} />
              )}
              <PinkButton
                label={sharing ? 'Rendering…' : 'Share your masterpiece'}
                icon="export-variant"
                onPress={handleShare}
                busy={sharing}
                style={styles.shareButton}
              />
            </View>
          </>
        )}

        <Text style={styles.footnote}>Stickers are genuinely earned by your own boops — no shortcuts, no fabricated stats.</Text>
        <NextToy current="sticker-studio" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontFamily: fonts.bold, fontSize: 16, color: colors.rose, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 20, paddingBottom: 40, alignItems: 'center', gap: 14 },
  canvas: { width: CANVAS, height: CANVAS, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.note, borderWidth: 2, borderColor: colors.ink },
  canvasEmpty: { alignItems: 'center', justifyContent: 'center' },
  canvasBrand: { position: 'absolute', bottom: 8, right: 10 },
  canvasBrandText: { fontFamily: fonts.bold, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  placed: { position: 'absolute', width: STICKER, height: STICKER, alignItems: 'center', justifyContent: 'center' },
  placedEmoji: { fontSize: 52 },
  hint: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center' },
  trayLabel: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, alignSelf: 'flex-start' },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  trayItem: { width: 62, height: 72, borderRadius: 16, backgroundColor: colors.cream, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 2 },
  trayItemLocked: { backgroundColor: colors.creamDark, opacity: 0.8 },
  trayEmoji: { fontSize: 30 },
  trayEmojiLocked: { fontSize: 24 },
  trayName: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid },
  trayUnlockAt: { fontFamily: fonts.black, fontSize: 12, color: colors.brownMid },
  nextLine: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center' },
  nextLink: { fontFamily: fonts.black, color: colors.ink, textDecorationLine: 'underline' },
  photoSection: { alignSelf: 'stretch', gap: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  photoThumb: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: colors.ink },
  photoThumbSelected: { borderWidth: 4 },
  photoThumbImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoAdd: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontFamily: fonts.bold, fontSize: 22, color: colors.brownMid },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  secondaryButton: { flex: 1, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream, borderRadius: radius.full, paddingVertical: 13, alignItems: 'center' },
  clearButton: { paddingHorizontal: 18 },
  secondaryText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch', ...shadow.button },
  shareButton: { flex: 1, paddingHorizontal: 12 },
  primaryText: { fontFamily: fonts.black, fontSize: 16, color: colors.white },
  footnote: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center', lineHeight: 16, paddingHorizontal: 16 },
  locked: { alignItems: 'center', gap: 10, padding: 18, alignSelf: 'stretch', backgroundColor: colors.cream, borderRadius: 24, borderWidth: 2, borderColor: colors.ink },
  lockedBtn: { alignSelf: 'stretch', marginTop: 4 },
  lockedEmoji: { fontSize: 44 },
  lockedText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'center', lineHeight: 20 },
});
