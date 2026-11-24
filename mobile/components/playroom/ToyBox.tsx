// mobile/components/playroom/ToyBox.tsx
// A colored "toy bin" around a Playroom section: shows the first 4 cards and
// tucks the rest behind "Show all N", which grows the same box in place.
// Mirrors web/components/playroom/ToyBox.tsx.

import { Children, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';

const VISIBLE = 4;

interface Props {
  title: string;
  emoji: string;
  tint: string;
  // 'grid' = 2-column cards (tilted like stickers); 'stack' = full-width rows.
  layout: 'grid' | 'stack';
  children: ReactNode;
}

export default function ToyBox({ title, emoji, tint, layout, children }: Props) {
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  const extra = items.length - VISIBLE;
  const shown = all ? items : items.slice(0, VISIBLE);
  return (
    <View style={[styles.box, { backgroundColor: tint }]}>
      <View style={styles.head}>
        <Text style={styles.emoji} accessible={false}>{emoji}</Text>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
      </View>
      <View style={layout === 'grid' ? styles.grid : styles.stack}>
        {shown.map((c, i) => (
          <View key={i} style={layout === 'grid' ? [styles.cell, { transform: [{ rotate: i % 2 ? '1deg' : '-1deg' }] }] : undefined}>
            {c}
          </View>
        ))}
      </View>
      {extra > 0 && (
        <Pressable
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: all }}
          onPress={() => setAll((v) => !v)}
        >
          <Text style={styles.moreText}>{all ? 'Show less ▲' : `Show all ${items.length} ▼`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 2, borderColor: colors.ink, borderRadius: 24, padding: 14, gap: 12,
    shadowColor: colors.ink, shadowOpacity: 0.14, shadowOffset: { width: 0, height: 6 }, shadowRadius: 0,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 28, transform: [{ rotate: '-6deg' }] },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48%', flexGrow: 1 },
  stack: { gap: 10 },
  more: { minHeight: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  pressed: { transform: [{ scale: 0.96 }] },
});
