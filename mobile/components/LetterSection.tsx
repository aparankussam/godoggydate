// mobile/components/LetterSection.tsx
// Profile-mounted surface for "The Gotcha Day Letter" — mirrors
// web/components/LetterSection.tsx. It renders ONLY when a real occasion the
// owner entered — a Gotcha Day or birthday — is active or coming up within the
// window (shared/milestones.ts via pickLetterMilestone). The owner taps once;
// the already-deployed server writes a warm ~150-word letter FROM the dog,
// grounded only in the dog's stored facts and cached per occasion, and it
// renders on a sealed-letter card they can share. Openly AI-written, nothing
// invented — the honesty label is baked into the shared PNG by LetterCard.

import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import {
  requestLetter,
  pickLetterMilestone,
  isLetterConfigured,
  type Letter,
  type LetterKind,
} from '../lib/letter';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';
import LetterCard from './LetterCard';

interface Props {
  savedProfile: SavedDogProfile;
}

export default function LetterSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const milestone = pickLetterMilestone(savedProfile);

  // No real Gotcha Day / birthday near, or the writer isn't configured for this
  // build — render nothing. The letter is never offered for a date the owner
  // didn't enter.
  if (!milestone || !isLetterConfigured()) return null;

  const kindLabel = milestone.kind === 'gotcha' ? 'Gotcha Day' : 'birthday';
  const when = milestone.isActive
    ? 'today'
    : milestone.daysUntil === 1
      ? 'tomorrow'
      : `in ${milestone.daysUntil} days`;

  async function handleGenerate() {
    if (busy || !milestone) return;
    setBusy(true);
    setError(null);
    trackEvent('letter_generate_click', { kind: milestone.kind });
    try {
      // pickLetterMilestone only ever returns gotcha/birthday, but Milestone's
      // kind is the wider MilestoneKind union — narrow it for the API.
      const result = await requestLetter(milestone.kind as LetterKind);
      setLetter(result);
      trackEvent('letter_generated', {
        kind: result.kind,
        sparse: result.sparse,
        cached: result.cached,
        model: result.model ?? 'unknown',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the letter. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (sharing || !letter) return;
    setSharing(true);
    trackEvent('letter_share_click', { kind: letter.kind });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-${letter.kind}-letter.png`,
      letter.occasion,
    );
    if (result === 'shared') trackEvent('letter_shared', { kind: letter.kind, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>
          {milestone.emoji}{' '}
          {milestone.isActive ? `It's ${dogName}'s ${kindLabel}` : `${dogName}'s ${kindLabel} is ${when}`}
        </Text>
        <Text style={styles.title}>💌 The {kindLabel} Letter</Text>
        <Text style={styles.blurb}>
          A warm keepsake letter from {dogName} for{' '}
          {milestone.kind === 'gotcha' ? 'the day they came home' : 'their birthday'} — written by AI from the
          real moments on their profile, never anything made up.
        </Text>
      </View>

      {!letter && (
        <Pressable
          style={[styles.primaryButton, busy && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryText}>Write {dogName}&apos;s letter</Text>
          )}
        </Pressable>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {letter && (
        <>
          {/* The sealed-letter card (captured for sharing). Constrained width so
              the 9:16 keepsake sits neatly inside the profile column. */}
          <View style={styles.cardFrame}>
            <LetterCard
              ref={cardRef}
              salutation={letter.salutation}
              body={letter.body}
              signOff={letter.signOff}
              dogName={letter.dogName || dogName}
              occasion={letter.occasion}
              occasionSubtitle={letter.occasionSubtitle}
            />
          </View>

          <Pressable
            style={[styles.secondaryButton, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={styles.secondaryText}>
              {sharing ? 'Rendering…' : `📤 Share ${dogName}'s letter`}
            </Text>
          </Pressable>

          {letter.sparse ? (
            <Text style={styles.footnote}>
              A shorter letter — add {dogName}&apos;s breed, temperament, and play style on your profile for a
              fuller one.
            </Text>
          ) : null}
          <Text style={styles.footnote}>
            Written with AI in {dogName}&apos;s voice, grounded only in what you told us — nothing invented.
          </Text>
        </>
      )}
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
  head: { gap: 4 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 1 },
  blurb: { fontFamily: fonts.body, fontSize: 13, color: colors.brownMid, lineHeight: 19, marginTop: 2 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary, textAlign: 'center' },
  cardFrame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    lineHeight: 15,
    textAlign: 'center',
  },
});
