// mobile/components/DogtypeCompatCard.tsx
// The two-dog "do our dogs get along?" card — the app's one true invite loop
// (sharing it invites a second owner to find their dog's type and compare).
// Deterministic + honest: a playful vibe verdict from shared/dogtypeCompat,
// never a fabricated match %. forwardRef<View> for react-native-view-shot.
//
// Attribution is the FORMAT, not a watermark: the "A × B → verdict" layout is
// the recognizable signature (Co-Star-style), with only a small handle at the
// bottom that reads as an invite, not an ad badge.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';
import type { Dogtype, DogtypeCompat } from '../../shared/dogtype';

interface Props {
  aType: Dogtype;
  bType: Dogtype;
  aName: string;
  bName?: string;
  compat: DogtypeCompat;
}

function DogPole({ type, name }: { type: Dogtype; name: string }) {
  return (
    <View style={styles.pole}>
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>{type.emoji}</Text>
      </View>
      <Text style={styles.poleName} numberOfLines={1}>{name}</Text>
      <Text style={styles.poleType} numberOfLines={1}>{type.name}</Text>
    </View>
  );
}

const DogtypeCompatCard = forwardRef<View, Props>(({ aType, bType, aName, bName, compat }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={['#3A2416', '#7A3B1E', '#C98A5E']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Text style={styles.header}>Do our dogs get along?</Text>

      <View style={styles.poleRow}>
        <DogPole type={aType} name={aName} />
        <View style={styles.vs}>
          <Text style={styles.vsEmoji}>{compat.emoji}</Text>
        </View>
        <DogPole type={bType} name={bName || bType.name} />
      </View>

      <View style={styles.verdict}>
        <Text style={styles.headline}>{compat.headline}</Text>
        <Text style={styles.note}>{compat.note}</Text>
        <Text style={styles.disclaimer}>a playful vibe from their Dogtypes — not a score</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.brand}>GoDoggyDate</Text>
        <Text style={styles.cta}>What&apos;s your dog? · godoggydate.com/dogtype</Text>
      </View>
    </View>
  );
});

DogtypeCompatCard.displayName = 'DogtypeCompatCard';
export default DogtypeCompatCard;

const CARD_WIDTH = 340;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.brown,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  header: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  poleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  pole: { width: 116, alignItems: 'center' },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 52 },
  poleName: { color: '#fff', fontFamily: fonts.display, fontSize: 18, marginTop: 8 },
  poleType: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.semibold, fontSize: 11, marginTop: 1 },
  vs: { width: 48, alignItems: 'center' },
  vsEmoji: { fontSize: 34 },
  verdict: {
    marginTop: 20,
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  headline: { color: '#fff', fontFamily: fonts.display, fontSize: 24, textAlign: 'center', lineHeight: 27 },
  note: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.body,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#fff', fontFamily: fonts.display, fontSize: 14 },
  cta: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.body, fontSize: 10 },
});
