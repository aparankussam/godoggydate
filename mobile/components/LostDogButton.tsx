// mobile/components/LostDogButton.tsx
// The emergency entry, everywhere it's needed: a red "My dog is lost" that goes
// straight to the one-question alert screen (/lost/now). While the owner's
// alert is open it becomes "Kaju is missing" and opens the alert instead.
// `compact` is the small header pill on the Pupfile. Mirrors web/components/LostDogButton.tsx.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import { onMyActiveAlert, type LostAlert } from '../lib/lostDog';
import { trackEvent } from '../lib/analytics';

export default function LostDogButton({ uid, dogName, compact }: { uid: string; dogName: string; compact?: boolean }) {
  const [active, setActive] = useState<LostAlert | null>(null);
  useEffect(() => onMyActiveAlert(uid, setActive), [uid]);

  const open = () => {
    trackEvent('lost_button_click', { where: compact ? 'pupfile' : 'neighbarkhood', active: !!active });
    router.push(active ? '/lost' : '/lost/now');
  };

  if (compact) {
    return (
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={active ? `${dogName} is missing. Open the alert` : 'My dog is lost'} style={styles.pill} hitSlop={6}>
        <Ionicons name="alert-circle" size={16} color="#fff" />
        <Text style={styles.pillText}>{active ? 'Missing' : 'Lost?'}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.big, pressed && { opacity: 0.85 }]}>
      <Ionicons name="alert-circle" size={26} color="#fff" />
      <View style={{ flex: 1 }}>
        <Text style={styles.bigTitle}>{active ? `${dogName} is missing` : 'My dog is lost'}</Text>
        <Text style={styles.bigSub}>{active ? 'Open your alert: poster and sightings.' : 'One tap alerts your Pack and neighbors.'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#fff" />
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
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 22, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.ink,
  },
  pillText: { fontFamily: fonts.black, fontSize: 14, color: '#fff' },
});
