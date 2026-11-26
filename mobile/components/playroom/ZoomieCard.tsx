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
  /** Not tried yet: a small corner tag, instead of the old Collar grid. */
  isNew?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export default function ZoomieCard({ label, glimpse, glyph, thumb, active, isNew, onPress, accessibilityLabel }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, active && styles.active, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (isNew ? `${label}, not tried yet. ${glimpse}` : `${label}. ${glimpse}`)}
      onPress={onPress}
    >
      {isNew && (
        <View style={styles.tag} accessibilityElementsHidden>
          <Text style={styles.tagText}>New</Text>
        </View>
      )}
      <View style={styles.icon}>{thumb ?? <Glyph name={glyph} size={26} />}</View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <Text style={styles.glimpse} numberOfLines={3}>{glimpse}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
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
  tag: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.rose, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, zIndex: 1 },
  tagText: { fontFamily: fonts.black, fontSize: 10, color: colors.cream, letterSpacing: 0.3 },
  icon: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.note, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontFamily: fonts.display, fontSize: 18, lineHeight: 21, color: colors.ink },
  glimpse: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17, color: colors.brownMid },
});
