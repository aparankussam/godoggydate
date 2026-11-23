// mobile/components/VibeTypeCard.tsx
// Mirrors web/components/VibeTypeCard.tsx — decodes the Vibe Check archetype
// into a tappable "type" card, reused on a dog's own profile and a matched
// dog's profile.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { Glyph } from './pack/kit';
import type { DogArchetype } from '../../shared/types';

interface Props {
  archetype: DogArchetype;
}

export default function VibeTypeCard({ archetype }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable onPress={() => setExpanded((v) => !v)} style={styles.card}>
      <Text style={styles.eyebrow}>Vibe Check · a photo read, just for fun</Text>
      <View style={styles.row}>
        <Glyph name="star-four-points" size={22} />
        <View style={styles.info}>
          <Text style={styles.name}>{archetype.name}</Text>
          <Text style={styles.hint}>Tap to see why</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View style={styles.expanded}>
          <Text style={styles.description}>{archetype.description}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadow.card,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.brownMid,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sparkle: { fontSize: 22 },
  info: { flex: 1 },
  name: { fontFamily: fonts.display, fontSize: 19, color: colors.brown },
  hint: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, marginTop: 1 },
  chevron: { fontSize: 12, color: colors.brownMid },
  expanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,160,23,0.2)',
  },
  description: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
});
