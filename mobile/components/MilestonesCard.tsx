// mobile/components/MilestonesCard.tsx
// The celebration surface — birthdays, Gotcha Days, GoDoggyDate anniversaries.
// Mirrors web/components/MilestonesCard.tsx. When one is active it becomes a
// shareable celebration card; otherwise it's a quiet countdown to the next real
// occasion. Every date here is one the owner actually entered — no invented
// monthaversaries.

import { forwardRef, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';
import { computeMilestones, type Milestone } from '../../shared/milestones';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

const CelebrationCard = forwardRef<View, { milestone: Milestone; dogName: string }>(
  ({ milestone, dogName }, ref) => (
    <View ref={ref} collapsable={false} style={styles.celebrate}>
      <LinearGradient
        colors={['#B45309', '#E8633A', '#F5B731']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.celebrateEmoji}>{milestone.emoji}</Text>
      <Text style={styles.celebrateTitle}>{milestone.title}</Text>
      <Text style={styles.celebrateSubtitle}>{milestone.subtitle}</Text>
      <Text style={styles.celebrateFooter}>🐾 {dogName} on GoDoggyDate · godoggydate.com</Text>
    </View>
  ),
);
CelebrationCard.displayName = 'CelebrationCard';

export default function MilestonesCard({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const { active, next } = computeMilestones({
    name: savedProfile.name,
    birthYear: savedProfile.birthYear,
    birthMonth: savedProfile.birthMonth,
    birthDay: savedProfile.birthDay,
    adoptionDate: savedProfile.adoptionDate,
    createdAt: savedProfile.createdAt,
  });

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const celebrating = active[0] ?? null;

  async function handleShare() {
    if (sharing || !celebrating) return;
    setSharing(true);
    trackEvent('milestone_share_click', { kind: celebrating.kind });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-${celebrating.kind}.png`,
      celebrating.title,
    );
    if (result === 'shared') trackEvent('milestone_shared', { kind: celebrating.kind, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  // Nothing real to celebrate or count down to — render nothing.
  if (!celebrating && !next) return null;

  if (celebrating) {
    return (
      <View style={styles.section}>
        <Text style={styles.todayLabel}>🎉 Today</Text>
        <CelebrationCard ref={cardRef} milestone={celebrating} dogName={dogName} />
        <Pressable style={[styles.shareButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
          <Text style={styles.shareText}>
            {sharing ? 'Rendering…' : `📤 Share ${dogName}'s ${celebrating.kind === 'birthday' ? 'birthday' : 'day'}`}
          </Text>
        </Pressable>
        {active.length > 1 && (
          <Text style={styles.more}>+{active.length - 1} more to celebrate this month</Text>
        )}
      </View>
    );
  }

  // Countdown to the next real occasion.
  return (
    <View style={styles.countdownCard}>
      <Text style={styles.eyebrow}>Coming up</Text>
      <View style={styles.countdownRow}>
        <Text style={styles.countdownEmoji}>{next!.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.countdownTitle} numberOfLines={1}>{next!.title}</Text>
          <Text style={styles.countdownSub}>
            {next!.subtitle} · {next!.daysUntil === 1 ? 'tomorrow' : `in ${next!.daysUntil} days`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  todayLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  celebrate: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: 24,
    alignItems: 'center',
  },
  celebrateEmoji: { fontSize: 48 },
  celebrateTitle: { fontFamily: fonts.display, fontSize: 24, color: '#fff', marginTop: 8, textAlign: 'center' },
  celebrateSubtitle: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4, textAlign: 'center' },
  celebrateFooter: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    width: '100%',
    textAlign: 'center',
  },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  more: { textAlign: 'center', fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  countdownCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  countdownEmoji: { fontSize: 26 },
  countdownTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  countdownSub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 1 },
});
