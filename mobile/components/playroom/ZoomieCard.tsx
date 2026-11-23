// mobile/components/playroom/ZoomieCard.tsx
// One small card in the Playroom's "Zoomies" grid: icon or thumbnail, a name, and
// one line of real preview. Tapping opens the game or expands in place.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { Glyph, type GlyphName } from '../pack/kit';

interface Props {
  label: string;
  glimpse: string;
  glyph: GlyphName;
  thumb?: ReactNode;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export default function ZoomieCard({ label, glimpse, glyph, thumb, active, onPress, accessibilityLabel }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, active && styles.active, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}. ${glimpse}`}
      onPress={onPress}
    >
      <View style={styles.icon}>{thumb ?? <Glyph name={glyph} size={22} />}</View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <Text style={styles.glimpse} numberOfLines={3}>{glimpse}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 18,
    padding: 12,
    gap: 6,
    minHeight: 132,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 0,
  },
  active: { backgroundColor: colors.note },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  icon: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.note, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontFamily: fonts.display, fontSize: 18, lineHeight: 21, color: colors.ink },
  glimpse: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 17, color: colors.brownMid },
});
