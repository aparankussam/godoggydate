// mobile/components/EarnedStickers.tsx
// A small profile row — "Stickers earned" — showing the emoji decals the owner
// has genuinely unlocked by booping their dog's snoot (read through
// lib/boops.ts). Mirrors web/components/EarnedStickers.tsx: earned, not
// bought, and it links straight to the Sticker Studio to put them on a photo.
// Renders nothing until something's earned, so it never adds empty chrome.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts, radius } from '../constants/theme';
import { loadBoops, STICKERS, unlockedStickers } from '../lib/boops';
import { trackEvent } from '../lib/analytics';

interface Props {
  /** The owner's uid — the per-dog key for the boop count. */
  dogId: string;
}

export default function EarnedStickers({ dogId }: Props) {
  const [allTime, setAllTime] = useState<number | null>(null);

  // Re-read whenever the Profile tab comes back into focus: the owner may
  // have just been booping in the Playroom.
  useFocusEffect(
    useCallback(() => {
      if (!dogId) return undefined;
      let cancelled = false;
      loadBoops(dogId)
        .then((state) => { if (!cancelled) setAllTime(state.allTime); })
        .catch(() => { if (!cancelled) setAllTime(null); });
      return () => { cancelled = true; };
    }, [dogId]),
  );

  // Nothing earned yet (or not yet read) — render nothing.
  if (allTime === null || allTime <= 0) return null;
  const earned = unlockedStickers(allTime);
  if (earned.length === 0) return null;

  const next = STICKERS.find((sticker) => allTime < sticker.unlockAt) ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Stickers earned</Text>
          <Text style={styles.subtitle}>
            Unlocked by booping — {allTime.toLocaleString()} boop{allTime === 1 ? '' : 's'} so far.
          </Text>
        </View>
        <Pressable
          style={styles.useButton}
          accessibilityRole="button"
          accessibilityLabel="Use your stickers in the Sticker Studio"
          onPress={() => {
            trackEvent('fun_open', { feature: 'sticker_studio', source: 'profile_stickers' });
            router.push('/fun/sticker-studio');
          }}
        >
          <Text style={styles.useButtonText}>Use them →</Text>
        </Pressable>
      </View>

      <View style={styles.stickerRow}>
        {earned.map((sticker) => (
          <View
            key={sticker.id}
            style={styles.sticker}
            accessible
            accessibilityLabel={`${sticker.label} sticker`}
          >
            <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
          </View>
        ))}
      </View>

      {next && (
        <Text style={styles.next}>
          Next up: {next.emoji} {next.label} at {next.unlockAt.toLocaleString()} boops.{' '}
          <Text
            style={styles.nextLink}
            accessibilityRole="link"
            onPress={() => {
              trackEvent('fun_open', { feature: 'snoot', source: 'profile_stickers' });
              router.push('/fun/snoot');
            }}
          >
            Boop the snoot
          </Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.brownMid, marginTop: 2 },
  useButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  useButtonText: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary },
  stickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sticker: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${colors.creamDark}80`,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerEmoji: { fontSize: 22 },
  next: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 10, lineHeight: 17 },
  nextLink: { fontFamily: fonts.bold, color: colors.primary },
});
