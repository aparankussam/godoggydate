// mobile/components/playroom/Collar.tsx
// The Collar of Charms strip at the top of the Playroom: one charm per toy
// tried, blanks for the rest, and a pointer to the next one. Tap any charm to
// open its toy.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { InkLink, card } from '../pack/kit';
import { CHARMS, charmLabel, nextCharm, type Charm } from '../../lib/charms';

interface Props {
  earned: string[];
  dogName: string;
  onPick: (charm: Charm) => void;
}

export default function Collar({ earned, dogName, onPick }: Props) {
  const count = CHARMS.filter((c) => earned.includes(c.id)).length;
  const next = nextCharm(earned);
  const title = next
    ? `${count} of ${CHARMS.length} charms on ${dogName}'s collar`
    : `${dogName} is Fully Charmed 🏅`;

  return (
    <View style={[card.paper, styles.wrap]}>
      <Text style={styles.eyebrow}>Collar of Charms</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.band}>
        {CHARMS.map((c) => {
          const on = earned.includes(c.id);
          const label = charmLabel(c, dogName);
          return (
            <Pressable
              key={c.id}
              onPress={() => onPick(c)}
              accessibilityRole="button"
              accessibilityLabel={on ? `${label} charm` : `${label}, not tried yet`}
              style={[styles.charm, on ? styles.charmOn : styles.charmOff]}
            >
              <Text style={[styles.emoji, !on && styles.blank]}>{on ? c.emoji : '?'}</Text>
            </Pressable>
          );
        })}
      </View>
      {next && <InkLink label={`Next charm: ${next.emoji} ${charmLabel(next, dogName)}`} onPress={() => onPick(next)} />}
    </View>
  );
}

const SIZE = 38;

const styles = StyleSheet.create({
  wrap: { borderRadius: 22, padding: 16, gap: 10 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink },
  band: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.kraft,
  },
  charm: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  charmOn: { backgroundColor: colors.goldLight, borderColor: colors.ink },
  charmOff: { backgroundColor: colors.cream, borderColor: colors.brownMid, borderStyle: 'dashed' },
  emoji: { fontSize: 19 },
  blank: { fontFamily: fonts.black, fontSize: 16, color: colors.brownMid },
});
