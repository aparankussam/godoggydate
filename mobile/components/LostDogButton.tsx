// mobile/components/LostDogButton.tsx
// The emergency entry, everywhere it's needed: a red "My dog is lost" that goes
// straight to the one-question alert screen (/lost/now). While the owner's
// alert is open it becomes "Kaju is missing" and opens the alert instead.
// `compact` is the round siren in the Pupfile header; LostSirenHint is the
// one-time tip under it. Mirrors web/components/LostDogButton.tsx.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts } from '../constants/theme';
import { onMyActiveAlert, type LostAlert } from '../lib/lostDog';
import { trackEvent } from '../lib/analytics';
import SirenIcon from './SirenIcon';

// The tip shows until it is dismissed or the siren is tapped once.
const HINT_KEY = 'lost_siren_hint_seen';
const hintListeners = new Set<() => void>();
function markHintSeen() {
  AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
  hintListeners.forEach((fn) => fn());
}

export function LostSirenHint({ dogName }: { dogName: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(HINT_KEY).then((v) => { if (alive) setShow(!v); }).catch(() => {});
    const hide = () => setShow(false);
    hintListeners.add(hide);
    return () => { alive = false; hintListeners.delete(hide); };
  }, []);
  if (!show) return null;
  return (
    <Pressable onPress={markHintSeen} accessibilityRole="button" accessibilityLabel="Dismiss tip" style={styles.hint}>
      <Text style={styles.hintText}>If {dogName} is ever lost, tap the siren. One tap alerts your pack.</Text>
      <MaterialCommunityIcons name="close" size={16} color={colors.cream} />
    </Pressable>
  );
}

export default function LostDogButton({ uid, dogName, compact }: { uid: string; dogName: string; compact?: boolean }) {
  const [active, setActive] = useState<LostAlert | null>(null);
  useEffect(() => onMyActiveAlert(uid, setActive), [uid]);

  const open = () => {
    trackEvent('lost_button_click', { where: compact ? 'pupfile' : 'neighbarkhood', active: !!active });
    if (compact) markHintSeen();
    router.push(active ? '/lost' : '/lost/now');
  };

  if (compact) {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={active ? `${dogName} is missing. Open the alert` : 'My dog is lost'}
        style={[styles.round, active && styles.roundActive]}
        hitSlop={6}
      >
        {/* 1pt low: the rays make the top heavier, so this looks centred. */}
        <View style={styles.siren}><SirenIcon size={23} color={active ? colors.ink : '#fff'} /></View>
        {active && <View style={styles.liveDot} />}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.big, pressed && { opacity: 0.85 }]}>
      <SirenIcon size={28} />
      <View style={{ flex: 1 }}>
        <Text style={styles.bigTitle}>{active ? `${dogName} is missing` : 'My dog is lost'}</Text>
        <Text style={styles.bigSub}>{active ? 'Open your alert: poster and sightings.' : 'One tap alerts your Pack and neighbors.'}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  big: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 18, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.ink, marginBottom: 16,
  },
  bigTitle: { fontFamily: fonts.display, fontSize: 22, color: '#fff' },
  bigSub: { fontFamily: fonts.bold, fontSize: 13, color: '#fff', opacity: 0.95 },
  round: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.danger,
    borderWidth: 2.5, borderBottomWidth: 4, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  // An alert is open: amber with a red live dot.
  roundActive: { backgroundColor: colors.gold },
  siren: { marginTop: 1 },
  liveDot: {
    position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.ink,
  },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  hintText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 19, color: colors.cream },
});
