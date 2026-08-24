// mobile/components/DogtypeSection.tsx
// Profile surface for Dogtype — mirrors web/components/DogtypeSection.tsx.
// Computes the dog's deterministic type from its own profile, renders the
// shareable card, offers a playful "plays well with" line (clearly a vibe, not
// a measured score), and a "how we read this" disclosure of the four real axes.

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { getHeroPhoto } from '../lib/photos';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import DogtypeCard from './DogtypeCard';
import { computeDogtype } from '../../shared/dogtype';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

export default function DogtypeSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [showAxes, setShowAxes] = useState(false);

  const computed = computeDogtype(savedProfile);
  if (!computed) return null;
  // Capture as a non-null local so the async share closure keeps the narrowing.
  const dogtype = computed;

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(savedProfile.photos, savedProfile.ai?.vibeCheck?.heroPhotoIndex);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    trackEvent('dogtype_share_click', { code: dogtype.code });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype.png`,
      `Share ${dogName}'s Dogtype`,
    );
    if (result === 'shared') trackEvent('dogtype_shared', { code: dogtype.code, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Dogtype</Text>
          <Text style={styles.title}>{dogtype.emoji} {dogtype.name}</Text>
        </View>
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{dogtype.code}</Text>
        </View>
      </View>

      <Text style={styles.blurb}>{dogtype.blurb}</Text>

      {/* The card itself — captured to PNG at full resolution regardless of the
          display scale applied by the wrapper below. */}
      <View style={styles.cardScaleWrap}>
        <View style={styles.cardScale}>
          <DogtypeCard ref={cardRef} dogtype={dogtype} dogName={dogName} photoUrl={photo ?? undefined} />
        </View>
      </View>

      <Pressable
        style={[styles.shareButton, sharing && { opacity: 0.6 }]}
        onPress={handleShare}
        disabled={sharing}
      >
        <Text style={styles.shareText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s Dogtype`}</Text>
      </Pressable>

      {/* "Plays well with" now lives in the CompatExplorer (tap-to-reveal +
          real density), mounted right after this section on the profile. */}

      {/* How the type was read — the four real axes */}
      <Pressable onPress={() => setShowAxes((v) => !v)}>
        <Text style={styles.disclosureToggle}>{showAxes ? 'Hide the read ▲' : 'How we read this ▼'}</Text>
      </Pressable>
      {showAxes && (
        <View style={styles.axesList}>
          {dogtype.axes.map((a) => (
            <View key={a.key} style={styles.axisRow}>
              <Text style={styles.axisName}>{a.axis}</Text>
              <Text style={styles.axisPole}>{a.pole.emoji} {a.pole.label}</Text>
              <Text style={styles.axisOther}>over {a.other.label}</Text>
            </View>
          ))}
          <Text style={styles.axesNote}>
            Read from what you told us — energy, play style, sociability, and temperament. It never changes on
            its own; update the profile and it updates with you. A playful identity, not a clinical test.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.gold}4D`, // ~30%
    backgroundColor: `${colors.gold}14`, // ~8%
    padding: 18,
    marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, marginTop: 1 },
  codeBadge: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  codeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown, letterSpacing: 2 },
  blurb: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  cardScaleWrap: {
    height: 520, // 604 card height * 0.82 scale, leaving no dead space
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 12,
    overflow: 'hidden',
  },
  cardScale: { transform: [{ scale: 0.82 }], transformOrigin: 'top' },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  playsWith: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playsWithTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.brown },
  playsWithList: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownMid, marginTop: 4 },
  playsWithNote: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 6, lineHeight: 15 },
  disclosureToggle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
    marginTop: 12,
  },
  axesList: { marginTop: 8, gap: 8 },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  axisName: {
    width: 84,
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  axisPole: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown },
  axisOther: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  axesNote: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, lineHeight: 15, marginTop: 2 },
});
