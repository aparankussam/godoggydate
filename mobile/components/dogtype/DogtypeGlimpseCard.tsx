// mobile/components/dogtype/DogtypeGlimpseCard.tsx
// The owner's own Dogtype, kept short. Before the first reveal it is SEALED (no
// name, no chips) so the reveal stays a surprise. After that it is a collapsed
// glimpse (sticker, name, tagline, trait chips); tapping opens the full card in
// place. It is collapsed again every time the tab is left and come back to.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { Glyph } from '../pack/kit';
import DogtypeSection from '../DogtypeSection';
import { loadRevealed, onDiscoveriesChange } from '../../lib/dogtypeDiscovery';
import { trackEvent } from '../../lib/analytics';
import { computeDogtype } from '../../../shared/dogtype';
import type { SavedDogProfile } from '../../lib/profile';

export default function DogtypeGlimpseCard({ savedProfile, userId }: { savedProfile: SavedDogProfile; userId: string }) {
  const type = computeDogtype(savedProfile);
  const dogName = savedProfile.name?.trim() || 'Your dog';
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => void loadRevealed(userId).then(setRevealed);
    load();
    return onDiscoveriesChange(load);
  }, [userId]);

  // Collapsed on every new visit: closing happens when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      void loadRevealed(userId).then(setRevealed);
      return () => setOpen(false);
    }, [userId]),
  );

  if (!type || revealed === null) return null;

  if (!revealed) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, styles.sealed, pressed && { opacity: 0.92 }]}
        accessibilityRole="button"
        accessibilityLabel={`Reveal ${dogName}'s Dogtype`}
        accessibilityHint="Plays a short reveal of their personality type"
        onPress={() => {
          trackEvent('dogtype_reveal_cta');
          router.push('/dogtype-reveal');
        }}
      >
        <View style={styles.sealedSticker}><Text style={styles.sealedQ}>?</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Dogtype</Text>
          <Text style={styles.title}>Tap to reveal {dogName}’s Dogtype</Text>
          <Text style={styles.sub}>A shareable card, read from their real profile.</Text>
        </View>
        <Glyph name="chevron-right" size={26} />
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.glimpse}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${dogName} is ${type.name}. ${open ? 'Hide' : 'See'} the full Dogtype`}
        onPress={() => setOpen((v) => !v)}
      >
        <View style={styles.sticker}><Text style={styles.stickerEmoji}>{type.emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{dogName} is</Text>
          <Text style={styles.title}>{type.name}</Text>
          <Text style={styles.tagline}>{type.tagline}</Text>
        </View>
      </Pressable>
      <View style={styles.chips}>
        {type.axes.map((a) => (
          <View key={a.key} style={styles.chip}>
            <Text style={styles.chipText}>{a.pole.emoji} {a.pole.label}</Text>
          </View>
        ))}
      </View>
      {open ? (
        <>
          <DogtypeSection savedProfile={savedProfile} embedded />
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() => {
              trackEvent('dogtype_reveal_cta', { replay: true });
              router.push('/dogtype-reveal');
            }}
          >
            <Text style={styles.rowText}>▶ Replay reveal</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable style={styles.row} accessibilityRole="button" onPress={() => setOpen((v) => !v)}>
        <Text style={styles.rowText}>{open ? 'Show less ▲' : `See ${dogName}’s full Dogtype ▼`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 0,
  },
  sealed: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sealedSticker: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.brownMid, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.creamDark },
  sealedQ: { fontFamily: fonts.display, fontSize: 32, color: colors.brownMid },
  glimpse: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sticker: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.goldLight, borderWidth: 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  stickerEmoji: { fontSize: 32 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  tagline: { fontFamily: fonts.hand, fontSize: 20, lineHeight: 22, color: colors.ink },
  sub: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: fonts.black, fontSize: 12, color: colors.ink },
  row: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontFamily: fonts.black, fontSize: 14, color: colors.rose },
});
