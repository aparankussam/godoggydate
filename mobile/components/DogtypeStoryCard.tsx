// mobile/components/DogtypeStoryCard.tsx
// The 9:16 "story" share for a Dogtype — the vertical, full-bleed frame that
// Instagram / TikTok / Snapchat stories expect. Mirrors what web's
// DogtypeSection feeds web/components/StoryShareCard.tsx: one full-bleed photo,
// "Rex is a Zoomie Menace" as the headline, the tagline, the four trait chips
// and the baked-in GoDoggyDate footer. Deliberately spare: a story frame has to
// read in the half-second before a thumb keeps scrolling.
//
// Laid out at 360×640 points, so view-shot's capture at the screen's pixel
// ratio lands on 1080×1920 on a 3x iPhone (the story canvas web exports).
// DogtypeSection renders it off-screen and captures it through shareCard.ts.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';
import type { Dogtype } from '../../shared/dogtype';

interface Props {
  dogtype: Dogtype;
  dogName: string;
  photoUrl?: string;
}

// Same palettes as web's StoryShareCard themes (solid gradients only).
const GRADIENTS = {
  spark: { colors: ['#7A2E0E', '#FF5C8D', '#F5B731'] as const, locations: [0, 0.55, 1] as const },
  zen: { colors: ['#241A2E', '#4A3F6E', '#C98A5E'] as const, locations: [0, 0.5, 1] as const },
};

const DogtypeStoryCard = forwardRef<View, Props>(function DogtypeStoryCard({ dogtype, dogName, photoUrl }, ref) {
  // Web picks the theme the same way: Zen dogs get the calm palette.
  const theme = dogtype.axes[0]?.pole.label === 'Zen' ? GRADIENTS.zen : GRADIENTS.spark;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={theme.colors}
        locations={theme.locations}
        start={{ x: 0.33, y: 0 }}
        end={{ x: 0.67, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* The emoji sits under the photo, so a photo that hasn't decoded yet at
          capture time still leaves a meaningful frame. */}
      <View style={[StyleSheet.absoluteFill, styles.emojiFill]}>
        <Text style={styles.emojiFillText}>{dogtype.emoji}</Text>
      </View>
      {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : null}

      {/* Readability scrim — dark at the bottom so the text always contrasts. */}
      <LinearGradient
        colors={['rgba(42,31,74,0.96)', 'rgba(42,31,74,0.7)', 'rgba(42,31,74,0.08)', 'rgba(42,31,74,0)']}
        locations={[0, 0.3, 0.58, 0.74]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {photoUrl ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{dogtype.emoji}</Text>
        </View>
      ) : null}

      <View style={styles.textBlock}>
        <Text style={styles.kicker}>Dogtype</Text>
        <Text style={styles.headline}>
          {dogName} is {dogtype.name}
        </Text>
        <Text style={styles.subtext}>{dogtype.tagline}</Text>

        <View style={styles.chips}>
          {dogtype.axes.map((a) => (
            <View key={a.key} style={styles.chip}>
              <Text style={styles.chipEmoji}>{a.pole.emoji}</Text>
              <Text style={styles.chipLabel}>{a.pole.label}</Text>
            </View>
          ))}
        </View>

        {/* Baked-in brand footer — screenshots strip metadata, so the URL has
            to live on the pixels themselves. */}
        <View style={styles.footer}>
          <Text style={styles.brand}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

export default DogtypeStoryCard;

const WIDTH = 360;
const HEIGHT = (WIDTH * 16) / 9;

const styles = StyleSheet.create({
  card: { width: WIDTH, height: HEIGHT, overflow: 'hidden', backgroundColor: colors.brown },
  emojiFill: { alignItems: 'center', justifyContent: 'center' },
  emojiFillText: { fontSize: 160 },
  photo: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  badge: {
    position: 'absolute',
    top: 21,
    right: 21,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 31 },
  textBlock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 24 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  headline: { fontFamily: fonts.display, fontSize: 35, lineHeight: 37, color: '#fff', marginTop: 4 },
  subtext: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: 'rgba(255,255,255,0.85)', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  chipEmoji: { fontSize: 15 },
  chipLabel: { fontFamily: fonts.bold, fontSize: 12, color: '#fff' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 19,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  brand: { fontFamily: fonts.display, fontSize: 16, color: '#fff' },
  brandUrl: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.6)' },
});
