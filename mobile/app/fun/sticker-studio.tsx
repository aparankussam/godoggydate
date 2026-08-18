// mobile/app/fun/sticker-studio.tsx
// Sticker Studio — the payoff for booping. Every milestone unlocks decals; here
// you drop them onto your dog's photo, drag them around, and share the result.
// Pure local fun: image-picker for the photo, PanResponder for drag (no extra
// native dep), react-native-view-shot to flatten + share. Honest by
// construction — the stickers are earned by the user's own tap count.

import { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Image, PanResponder, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import { loadBoops, unlockedStickers, type Sticker } from '../../lib/boops';

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
  const hero = getHeroPhoto(profile?.photos, profile?.ai?.vibeCheck?.heroPhotoIndex);

  const [photoUri, setPhotoUri] = useState<string | undefined>(hero ?? undefined);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [seq, setSeq] = useState(0);
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef<View>(null);

  useEffect(() => {
    if (!dogId) return;
    loadBoops(dogId).then((s) => setStickers(unlockedStickers(s.allTime)));
    trackEvent('sticker_studio_open');
  }, [dogId]);

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
    const result = await captureAndShare(canvasRef, `${dogName.toLowerCase().replace(/\s+/g, '-')}-stickered.png`, `${dogName}`);
    if (result === 'shared') trackEvent('sticker_studio_shared', { stickers: placed.length, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle}>Sticker Studio</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Canvas */}
        <View ref={canvasRef} collapsable={false} style={styles.canvas}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.canvasEmpty]}><Text style={{ fontSize: 72 }}>🐕</Text></View>
          )}
          {placed.map((p) => (
            <DraggableSticker key={p.key} emoji={p.emoji} startX={p.startX} startY={p.startY} onRemove={() => removePlaced(p.key)} />
          ))}
          <View style={styles.canvasBrand} pointerEvents="none">
            <Text style={styles.canvasBrandText}>GoDoggyDate · godoggydate.com</Text>
          </View>
        </View>

        <Text style={styles.hint}>Tap a sticker to add it · drag to move · long-press to remove</Text>

        {/* Sticker tray */}
        {stickers.length === 0 ? (
          <View style={styles.locked}>
            <Text style={styles.lockedEmoji}>🔒</Text>
            <Text style={styles.lockedText}>Boop {dogName}&apos;s snoot to earn your first stickers — the first two unlock at 10 boops.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/fun/snoot')}>
              <Text style={styles.primaryText}>Go boop 🐽</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.trayLabel}>Your stickers ({stickers.length})</Text>
            <View style={styles.tray}>
              {stickers.map((s) => (
                <Pressable key={s.id} style={styles.trayItem} onPress={() => addSticker(s)}>
                  <Text style={styles.trayEmoji}>{s.emoji}</Text>
                  <Text style={styles.trayName}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.secondaryButton} onPress={pickPhoto}>
                <Text style={styles.secondaryText}>📸 Change photo</Text>
              </Pressable>
              {placed.length > 0 && (
                <Pressable style={styles.secondaryButton} onPress={() => setPlaced([])}>
                  <Text style={styles.secondaryText}>Clear</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={[styles.primaryButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
              <Text style={styles.primaryText}>{sharing ? 'Rendering…' : '📤 Share your masterpiece'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 20, paddingBottom: 40, alignItems: 'center', gap: 14 },
  canvas: { width: CANVAS, height: CANVAS, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.creamDark, ...shadow.card },
  canvasEmpty: { alignItems: 'center', justifyContent: 'center' },
  canvasBrand: { position: 'absolute', bottom: 8, right: 10 },
  canvasBrandText: { fontFamily: fonts.body, fontSize: 9, color: 'rgba(255,255,255,0.85)' },
  placed: { position: 'absolute', width: STICKER, height: STICKER, alignItems: 'center', justifyContent: 'center' },
  placedEmoji: { fontSize: 52 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, textAlign: 'center' },
  trayLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, alignSelf: 'flex-start', textTransform: 'uppercase', letterSpacing: 1 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  trayItem: { width: 62, height: 72, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 2 },
  trayEmoji: { fontSize: 30 },
  trayName: { fontFamily: fonts.body, fontSize: 9, color: colors.brownLight },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch', ...shadow.button },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  locked: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  lockedEmoji: { fontSize: 44 },
  lockedText: { fontFamily: fonts.body, fontSize: 14, color: colors.brownLight, textAlign: 'center', lineHeight: 20 },
});
