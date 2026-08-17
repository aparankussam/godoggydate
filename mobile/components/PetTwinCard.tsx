// mobile/components/PetTwinCard.tsx
// The daily "what I'm thinking today" card from a dog's Pet Twin — mirrors
// web/components/PetTwinCard.tsx. Reads the realtime moment stream, lets the
// owner ask for a new card (server enforces cadence: free weekly, Pro daily),
// and always shows the SOURCE CHIP — the real thing this card reacted to — plus
// an open "AI-imagined" label. That chip is the honesty contract: the card
// provably reacts to real state, it isn't a personality invented from thin air.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';
import { onLatestMoment, generatePetTwin, type PetTwinMoment } from '../lib/petTwin';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';

// Kept in lockstep with web/app/api/ai/pet-twin/route.ts (server is the source
// of truth; these are only for showing "next card in …").
const PRO_INTERVAL_MS = 20 * 60 * 60 * 1000;
const FREE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;

interface Props {
  dogId: string;
  dogName: string;
  isPro: boolean;
  /** Opens the Pro upsell (free users tap "a card every day" to upgrade). */
  onUpgrade?: () => void;
}

function relativeTime(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'now';
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 24) return hours <= 1 ? 'in about an hour' : `in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

export default function PetTwinCard({ dogId, dogName, isPro, onUpgrade }: Props) {
  const [moment, setMoment] = useState<PetTwinMoment | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!dogId) return;
    return onLatestMoment(dogId, setMoment);
  }, [dogId]);

  const now = Date.now();
  const interval = isPro ? PRO_INTERVAL_MS : FREE_INTERVAL_MS;
  const nextAllowedMs = moment ? moment.createdAt + interval : 0;
  const throttled = moment ? now < nextAllowedMs : false;

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await generatePetTwin();
      if (result.moment) setMoment(result.moment);
      trackEvent('pet_twin_generated', {
        throttled: result.throttled,
        is_pro: result.isPro,
        source: result.moment?.sourceKind ?? 'in_progress',
      });
    } catch (err) {
      Alert.alert('Pet Twin', err instanceof Error ? err.message : 'Could not get today’s card.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (sharing || !moment) return;
    setSharing(true);
    trackEvent('pet_twin_share_click');
    const result = await captureAndShare(cardRef, `${dogName.toLowerCase().replace(/\s+/g, '-')}-today.png`, `${dogName} today`);
    if (result === 'shared') trackEvent('pet_twin_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  const cadenceLabel = isPro ? 'a new card every day' : 'a new card every week';

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Pet Twin</Text>
          <Text style={styles.title}>{dogName}&apos;s day</Text>
        </View>
        <Text style={styles.cadence}>{cadenceLabel}</Text>
      </View>

      {/* The card itself (captured for sharing) */}
      <View ref={cardRef} collapsable={false} style={styles.card}>
        <LinearGradient
          colors={['#5C3D2E', '#B45309', '#E8633A']}
          locations={[0, 0.6, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {moment ? (
          <>
            <View style={styles.moodRow}>
              <Text style={styles.moodEmoji}>{moment.moodEmoji}</Text>
              <Text style={styles.moodLabel}>{moment.mood}</Text>
            </View>
            <Text style={styles.thought}>“{moment.thought}”</Text>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceChip}>
                ✨ imagined from <Text style={styles.sourceStrong}>{moment.sourceLabel}</Text>
              </Text>
              <Text style={styles.signoff}>— {dogName}</Text>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💭</Text>
            <Text style={styles.emptyText}>
              {dogName} hasn&apos;t shared a thought yet. Get their first card — it&apos;s written from something
              real about them today.
            </Text>
          </View>
        )}

        {/* Brand + link INSIDE the captured view so a reposted PNG (captions get
            stripped by social apps) still carries a working back-link — the
            shareCard.ts contract every other card upholds. */}
        <View style={styles.cardBrand}>
          <Text style={styles.cardBrandName}>GoDoggyDate</Text>
          <Text style={styles.cardBrandUrl}>godoggydate.com</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {(!moment || !throttled) && (
          <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} onPress={handleGenerate} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryText}>{moment ? "Get today's card" : `Meet ${dogName}'s Pet Twin`}</Text>
            )}
          </Pressable>
        )}

        {moment && throttled && (
          <>
            <Pressable style={[styles.secondaryButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
              <Text style={styles.secondaryText}>{sharing ? 'Rendering…' : '📤 Share today’s card'}</Text>
            </Pressable>
            <Text style={styles.nextLine}>
              Next card {relativeTime(nextAllowedMs, now)}.
              {!isPro && onUpgrade ? (
                <Text style={styles.upgradeLink} onPress={onUpgrade}>{'  '}Get a card every day with Pro</Text>
              ) : null}
            </Text>
          </>
        )}

        {moment && !throttled && (
          <Pressable onPress={handleShare} disabled={sharing}>
            <Text style={styles.subtleShare}>{sharing ? 'Rendering…' : '📤 Share this card'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.brown, marginTop: 1 },
  cadence: { fontFamily: fonts.semibold, fontSize: 10, color: colors.brownLight },
  card: {
    margin: 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: 18,
  },
  moodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moodEmoji: { fontSize: 30 },
  moodLabel: {
    color: colors.goldLight,
    fontFamily: fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  thought: { color: '#fff', fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 12 },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  sourceChip: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.body, fontSize: 10, flex: 1 },
  sourceStrong: { color: 'rgba(255,255,255,0.92)', fontFamily: fonts.bold },
  signoff: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.body, fontSize: 10 },
  empty: { paddingVertical: 8 },
  emptyEmoji: { fontSize: 26 },
  emptyText: { color: '#fff', fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  cardBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  cardBrandName: { color: '#fff', fontFamily: fonts.display, fontSize: 13 },
  cardBrandUrl: { color: 'rgba(255,255,255,0.55)', fontFamily: fonts.body, fontSize: 10 },
  actions: { paddingHorizontal: 18, paddingBottom: 16, gap: 8 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  nextLine: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 17 },
  upgradeLink: { fontFamily: fonts.bold, color: colors.primary },
  subtleShare: { textAlign: 'center', fontFamily: fonts.semibold, fontSize: 13, color: colors.brownLight },
});
