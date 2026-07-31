// mobile/components/VibeTypeCard.tsx
// Mirrors web/components/VibeTypeCard.tsx — decodes the Vibe Check archetype
// into a tappable "type" card, reused on a dog's own profile and a matched
// dog's profile.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { VIBE_CODE_AXES } from '../lib/vibeCheck';
import type { DogArchetype } from '../../shared/types';

interface Props {
  archetype: DogArchetype;
}

export default function VibeTypeCard({ archetype }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable onPress={() => setExpanded((v) => !v)} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{archetype.code}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>✨ {archetype.name}</Text>
          <Text style={styles.hint}>Tap to see why</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View style={styles.expanded}>
          <Text style={styles.description}>{archetype.description}</Text>
          <Text style={styles.axes}>4-axis read: {VIBE_CODE_AXES}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.3)',
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeBadge: {
    backgroundColor: colors.brown,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  codeText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.gold,
    letterSpacing: 2,
  },
  info: { flex: 1 },
  name: { fontFamily: fonts.display, fontSize: 17, color: colors.brown },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 1 },
  chevron: { fontSize: 12, color: colors.brownLight },
  expanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,160,23,0.2)',
  },
  description: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  axes: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
  },
});
