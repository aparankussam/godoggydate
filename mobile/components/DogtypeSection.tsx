// mobile/components/DogtypeSection.tsx
// Profile surface for Dogtype — mirrors web/components/DogtypeSection.tsx.
// Computes the dog's deterministic type from its own profile, renders the
// shareable card, offers a 9:16 "Share as Story" version (DogtypeStoryCard,
// rendered off-screen for capture), and a "how we read this" disclosure of the
// four real axes.

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { colors, fonts, radius, shadow, secondaryButton } from '../constants/theme';
import { Glyph, poleGlyph } from './pack/kit';
import { getHeroPhoto } from '../lib/photos';
import { captureAndShare } from '../lib/shareCard';
import { webUrl } from '../lib/webLinks';
import { trackEvent } from '../lib/analytics';
import DogtypeCard from './DogtypeCard';
import DogtypeStoryCard from './DogtypeStoryCard';
import { computeDogtype } from '../../shared/dogtype';
import type { SavedDogProfile } from '../lib/profile';
import { resolveHeroIndex } from '../lib/coverPhoto';

interface Props {
  savedProfile: SavedDogProfile;
}

export default function DogtypeSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const storyRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [sharingStory, setSharingStory] = useState(false);
  const [showAxes, setShowAxes] = useState(false);

  const computed = computeDogtype(savedProfile);
  if (!computed) return null;
  // Capture as a non-null local so the async share closure keeps the narrowing.
  const dogtype = computed;

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile));

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    trackEvent('dogtype_share_click', { code: dogtype.code });
    // Same caption and /dogtype/<CODE> link as web's DogtypeSection, so the
    // person receiving it can look up their own dog's type.
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype.png`,
      `${dogName} is ${dogtype.name}`,
      {
        caption: `${dogName} is ${dogtype.name} ${dogtype.emoji} on GoDoggyDate. What's your dog's Dogtype?`,
        url: webUrl(`/dogtype/${dogtype.code}`),
      },
    );
    if (result === 'shared') trackEvent('dogtype_shared', { code: dogtype.code, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  async function handleStoryShare() {
    if (sharingStory) return;
    setSharingStory(true);
    trackEvent('story_share_click', { feature: 'dogtype', code: dogtype.code });
    // Same caption and link as web's story share.
    const result = await captureAndShare(
      storyRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-dogtype-story.png`,
      'My dog on GoDoggyDate',
      {
        caption: `${dogName} is ${dogtype.name} ${dogtype.emoji} on GoDoggyDate. What's your dog's Dogtype?`,
        url: webUrl(`/dogtype/${dogtype.code}`),
      },
    );
    if (result === 'shared') trackEvent('story_shared', { feature: 'dogtype', method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharingStory(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Dogtype</Text>
          <Text style={styles.title}>{dogtype.name}</Text>
        </View>
      </View>

      <Text style={styles.blurb}>{dogtype.blurb}</Text>

      {/* Trait chips — the warm, self-explanatory personality read that leads in
          place of the old 4-letter code. Same four axes, plainly named. */}
      <View style={styles.traitChips}>
        {dogtype.axes.map((a) => (
          <View key={a.key} style={styles.traitChip}>
            <Glyph name={poleGlyph(a.pole.label)} size={16} />
            <Text style={styles.traitChipLabel}>{a.pole.label}</Text>
          </View>
        ))}
      </View>

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
        <Text style={styles.shareText}>{sharing ? 'Preparing…' : `Share ${dogName}'s Dogtype`}</Text>
      </Pressable>

      <Pressable
        style={[styles.storyButton, sharingStory && { opacity: 0.6 }]}
        onPress={handleStoryShare}
        disabled={sharingStory}
        accessibilityRole="button"
        accessibilityHint="Shares a tall image sized for Instagram, TikTok and Snapchat stories"
      >
        <Text style={styles.storyText}>{sharingStory ? 'Preparing…' : 'Share as Story'}</Text>
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
              <Text style={styles.axisPole}>{a.pole.label}</Text>
              <Text style={styles.axisOther}>over {a.other.label}</Text>
            </View>
          ))}
          <Text style={styles.axesNote}>
            Read from what you told us — energy, play style, sociability, and temperament. It never changes on
            its own; update the profile and it updates with you. A playful identity, not a clinical test.
          </Text>
        </View>
      )}

      {/* Off-screen 9:16 story card — laid out for capture only, never seen. */}
      <View
        style={styles.offscreen}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <DogtypeStoryCard ref={storyRef} dogtype={dogtype} dogName={dogName} photoUrl={photo ?? undefined} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    padding: 18,
    marginBottom: 16,
    ...shadow.card,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  eyebrow: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.rose,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, marginTop: 1 },
  blurb: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  traitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  traitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  traitChipEmoji: { fontSize: 12 },
  traitChipLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown },
  cardScaleWrap: {
    height: 520, // 604 card height * 0.82 scale, leaving no dead space
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 12,
    overflow: 'hidden',
  },
  cardScale: { transform: [{ scale: 0.82 }], transformOrigin: 'top' },
  shareButton: {
    ...secondaryButton,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  storyButton: {
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  storyText: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  // Far off to the side (as web does) rather than above: this section sits deep
  // in the profile's scroll content, where a negative top could land on screen.
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  playsWith: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playsWithTitle: { fontFamily: fonts.black, fontSize: 13, color: colors.brown },
  playsWithList: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid, marginTop: 4 },
  playsWithNote: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, marginTop: 6, lineHeight: 15 },
  disclosureToggle: {
    fontFamily: fonts.black,
    fontSize: 12,
    color: colors.rose,
    marginTop: 12,
  },
  axesList: { marginTop: 8, gap: 8 },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  axisName: {
    width: 84,
    fontFamily: fonts.black,
    fontSize: 12,
    color: colors.brownMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  axisPole: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  axisOther: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid },
  axesNote: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, lineHeight: 15, marginTop: 2 },
});
