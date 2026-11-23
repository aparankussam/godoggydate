// mobile/components/PackDayRules.tsx
// The Pack Day house rules, shown verbatim from shared/packDay.ts as a calm
// slip, with the "I'll follow these" toggle that hosting and joining both
// require. The callables refuse without acceptedRules, so the toggle gates the
// button. Sits inside a paper card supplied by the screen.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { RulesSlip } from './pack/flyer';
import { Glyph, ink, paper } from './pack/kit';

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
      <RulesSlip />
      <Pressable
        style={styles.agreeRow}
        onPress={() => onChange(!accepted)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel={agreeLabel}
        hitSlop={6}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
          {accepted && <Glyph name="check-bold" size={16} color={paper} />}
        </View>
        <Text style={styles.agreeText}>{agreeLabel}</Text>
      </Pressable>
      {children}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: paper,
  },
  checkboxChecked: { backgroundColor: ink },
  agreeText: { flex: 1, fontFamily: fonts.black, fontSize: 15, lineHeight: 21, color: colors.ink },
});
