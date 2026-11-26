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
import LostQr from './LostQr';
import BrandLogo from './BrandLogo';

interface Props {
  /** The Wanted joke poster. Not used when `lost` is set. */
  poster?: WantedPoster;
  dogName: string;
  photoUrl?: string;
  /** Turns the same parchment card into a real LOST poster: facts to recognize the
   *  dog, and a QR code to the public page. Never carries a phone number or address. */
  lost?: { facts: string[]; url: string };
}

const INK = '#3A2A16';
const INK_SOFT = '#6B4E2E';

const WantedPosterCard = forwardRef<View, Props>(({ poster, dogName, photoUrl, lost }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient colors={['#EBDCB8', '#E2CFA6', '#D8C08C']} style={StyleSheet.absoluteFill} />

      <View style={styles.frame}>
        <Text style={[styles.wanted, lost && styles.lostRed]}>{lost ? 'LOST' : 'WANTED'}</Text>
        <Text style={styles.deadOrAlive}>{lost ? 'HAVE YOU SEEN THIS DOG?' : 'DEAD OR ALIVE'}</Text>
        <Text style={styles.subtitle}>{lost ? `(please help bring ${dogName} home)` : '(prefers alive, for treats)'}</Text>

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
          {/* Sepia wash to sell the aged-photo look. Not on a LOST poster: people
              have to recognize the real colours of the dog. */}
          {!lost && <View style={styles.sepiaWash} pointerEvents="none" />}
        </View>

        {lost ? (
          <>
            <Text style={styles.alias}>{dogName}</Text>
            <View style={styles.divider} />
            <Text style={styles.chargesHeader}>HOW TO RECOGNIZE</Text>
            <View style={styles.crimes}>
              {lost.facts.map((f, i) => (
                <Text key={i} style={styles.crime}>{'✧'} {f}</Text>
              ))}
            </View>
            <View style={[styles.rewardBox, styles.qrBox]}>
              <LostQr text={lost.url} size={116} />
              <Text style={styles.rewardLabel}>SCAN TO TELL THE FAMILY</Text>
              <Text style={styles.qrNote}>No app needed. Their phone number stays private.</Text>
            </View>
          </>
        ) : poster ? (
          <>
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
          </>
        ) : null}

        <View style={styles.footer}>
          <BrandLogo height={26} />
          <Text style={styles.url}>{lost ? lost.url.replace(/^https?:\/\//, '') : 'godoggydate.com'}</Text>
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
  lostRed: { color: '#9B1C1C' },
  qrBox: { gap: 6, paddingVertical: 10 },
  qrNote: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT, textAlign: 'center' },
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
  url: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT },
});
