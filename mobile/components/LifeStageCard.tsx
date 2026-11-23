// mobile/components/LifeStageCard.tsx
// "Life in Dog Years, done right" — mirrors web/components/LifeStageCard.tsx.
// A size-aware life-stage read framed strictly as a cohort average (never a
// prediction about this dog), with a gentle "what this stage needs" line that
// ties into Cadence. When there's no birth year it nudges to add one rather
// than guessing an age. It never shows a "0 more years" death-clock — once the
// dog is past the cohort average it celebrates that instead.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { Glyph } from './pack/kit';
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Glyph name="cake-variant" size={20} /><Text style={[styles.nudgeTitle, { flexShrink: 1 }]}>{name}&apos;s life stage</Text></View>
        <Text style={styles.nudgeBody}>
          Add {name}&apos;s birth year and we&apos;ll show where they are in their life, and what this stage needs.
        </Text>
        {onEditProfile && (
          <Pressable onPress={onEditProfile} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
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
            <Text style={styles.stage}>{read.stageLabel}</Text>
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
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: 'hidden',
    marginBottom: 20,
  },
  body: { paddingHorizontal: 18, paddingVertical: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eyebrow: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.brownMid,
  },
  stage: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, marginTop: 1 },
  age: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  humanYears: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, marginTop: 1 },
  blurb: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 8 },
  track: {
    height: 14,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    overflow: 'hidden',
    marginTop: 12,
  },
  fill: { height: '100%', backgroundColor: colors.ink },
  note: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid, lineHeight: 18, marginTop: 8 },
  noteStrong: { fontFamily: fonts.black, color: colors.ink },
  focusRow: {
    borderTopWidth: 2,
    borderTopColor: colors.ink,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  focusText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  focusStrong: { fontFamily: fonts.black, color: colors.brown },
  nudgeCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    ...shadow.card,
  },
  nudgeTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  nudgeBody: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },
  nudgeLink: { fontFamily: fonts.black, fontSize: 15, color: colors.ink, textDecorationLine: 'underline', marginTop: 8 },
});
