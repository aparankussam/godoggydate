// mobile/components/playroom/NextToy.tsx
// The hand-off at the bottom of a toy: the next charm still missing from the
// collar, one tap away, so no toy ends at a dead end. Hidden once every charm
// is earned.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { PaperButton, card } from '../pack/kit';
import { useSession } from '../../lib/session';
import { CHARMS, charmLabel, nextCharm, useCharms } from '../../lib/charms';

export default function NextToy({ current }: { current: string }) {
  const { user, profile } = useSession();
  const { earned, go } = useCharms(user?.uid);
  const next = nextCharm(earned, current);
  if (!next || !user) return null;

  const dogName = profile?.name?.trim() || 'your dog';
  const left = CHARMS.filter((c) => !earned.includes(c.id)).length;

  return (
    <View style={[card.paper, styles.wrap]}>
      <Text style={styles.line}>
        {left} charm{left === 1 ? '' : 's'} left for {dogName}&apos;s collar. Next up:
      </Text>
      <PaperButton label={`${next.emoji}  ${charmLabel(next, dogName)}`} icon="arrow-right" onPress={() => go(next)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, padding: 14, gap: 10, alignSelf: 'stretch' },
  line: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
});
