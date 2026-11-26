// mobile/components/MilestonesCard.tsx
// The celebration surface — birthdays, Gotcha Days, GoDoggyDate anniversaries.
// Mirrors web/components/MilestonesCard.tsx. When one is active it becomes a
// shareable celebration card; otherwise it's a quiet countdown to the next real
// occasion. Every date here is one the owner actually entered — no invented
// monthaversaries.

import { forwardRef, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, secondaryButton, shadow } from '../constants/theme';
import { Glyph } from './pack/kit';
import { computeMilestones, type Milestone } from '../../shared/milestones';
import { captureAndShare } from '../lib/shareCard';
import { dogPageUrl } from '../lib/webLinks';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
  /** The owner's uid. When set, shares carry a link to the dog's public page. */
  userId?: string;
  /** Owner view: offers "Add date" for a missing birthday or Gotcha Day (opens Edit at the dates). */
  onAddDate?: () => void;
}

const CelebrationCard = forwardRef<View, { milestone: Milestone; dogName: string }>(
  ({ milestone, dogName }, ref) => (
    <View ref={ref} collapsable={false} style={styles.celebrate}>
      <LinearGradient
        colors={['#B45309', '#FF5C8D', '#F5B731']}
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

export default function MilestonesCard({ savedProfile, userId, onAddDate }: Props) {
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
    // Same caption as web's MilestonesCard, plus the dog's public page.
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-${celebrating.kind}.png`,
      celebrating.title,
      {
        caption: `${celebrating.title} — ${celebrating.subtitle} 🎉`,
        url: userId ? dogPageUrl(savedProfile.name ?? '', userId) : undefined,
      },
    );
    if (result === 'shared') trackEvent('milestone_shared', { kind: celebrating.kind, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  // Real dates only, never samples: a missing one is shown as a gap to fill.
  const missing = onAddDate
    ? [
        !savedProfile.birthMonth && { key: 'birthday', emoji: '🎂', title: `${dogName}'s birthday` },
        !savedProfile.adoptionDate && { key: 'gotcha', emoji: '🏠', title: 'Gotcha Day' },
      ].filter((m): m is { key: string; emoji: string; title: string } => !!m)
    : [];

  // Nothing real to celebrate, count down to or fill in — render nothing.
  if (!celebrating && !next && missing.length === 0) return null;

  if (celebrating) {
    return (
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Glyph name="party-popper" size={18} /><Text style={styles.todayLabel}>Today</Text></View>
        <CelebrationCard ref={cardRef} milestone={celebrating} dogName={dogName} />
        <Pressable style={[styles.shareButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
          <Text style={styles.shareText}>
            {sharing ? 'Rendering…' : `Share ${dogName}'s ${celebrating.kind === 'birthday' ? 'birthday' : 'day'}`}
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
      {next && (
        <View style={styles.countdownRow}>
          <Text style={styles.countdownEmoji}>{next.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.countdownTitle} numberOfLines={1}>{next.title}</Text>
            <Text style={styles.countdownSub}>
              {next.subtitle} · {next.daysUntil === 1 ? 'tomorrow' : `in ${next.daysUntil} days`}
            </Text>
          </View>
        </View>
      )}
      {missing.map((m) => (
        <View key={m.key} style={[styles.countdownRow, styles.missingRow]}>
          <Text style={[styles.countdownEmoji, styles.missingFaded]}>{m.emoji}</Text>
          <Text style={[styles.countdownTitle, styles.missingFaded, { flex: 1 }]} numberOfLines={1}>{m.title}</Text>
          <Pressable onPress={onAddDate} accessibilityRole="button" accessibilityLabel={`Add ${m.title} date`} hitSlop={8} style={styles.addDate}>
            <Text style={styles.addDateText}>Add date</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  missingRow: { marginTop: 8 },
  missingFaded: { opacity: 0.55 },
  addDate: { borderWidth: 2, borderColor: colors.ink, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.paper },
  addDateText: { fontFamily: fonts.black, fontSize: 12, color: colors.ink },
  section: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    gap: 12,
    ...shadow.card,
  },
  todayLabel: {
    fontFamily: fonts.black,
    fontSize: 14,
    color: colors.ink,
  },
  celebrate: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: 24,
    alignItems: 'center',
  },
  celebrateEmoji: { fontSize: 48 },
  celebrateTitle: { fontFamily: fonts.display, fontSize: 24, color: '#fff', marginTop: 8, textAlign: 'center' },
  celebrateSubtitle: { fontFamily: fonts.bold, fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4, textAlign: 'center' },
  celebrateFooter: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    width: '100%',
    textAlign: 'center',
  },
  shareButton: {
    ...secondaryButton,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  shareText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  more: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid },
  countdownCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    ...shadow.card,
  },
  eyebrow: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.brownMid,
  },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  countdownEmoji: { fontSize: 26 },
  countdownTitle: { fontFamily: fonts.black, fontSize: 15, color: colors.brown },
  countdownSub: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, marginTop: 1 },
});
