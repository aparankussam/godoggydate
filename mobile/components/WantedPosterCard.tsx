// mobile/components/WantedPosterCard.tsx
// The shareable "WANTED" poster — a distressed Old-West parchment card built
// from shared/wanted.ts (all real, stored data reworded into frontier comedy).
// forwardRef<View> for react-native-view-shot capture. Brand + URL baked inside
// the captured region so a reposted PNG carries the back-link.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts } from '../constants/theme';
import type { WantedPoster } from '../../shared/wanted';

interface Props {
  poster: WantedPoster;
  dogName: string;
  photoUrl?: string;
}

const INK = '#3A2A16';
const INK_SOFT = '#6B4E2E';

const WantedPosterCard = forwardRef<View, Props>(({ poster, dogName, photoUrl }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient colors={['#EBDCB8', '#E2CFA6', '#D8C08C']} style={StyleSheet.absoluteFill} />

      <View style={styles.frame}>
        <Text style={styles.wanted}>WANTED</Text>
        <Text style={styles.deadOrAlive}>DEAD OR ALIVE</Text>
        <Text style={styles.subtitle}>(prefers alive, for treats)</Text>

        {/* Mugshot */}
        <View style={styles.mugFrame}>
          {/* Emoji sits behind the photo, so a just-picked shot that hasn't
              decoded yet still captures a meaningful mugshot, not a blank box. */}
          <View style={[styles.mug, styles.mugFallback]}>
            <Text style={{ fontSize: 72 }}>🐕</Text>
          </View>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={[StyleSheet.absoluteFill, styles.mug]} />
          ) : null}
          {/* Sepia wash to sell the aged-photo look */}
          <View style={styles.sepiaWash} pointerEvents="none" />
        </View>

        <Text style={styles.aka}>a.k.a.</Text>
        <Text style={styles.alias}>{poster.alias}</Text>
        <Text style={styles.realName}>(known to the law as {dogName})</Text>

        <View style={styles.divider} />
        <Text style={styles.chargesHeader}>WANTED FOR THE FOLLOWING CRIMES</Text>
        <View style={styles.crimes}>
          {poster.crimes.map((c, i) => (
            <Text key={i} style={styles.crime}>{'✧'} {c}</Text>
          ))}
        </View>

        <View style={styles.rewardBox}>
          <Text style={styles.rewardLabel}>REWARD</Text>
          <Text style={styles.reward}>{poster.reward}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.brand}>GoDoggyDate</Text>
          <Text style={styles.url}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

WantedPosterCard.displayName = 'WantedPosterCard';
export default WantedPosterCard;

const CARD_WIDTH = 340;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#E2CFA6',
  },
  frame: {
    margin: 10,
    borderWidth: 3,
    borderColor: INK,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  wanted: {
    fontFamily: fonts.display,
    fontSize: 52,
    color: INK,
    letterSpacing: 4,
    lineHeight: 56,
  },
  deadOrAlive: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: INK,
    letterSpacing: 3,
    marginTop: 2,
  },
  subtitle: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 12, color: INK_SOFT, marginTop: 2 },
  mugFrame: {
    width: 180,
    height: 180,
    marginTop: 14,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: '#CBB488',
    overflow: 'hidden',
  },
  mug: { width: '100%', height: '100%', resizeMode: 'cover' },
  mugFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#CBB488' },
  sepiaWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(90,60,20,0.22)' },
  aka: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: INK_SOFT, marginTop: 12 },
  alias: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: INK,
    textAlign: 'center',
    lineHeight: 30,
    marginTop: 2,
  },
  realName: { fontFamily: fonts.body, fontSize: 11, color: INK_SOFT, marginTop: 2 },
  divider: { height: 2, backgroundColor: INK, alignSelf: 'stretch', marginVertical: 12, opacity: 0.7 },
  chargesHeader: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: INK,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  crimes: { alignSelf: 'stretch', gap: 4 },
  crime: { fontFamily: fonts.semibold, fontSize: 13, color: INK, lineHeight: 18 },
  rewardBox: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  rewardLabel: { fontFamily: fonts.bold, fontSize: 12, color: INK, letterSpacing: 2 },
  reward: { fontFamily: fonts.display, fontSize: 18, color: INK, marginTop: 2, textAlign: 'center' },
  footer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: INK_SOFT,
    paddingTop: 8,
  },
  brand: { fontFamily: fonts.display, fontSize: 13, color: INK },
  url: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT },
});
