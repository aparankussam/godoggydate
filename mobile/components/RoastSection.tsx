// mobile/components/RoastSection.tsx
// Profile surface for "Roast My Dog (Certified Affectionate)" — mirrors
// web/components/RoastSection.tsx. The owner taps once and the already-deployed
// server route roasts their own dog, grounded ONLY on the traits already on
// file (breed, Dogtype, age, energy, play styles) with no free-text input. Out
// comes a 9:16 comedy-club poster: three loving roast lines and one warm
// closing compliment they can share. Openly labeled as AI comedy — every jab is
// affectionate, and it never touches weight, a rescue past, or health.

import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { requestRoast, type Roast } from '../lib/roast';
import RoastCard from './RoastCard';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

export default function RoastSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [roast, setRoast] = useState<Roast | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    trackEvent('roast_generate_click', {});
    try {
      const result = await requestRoast();
      setRoast(result);
      trackEvent('roast_generated', { model: result.model ?? 'unknown' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the roast. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (sharing || !roast) return;
    setSharing(true);
    trackEvent('roast_share_click', {});
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-roast.png`,
      `Roasting ${dogName}`,
    );
    if (result === 'shared') trackEvent('roast_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Just for fun</Text>
        <Text style={styles.title}>🎤 Roast {dogName}</Text>
        <Text style={styles.blurb}>
          A certified <Text style={styles.blurbEm}>affectionate</Text> roast: three loving jabs at{' '}
          {dogName}&apos;s zoomies, drama, and nap schedule, then one warm compliment to land it. Built only from{' '}
          {dogName}&apos;s own profile — never a word about their body, past, or health.
        </Text>
      </View>

      <Pressable
        style={[styles.primaryButton, busy && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryText}>{roast ? `Roast ${dogName} again` : `Roast ${dogName}`}</Text>
        )}
      </Pressable>

      <Text style={styles.cadence}>
        Written by AI, all in good fun. A few fresh sets a day — then the club rests.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {roast && (
        <>
          {/* The card itself — captured to PNG at full resolution regardless of
              the display scale applied by the wrapper below. */}
          <View style={styles.cardScaleWrap}>
            <View style={styles.cardScale}>
              <RoastCard
                ref={cardRef}
                dogName={roast.dogName || dogName}
                lines={roast.lines}
                compliment={roast.compliment}
              />
            </View>
          </View>

          <Pressable
            style={[styles.secondaryButton, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={styles.secondaryText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s roast`}</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            A playful roast written by AI — every line is affectionate, and {dogName} is a very good dog.
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
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 1 },
  blurb: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },
  blurbEm: { fontFamily: fonts.bold, fontStyle: 'italic', color: colors.brownMid },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  cadence: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 8,
  },
  error: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  cardScaleWrap: {
    height: 500, // 604 card height * 0.82 scale, leaving no dead space
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 16,
    overflow: 'hidden',
  },
  cardScale: { transform: [{ scale: 0.82 }], transformOrigin: 'top' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 8,
  },
});
