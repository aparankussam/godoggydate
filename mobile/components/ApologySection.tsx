// mobile/components/ApologySection.tsx
// Profile surface for the "Notes-App Apology" — mirrors web/components/
// ApologySection.tsx. The owner types what their dog allegedly did, taps
// generate, and gets a formal celebrity-style non-apology in the dog's own voice
// on a notes-app card they can share. Openly labeled as AI, in the dog's voice —
// it's a joke, not a real statement. The card bakes the brand + URL inside the
// captured view (via ApologyCard) so a reposted PNG keeps its back-link.

import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { requestApology, CRIME_MAX_LEN, type Apology } from '../lib/apology';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';
import ApologyCard from './ApologyCard';

interface Props {
  savedProfile: SavedDogProfile;
}

function formatToday(): string {
  try {
    return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ApologySection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [crime, setCrime] = useState('');
  const [apology, setApology] = useState<Apology | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  async function handleGenerate() {
    const trimmed = crime.trim();
    if (busy || !trimmed) return;
    setBusy(true);
    trackEvent('apology_generate_click', { crime_len: trimmed.length });
    try {
      const result = await requestApology(trimmed);
      setApology(result);
      setDateLabel(formatToday());
      trackEvent('apology_generated', { model: result.model ?? 'unknown' });
    } catch (err) {
      Alert.alert('Apology', err instanceof Error ? err.message : 'Could not write the statement. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (sharing || !apology) return;
    setSharing(true);
    trackEvent('apology_share_click');
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-apology.png`,
      `A statement from ${dogName}`,
    );
    if (result === 'shared') trackEvent('apology_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  const remaining = CRIME_MAX_LEN - crime.length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Just for fun</Text>
        <Text style={styles.title}>📝 {dogName}&apos;s Notes-App Apology</Text>
        <Text style={styles.intro}>
          The celebrity non-apology, but it&apos;s a dog. Tell us what they did — {dogName} will issue a formal
          statement taking absolutely no responsibility.
        </Text>
      </View>

      <Text style={styles.label}>What did they do?</Text>
      <TextInput
        value={crime}
        onChangeText={(t) => setCrime(t.slice(0, CRIME_MAX_LEN))}
        placeholder="Ate an entire couch cushion. Again."
        placeholderTextColor={colors.brownLight}
        multiline
        style={styles.input}
      />
      <View style={styles.inputMeta}>
        <Text style={styles.metaNote}>Written by AI, in {dogName}&apos;s voice.</Text>
        <Text style={styles.metaCount}>{remaining}</Text>
      </View>

      <Pressable
        style={[styles.primaryButton, (busy || !crime.trim()) && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={busy || !crime.trim()}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryText}>
            {apology ? 'Write another statement' : `Get ${dogName}'s statement`}
          </Text>
        )}
      </Pressable>

      {apology && (
        <>
          <View style={styles.cardWrap}>
            <ApologyCard
              ref={cardRef}
              statement={apology.statement}
              signOff={apology.signOff}
              dogName={apology.dogName || dogName}
              dateLabel={dateLabel}
            />
          </View>

          <Pressable
            style={[styles.secondaryButton, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={styles.secondaryText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s statement`}</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            A playful statement written by AI in {dogName}&apos;s voice — not a real apology, and {dogName} means
            none of it.
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
  },
  header: { marginBottom: 12 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 2 },
  intro: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown, marginBottom: 6 },
  input: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    textAlignVertical: 'top',
  },
  inputMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaNote: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  metaCount: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    ...shadow.button,
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  cardWrap: { alignItems: 'center', marginTop: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 8,
  },
});
