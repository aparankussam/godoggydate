// mobile/components/HumanReviewSection.tsx
// Profile surface for "My Human: A Review" — mirrors web/components/HumanReviewSection.tsx.
// The dog files a deadpan, review-site-style write-up of its owner: a benign star
// score, honest Pros, gentle "Areas for improvement", and a verdict. Openly
// labelled a playful AI read, never a real judgement of a person.
//
// CADENCE: a QUARTERLY keepsake, not a spammable generator. The server enforces
// the hard per-uid volume cap + anti-burst lock; on the client we cache the last
// review locally (per uid, via AsyncStorage) and gate a fresh one to once every
// ~90 days, re-showing the saved review in between with a note on when the next
// is due. The owner can always re-share the card they already have.
//
// Self-contained: reads only the owner's own profile + a locally-cached result.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius } from '../constants/theme';
import { requestHumanReview, type HumanReview } from '../lib/humanReview';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import HumanReviewCard from './HumanReviewCard';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
  /** The owner's uid — namespaces the local quarterly cache and is passed to the
   *  server for parity (the server derives the uid from the ID token anyway). */
  userId: string;
}

// ~One quarter. The cadence is deliberately slow: the review is a keepsake.
const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;
const NOTE_MAX_LEN = 240;

interface CachedReview {
  review: HumanReview;
  dateLabel: string;
  generatedAtMs: number;
}

function cacheKey(uid: string): string {
  return `gdd:humanReview:${uid}`;
}

function formatToday(): string {
  try {
    return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatNextDue(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch {
    return 'next quarter';
  }
}

export default function HumanReviewSection({ savedProfile, userId }: Props) {
  const cardRef = useRef<View>(null);
  const [note, setNote] = useState('');
  const [review, setReview] = useState<HumanReview | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [generatedAtMs, setGeneratedAtMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  // Hydrate any cached review after mount (async storage — never blocks render).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey(userId));
        if (!raw || !active) return;
        const parsed = JSON.parse(raw) as CachedReview;
        if (!parsed?.review || typeof parsed.generatedAtMs !== 'number') return;
        setReview(parsed.review);
        setDateLabel(parsed.dateLabel);
        setGeneratedAtMs(parsed.generatedAtMs);
      } catch {
        /* corrupt / unavailable cache — cadence just falls back to server caps */
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const now = Date.now();
  const nextDueMs = generatedAtMs !== null ? generatedAtMs + QUARTER_MS : null;
  const onCooldown = nextDueMs !== null && now < nextDueMs;

  async function handleGenerate() {
    if (busy || onCooldown) return;
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    trackEvent('human_review_generate_click', { note_len: note.trim().length });
    try {
      const result = await requestHumanReview({ userId, note: note.trim() || undefined });
      const label = formatToday();
      const at = Date.now();
      setReview(result);
      setDateLabel(label);
      setGeneratedAtMs(at);
      try {
        await AsyncStorage.setItem(
          cacheKey(userId),
          JSON.stringify({ review: result, dateLabel: label, generatedAtMs: at } satisfies CachedReview),
        );
      } catch {
        /* private mode / quota — cadence just falls back to server caps */
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      trackEvent('human_review_generated', { model: result.model ?? 'unknown', stars: result.stars });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the review. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (sharing || !review) return;
    setSharing(true);
    trackEvent('human_review_share_click');
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-reviews-their-human.png`,
      `${dogName} reviewed their human`,
    );
    if (result === 'shared') trackEvent('human_review_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  const remaining = NOTE_MAX_LEN - note.length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Just for fun</Text>
        <Text style={styles.title}>⭐ My Human: A Review</Text>
        <Text style={styles.intro}>
          {dogName} would like to review their human — deadpan star rating, honest pros, and a few gentle notes
          for improvement. A quarterly keepsake, written by AI in {dogName}&apos;s voice.
        </Text>
      </View>

      {!review && (
        <View style={styles.noteBlock}>
          <Text style={styles.noteLabel}>
            Anything {dogName} especially appreciates? <Text style={styles.noteOptional}>(optional)</Text>
          </Text>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX_LEN))}
            placeholder="Extra long morning walks. Shares the good treats."
            placeholderTextColor={colors.brownLight}
            multiline
            style={styles.noteInput}
            maxLength={NOTE_MAX_LEN}
          />
          <View style={styles.noteFooter}>
            <Text style={styles.noteHint}>A playful AI read — not a real rating.</Text>
            <Text style={styles.noteCount}>{remaining}</Text>
          </View>
        </View>
      )}

      {!onCooldown && (
        <Pressable
          style={[styles.primaryButton, busy && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryText}>
              {review ? `Write ${dogName}'s new review` : `Get ${dogName}'s review`}
            </Text>
          )}
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {review && (
        <>
          <View style={styles.cardWrap}>
            <HumanReviewCard
              ref={cardRef}
              stars={review.stars}
              headline={review.headline}
              pros={review.pros}
              improvements={review.improvements}
              verdict={review.verdict}
              dogName={review.dogName || dogName}
              dateLabel={dateLabel}
            />
          </View>

          <Pressable
            style={[styles.secondaryButton, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={styles.secondaryText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s review`}</Text>
          </Pressable>

          {onCooldown && nextDueMs !== null && (
            <Text style={styles.cadenceNote}>
              {dogName}&apos;s next review is due {formatNextDue(nextDueMs)}. Share this one until then.
            </Text>
          )}

          <Text style={styles.cadenceNote}>
            A playful star rating written by AI in {dogName}&apos;s voice — not a real score, and never a
            judgement of you.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: `${colors.creamDark}4D`, // ~30%
    padding: 18,
    marginBottom: 16,
    gap: 12,
  },
  header: { gap: 4 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, lineHeight: 24 },
  intro: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  noteBlock: { gap: 6 },
  noteLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown },
  noteOptional: { fontFamily: fonts.body, color: colors.brownLight },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteHint: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  noteCount: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary, textAlign: 'center' },
  cardWrap: { alignItems: 'center', marginTop: 4 },
  cadenceNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    lineHeight: 15,
    textAlign: 'center',
  },
});
