// mobile/components/TextsSection.tsx
// Profile surface for "Texts From Your Dog" — mirrors web/components/TextsSection.tsx.
// The owner taps generate and gets a short, unhinged chat-bubble thread of
// messages their dog supposedly sent, on a shareable card. Openly labeled as
// imagined by AI — the dog cannot really text. Cadence is WEEKLY (enforced
// server-side); the copy sets that expectation so a throttle message doesn't
// feel like a bug.
//
// Grounded honestly: we always pass today's weekday as real "day context", plus
// an optional owner note (a walk, the vet trip, a treat). The server ignores any
// unsafe topic in that note; the note is untrusted and only riffed on.

import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { requestDogTexts, type DogTexts } from '../lib/texts';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import TextsCard from './TextsCard';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

const NOTE_MAX_LEN = 160;

function weekdayContext(): string {
  try {
    const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    return `It's ${day}.`;
  } catch {
    return '';
  }
}

export default function TextsSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [note, setNote] = useState('');
  const [thread, setThread] = useState<DogTexts | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const trimmedNote = note.trim();
    const context = [weekdayContext(), trimmedNote].filter(Boolean).join(' ');
    trackEvent('texts_generate_click', { has_note: trimmedNote.length > 0 });
    try {
      const result = await requestDogTexts(context);
      setThread(result);
      trackEvent('texts_generated', { model: result.model ?? 'unknown', count: result.texts.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get the thread. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (sharing || !thread) return;
    setSharing(true);
    trackEvent('texts_share_click');
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-texts.png`,
      `Texts from ${dogName}`,
    );
    if (result === 'shared') trackEvent('texts_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  const remaining = NOTE_MAX_LEN - note.length;

  return (
    <View style={styles.section}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>Just for fun</Text>
        <Text style={styles.title}>💬 Texts From {dogName}</Text>
        <Text style={styles.blurb}>
          If {dogName} had a phone, it would be chaos. Get a short thread of the unhinged texts they
          fired off — a new one each week.
        </Text>
      </View>

      <Text style={styles.label}>
        Anything going on today? <Text style={styles.labelHint}>(optional)</Text>
      </Text>
      <TextInput
        value={note}
        onChangeText={(t) => setNote(t.slice(0, NOTE_MAX_LEN))}
        placeholder="A long walk. A squirrel. The mail came."
        placeholderTextColor={colors.brownLight}
        style={styles.input}
        editable={!busy}
        returnKeyType="done"
      />
      <View style={styles.metaRow}>
        <Text style={styles.metaNote}>Imagined by AI — {dogName} cannot really text.</Text>
        <Text style={styles.metaCount}>{remaining}</Text>
      </View>

      <Pressable
        style={[styles.primaryButton, busy && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryText}>{thread ? 'Get a new thread' : `See ${dogName}'s texts`}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {thread && (
        <>
          <View style={styles.cardWrap}>
            <TextsCard ref={cardRef} texts={thread.texts} dogName={thread.dogName || dogName} />
          </View>

          <Pressable
            style={[styles.secondaryButton, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={styles.secondaryText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s texts`}</Text>
          </Pressable>

          <Text style={styles.footerNote}>
            A playful thread imagined by AI in {dogName}&apos;s voice — {dogName} did not actually send these.
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
  headerBlock: { marginBottom: 12 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 1 },
  blurb: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown, marginBottom: 6 },
  labelHint: { fontFamily: fonts.body, color: colors.brownLight },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaNote: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, flex: 1 },
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
  error: {
    marginTop: 10,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
  },
  cardWrap: { marginTop: 16, alignItems: 'center' },
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
  footerNote: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    lineHeight: 16,
    textAlign: 'center',
  },
});
