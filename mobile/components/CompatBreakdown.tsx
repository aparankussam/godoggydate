// mobile/components/CompatBreakdown.tsx
// Mirrors web/components/CompatBreakdown.tsx — the per-axis "why" behind a
// compatibility score. calculateCompatibility() computes this for every
// card in the deck; before this component existed it rendered nowhere on
// mobile, same gap as web had.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import type { CompatibilityResult } from '../../shared/types';

/** The seven axes calculateCompatibility() scores, with their max weights.
 *  Mirrors shared/utils/matchingEngine.ts — if the weights there change,
 *  these must change with them or the bars will misreport. */
const AXES = [
  { key: 'breedScore',     label: 'Breed group', max: 30 },
  { key: 'sizeScore',      label: 'Size safety', max: 20 },
  { key: 'energyScore',    label: 'Energy',      max: 15 },
  { key: 'goodWithScore',  label: 'Gets along',  max: 15 },
  { key: 'playStyleScore', label: 'Play style',  max: 10 },
  { key: 'healthScore',    label: 'Health',      max: 5  },
  { key: 'distanceScore',  label: 'Distance',    max: 5  },
] as const;

interface Props {
  breakdown: CompatibilityResult['breakdown'];
  score: number;
}

export default function CompatBreakdown({ breakdown, score }: Props) {
  return (
    <View style={styles.card}>
      {AXES.map((axis) => {
        const value = breakdown[axis.key] ?? 0;
        const pct = Math.max(0, Math.min(100, (value / axis.max) * 100));
        return (
          <View key={axis.key} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.axisLabel}>{axis.label}</Text>
              <Text style={styles.axisValue}>{Math.round(value)}/{axis.max}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
          </View>
        );
      })}
      {breakdown.penalty > 0 && (
        <View style={[styles.totalRow, styles.penaltyRow]}>
          <Text style={styles.penaltyLabel}>Safety penalty</Text>
          <Text style={styles.penaltyLabel}>−{breakdown.penalty}</Text>
        </View>
      )}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Match score</Text>
        <Text style={styles.totalLabel}>{score}/100</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  row: { gap: 3 },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 11,
    color: colors.brownLight,
  },
  axisValue: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 11,
    color: colors.brownLight,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  penaltyRow: { borderTopWidth: 1 },
  penaltyLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: '#DC2626',
  },
  totalLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: colors.brown,
  },
});
