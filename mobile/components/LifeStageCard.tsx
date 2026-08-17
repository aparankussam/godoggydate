// mobile/components/LifeStageCard.tsx
// "Life in Dog Years, done right" — mirrors web/components/LifeStageCard.tsx.
// A size-aware life-stage read framed strictly as a cohort average (never a
// prediction about this dog), with a gentle "what this stage needs" line that
// ties into Cadence. When there's no birth year it nudges to add one rather
// than guessing an age. It never shows a "0 more years" death-clock — once the
// dog is past the cohort average it celebrates that instead.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { computeLifeStage } from '../../shared/lifeStage';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
  /** Opens the profile editor so the owner can add a birth year. */
  onEditProfile?: () => void;
}

export default function LifeStageCard({ savedProfile, onEditProfile }: Props) {
  const read = computeLifeStage({
    birthYear: savedProfile.birthYear,
    birthMonth: savedProfile.birthMonth,
    size: savedProfile.size,
  });
  const name = savedProfile.name?.trim() || 'Your dog';

  // No birth year yet — offer to add one instead of inventing an age.
  if (!read) {
    return (
      <View style={styles.nudgeCard}>
        <Text style={styles.nudgeTitle}>🎂 {name}&apos;s life stage</Text>
        <Text style={styles.nudgeBody}>
          Add {name}&apos;s birth year and we&apos;ll show where they are in their life, and what this stage needs.
        </Text>
        {onEditProfile && (
          <Pressable onPress={onEditProfile}>
            <Text style={styles.nudgeLink}>Add birth year</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const yearsLabel = read.ageYears === 0
    ? 'Under a year old'
    : `${read.ageYears} year${read.ageYears === 1 ? '' : 's'} old`;
  const remaining = Math.round(read.cohortYearsRemaining);
  const percent = Math.round(read.percentOfLife * 100);

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Life stage</Text>
            <Text style={styles.stage}>{read.stageEmoji} {read.stageLabel}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.age}>{yearsLabel}</Text>
            <Text style={styles.humanYears}>~{read.humanYearsEstimate} in human years</Text>
          </View>
        </View>

        <Text style={styles.blurb}>{read.stageBlurb}</Text>

        {/* Progress through a cohort-average life */}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        {read.outlivedCohort ? (
          <Text style={styles.note}>
            Dogs {name}&apos;s size live about {read.cohortLifespan} years on average — and{' '}
            <Text style={styles.noteStrong}>{name} is already living past it</Text>. Every extra day is a gift.
            Keep them comfortable and keep the walks coming.
          </Text>
        ) : (
          <Text style={styles.note}>
            Dogs {name}&apos;s size live about {read.cohortLifespan} years on average — so, as a cohort, roughly{' '}
            <Text style={styles.noteStrong}>{remaining} more year{remaining === 1 ? '' : 's'}</Text> of walks
            together. An average, not a prediction.
          </Text>
        )}
      </View>

      {/* What this stage needs — the honest hook into Cadence */}
      <View style={styles.focusRow}>
        <Text style={styles.focusText}>
          <Text style={styles.focusStrong}>This stage: </Text>{read.stageFocus}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadow.card,
  },
  body: { paddingHorizontal: 18, paddingVertical: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  stage: { fontFamily: fonts.display, fontSize: 24, color: colors.brown, marginTop: 1 },
  age: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown },
  humanYears: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 1 },
  blurb: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 8 },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.creamDark,
    overflow: 'hidden',
    marginTop: 12,
  },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.gold },
  note: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, lineHeight: 16, marginTop: 6 },
  noteStrong: { fontFamily: fonts.bold, color: colors.brownMid },
  focusRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: `${colors.creamDark}4D`,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  focusText: { fontFamily: fonts.body, fontSize: 12, color: colors.brownMid, lineHeight: 18 },
  focusStrong: { fontFamily: fonts.bold, color: colors.brown },
  nudgeCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nudgeTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  nudgeBody: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 18, marginTop: 4 },
  nudgeLink: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary, marginTop: 8 },
});
