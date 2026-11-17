// mobile/components/PackDayRules.tsx
// The Pack Day house rules, shown verbatim from shared/packDay.ts, with the
// "I'll follow these" toggle that hosting and joining both require. The
// callables refuse without acceptedRules, so the toggle gates the button.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { PACK_DAY_RULES } from '../../shared/packDay';

interface Props {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  /** e.g. "I'll follow these rules." */
  agreeLabel: string;
  /** Small print under the toggle. */
  footer?: ReactNode;
  /** Rendered between the toggle and the footer, e.g. the join button. */
  children?: ReactNode;
}

export default function PackDayRules({ accepted, onChange, agreeLabel, footer, children }: Props) {
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>House rules</Text>
      <View style={styles.list}>
        {PACK_DAY_RULES.map((rule) => (
          <View key={rule} style={styles.ruleRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.ruleText}>{rule}</Text>
          </View>
        ))}
      </View>
      <Pressable
        style={styles.agreeRow}
        onPress={() => onChange(!accepted)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        hitSlop={6}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
          {accepted && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.agreeText}>{agreeLabel}</Text>
      </Pressable>
      {children}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  heading: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  list: { gap: 6 },
  ruleRow: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  ruleText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.brownLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },
  agreeText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.brown },
});
