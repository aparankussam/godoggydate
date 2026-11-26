// mobile/components/SafetyCard.tsx
// Safety cards (lost-dog kit, emergency vet): a normal cream card with a soft
// red-tinted title strip, so they stand out without shouting. Solid red is kept
// for a real emergency only: SafetyButton is the red "My dog is lost".
// Mirrors web/components/SafetyCard.tsx.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../constants/theme';
import SirenIcon from './SirenIcon';

export function SafetyCard({ banner, icon, right, children }: { banner: string; icon: ReactNode; right?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.banner}>
        <View style={styles.bannerLabel}>
          {icon}
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
        {right ? <Text style={styles.bannerText}>{right}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/** The lost-dog action, with the siren. */
export function SafetyButton({ label, onPress, outline, accessibilityLabel }: {
  label: string;
  onPress: () => void;
  outline?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.btn, outline ? styles.btnOutline : styles.btnSolid, pressed && { opacity: 0.85 }]}
    >
      <SirenIcon color={outline ? colors.danger : '#fff'} />
      <Text style={[styles.btnText, outline && styles.btnTextOutline]}>{label}</Text>
    </Pressable>
  );
}

export const safetyText = StyleSheet.create({
  body: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  note: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17, color: colors.brownMid },
});

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderColor: colors.ink, borderRadius: 18, backgroundColor: colors.paper, overflow: 'hidden', marginBottom: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FDE8E8', borderBottomWidth: 2, borderBottomColor: colors.ink, paddingHorizontal: 14, paddingVertical: 7 },
  bannerText: { fontFamily: fonts.black, fontSize: 13, color: colors.danger, letterSpacing: 0.6 },
  bannerLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { padding: 14, gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 24, borderWidth: 2, paddingHorizontal: 12 },
  btnSolid: { backgroundColor: colors.danger, borderColor: colors.danger },
  btnOutline: { backgroundColor: colors.paper, borderColor: colors.danger },
  btnText: { fontFamily: fonts.black, fontSize: 15, color: '#fff', textAlign: 'center', flexShrink: 1 },
  btnTextOutline: { color: colors.danger },
});
