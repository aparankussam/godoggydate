// mobile/components/LostDogCard.tsx
// The lost-dog kit, at the top of Profile > Care: safety first. Shows how ready
// the kit is ("2 of 4 ready" and what's missing) so it gets finished while all
// is calm; once complete it shrinks to one line. The emergency itself lives
// on its own screen (/lost/now), reached from the red "Lost?" buttons.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { Heading, Paper, PaperButton } from './pack/kit';
import { getLostKit, type LostKit } from '../lib/lostDog';
import { kitReadiness } from '../../shared/lostDog';

export default function LostDogCard({ uid, dogName }: { uid: string; dogName: string }) {
  const [kit, setKit] = useState<LostKit | null>(null);
  const load = useCallback(() => { getLostKit(uid).then(setKit).catch(() => setKit({})); }, [uid]);
  useEffect(load, [load]);
  useFocusEffect(load); // back from the kit screen with new answers

  const r = kitReadiness(kit);
  if (kit && r.done === r.total) {
    return (
      <Pressable onPress={() => router.push('/lost')} accessibilityRole="button" style={styles.readyRow}>
        <Text style={styles.readyText}>✓ Lost dog kit ready</Text>
        <Text style={styles.readyEdit}>Edit</Text>
      </Pressable>
    );
  }

  return (
    <Paper style={styles.card}>
      <View style={styles.headRow}>
        <Heading size={22}>Lost dog kit</Heading>
        {kit && <Text style={styles.count}>{r.done} of {r.total} ready</Text>}
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${(r.done / r.total) * 100}%` }]} /></View>
      <Text style={styles.body}>
        Finish it now, while all is calm. If {dogName} ever goes missing, one tap alerts your Pack and neighbors with all of it.
      </Text>
      {kit && r.missing.length > 0 && <Text style={styles.missing}>Still to add: {r.missing.join(', ')}</Text>}
      <PaperButton icon="clipboard-check-outline" label="Finish the kit" onPress={() => router.push('/lost')} />
    </Paper>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, marginBottom: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.creamDark, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.danger },
  body: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  missing: { fontFamily: fonts.black, fontSize: 13, color: colors.brownMid },
  readyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48,
    paddingHorizontal: 14, marginBottom: 16, borderRadius: 14, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper,
  },
  readyText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  readyEdit: { fontFamily: fonts.black, fontSize: 14, color: colors.rose, textDecorationLine: 'underline' },
});
