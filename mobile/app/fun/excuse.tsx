// mobile/app/fun/excuse.tsx
// The "Official Dog Excuse Note" — iPhone port of web/app/excuse (ExcuseClient).
// Type your dog's name, your name and what you're getting out of, pick a
// reason, and share a formal-but-absurd note "issued" by your dog. The note is
// built by shared/excuseNote.ts (deterministic; no AI, no network) and is a
// JOKE by construction and by presentation (see ExcuseNoteCard: the "not a real
// doctor's note" ribbon, the paw seal, the disclaimer). It never imitates a
// real medical or employer document.
//
// Reads nothing from Firestore. The dog's name starts filled in from the
// signed-in profile; everything stays editable.

import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { BackHeader, Gingham, PinkButton, card } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { captureAndShare } from '../../lib/shareCard';
import { webUrl } from '../../lib/webLinks';
import { trackEvent } from '../../lib/analytics';
import NextToy from '../../components/playroom/NextToy';
import ExcuseNoteCard from '../../components/ExcuseNoteCard';
import { buildExcuseNote, EXCUSE_REASONS } from '../../../shared/excuseNote';

export default function ExcuseScreen() {
  const { profile } = useSession();
  const [dogName, setDogName] = useState(() => profile?.name?.trim() ?? '');
  const [ownerName, setOwnerName] = useState('');
  const [event, setEvent] = useState('');
  const [reasonId, setReasonId] = useState(EXCUSE_REASONS[0].id);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  const note = useMemo(
    () => buildExcuseNote({ dogName, ownerName, event, reasonId }),
    [dogName, ownerName, event, reasonId],
  );

  function pickReason(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setReasonId(id);
  }

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    trackEvent('excuse_share_click', { reason: reasonId });
    const safeDog = (dogName.trim() || 'dog').toLowerCase().replace(/\s+/g, '-');
    const result = await captureAndShare(cardRef, `${safeDog}-excuse-note.png`, 'An official note from my dog', {
      // Web's caption, reworded so the link that follows reads as part of it.
      caption: "My dog wrote me an official excuse note 🐾 and honestly the case is airtight. Make your dog's at",
      url: webUrl('/excuse'),
    });
    if (result === 'shared') trackEvent('excuse_shared', { reason: reasonId, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Excuse Note" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>The Dog Excuse Note</Text>
          <Text style={styles.title}>Let your dog get you out of it.</Text>
          <Text style={styles.lede}>
            An official-looking (and unmistakably fake) note from your dog explaining why you simply cannot make it.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Your dog&apos;s name</Text>
            <TextInput
              value={dogName}
              onChangeText={setDogName}
              placeholder="Biscuit"
              placeholderTextColor={colors.brownLight}
              maxLength={40}
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.input}
            />
          </View>

          <View>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Alex"
              placeholderTextColor={colors.brownLight}
              maxLength={40}
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.input}
            />
          </View>

          <View>
            <Text style={styles.label}>What are you getting out of?</Text>
            <TextInput
              value={event}
              onChangeText={setEvent}
              placeholder="the 9am standup"
              placeholderTextColor={colors.brownLight}
              maxLength={70}
              returnKeyType="done"
              style={styles.input}
            />
          </View>

          <View>
            <Text style={styles.label}>Pick your dog&apos;s reason</Text>
            <View style={styles.reasons}>
              {EXCUSE_REASONS.map((r) => {
                const active = r.id === reasonId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => pickReason(r.id)}
                    style={[styles.reason, active && styles.reasonActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={r.label}
                  >
                    <Text style={[styles.reasonLabel, active && styles.reasonLabelActive]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Live preview — this is what gets captured to PNG */}
        <View style={styles.preview}>
          <View style={styles.cardShadow}>
            <ExcuseNoteCard ref={cardRef} note={note} />
          </View>
        </View>

        <PinkButton label={sharing ? 'Preparing…' : 'Share the note'} icon="export-variant" onPress={handleShare} busy={sharing} />

        <Text style={styles.disclaimer}>
          It&apos;s a bit, obviously — the note is signed by a dog, stamped with a paw, and says right on it that it
          isn&apos;t a real document.
        </Text>
        <NextToy current="excuse" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontFamily: fonts.bold, fontSize: 16, color: colors.rose, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  intro: { alignItems: 'center', paddingHorizontal: 8 },
  eyebrow: {
    fontFamily: fonts.black,
    fontSize: 14,
    color: colors.ink,
  },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: colors.brown, textAlign: 'center', marginTop: 6 },
  lede: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink, textAlign: 'center', marginTop: 8 },
  form: {
    ...card.paper,
    padding: 18,
    gap: 14,
  },
  label: { fontFamily: fonts.black, fontSize: 13, color: colors.brown, marginBottom: 6 },
  input: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brown,
  },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonActive: { backgroundColor: colors.ink },
  reasonLabel: { fontFamily: fonts.black, fontSize: 13.5, color: colors.ink },
  reasonLabelActive: { color: colors.cream },
  preview: { alignItems: 'center' },
  // The shadow sits on a wrapper so it stays out of the captured image.
  cardShadow: { backgroundColor: '#FBF3E4', ...shadow.card },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryText: { fontFamily: fonts.black, fontSize: 16, color: colors.white },
  disclaimer: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
