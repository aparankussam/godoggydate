// mobile/components/playroom/TodayCard.tsx
// The Playroom's first and only card: today's Barkle (the daily habit), then
// one untried toy featured in the dog's own voice, and a thin row of dots for
// how many of the 15 toys have been tried. Replaces the old two-card layout
// (a Barkle card plus a 15-slot Collar of Charms grid), which put a checklist
// above the daily habit. Mirrors web/components/playroom/TodayCard.tsx.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { PaperButton, PinkButton, card } from '../pack/kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CHARM_LIST, charmLabel, charmVoiceLine } from '../../../shared/charms';
import type { Charm } from '../../lib/charms';

export default function TodayCard({
  dogName,
  streakLine,
  onPlayBarkle,
  pick,
  onTryPick,
  earned,
}: {
  dogName: string;
  streakLine: string;
  onPlayBarkle: () => void;
  pick: Charm | null;
  onTryPick: (charm: Charm) => void;
  earned: string[];
}) {
  return (
    <View style={[card.paper, styles.wrap]}>
      <Text style={styles.eyebrow}>Today in the Playroom</Text>

      <View style={styles.barkleRow}>
        <Text style={styles.barkleTitle} numberOfLines={2}>{streakLine}</Text>
        <PinkButton label="Play" onPress={onPlayBarkle} style={styles.playBtn} />
      </View>

      <View style={styles.divider} />

      {pick ? (
        <>
          <Text style={styles.pickLabel}>{dogName}&apos;s pick: {charmLabel(pick, dogName)}</Text>
          <Text style={styles.pickVoice}>&ldquo;{charmVoiceLine(pick, dogName)}&rdquo;</Text>
          <View style={styles.pickRow}>
            <Dots earned={earned} />
            <PaperButton small label="Try it" onPress={() => onTryPick(pick)} />
          </View>
        </>
      ) : (
        <View style={styles.pickRow}>
          <View style={styles.doneRow}>
            <MaterialCommunityIcons name="trophy" size={18} color={colors.rose} />
            <Text style={styles.pickLabel}>{dogName} has tried every toy here</Text>
          </View>
          <Dots earned={earned} />
        </View>
      )}
    </View>
  );
}

function Dots({ earned }: { earned: string[] }) {
  return (
    <View style={styles.dots} accessibilityLabel={`${earned.length} of ${CHARM_LIST.length} toys tried`}>
      {CHARM_LIST.map((c) => (
        <View key={c.id} style={[styles.dot, earned.includes(c.id) && styles.dotOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 22, padding: 16, gap: 10 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  barkleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barkleTitle: { flex: 1, fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink },
  playBtn: { minHeight: 46, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  divider: { height: 2, backgroundColor: colors.border },
  pickLabel: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  pickVoice: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.brownMid, fontStyle: 'italic' },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.brownMid, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.goldLight, borderColor: colors.ink },
});
