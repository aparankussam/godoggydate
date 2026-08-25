// mobile/components/DogtypeCard.tsx
// The shareable Dogtype identity card — a 9:16 artifact that says, in one
// glance, "my dog is a Zoomie Menace 🌪️". Mirrors web/components/DogtypeCard.tsx.
// Wrapped in forwardRef<View> so react-native-view-shot can capture it as a PNG
// (same path as DogTradingCard). This is the free acquisition hook: the social
// object a stranger sees on TikTok/IG and wants for their own dog.

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

// Spark dogs (Energy axis = E) get a fiery gradient, Zen dogs a warm calm one —
// collectible variety while staying inside the brand palette.
function gradientFor(code: string): [string, string, string] {
  const spark = code[0] === 'E';
  return spark
    ? ['#7A2E0E', '#E8633A', '#F5B731']
    : ['#241A2E', '#5C3D2E', '#C98A5E'];
}

const DogtypeCard = forwardRef<View, Props>(({ dogtype, dogName, photoUrl }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={gradientFor(dogtype.code)}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Header — the memorable identity is the name + emoji below, so the
          eyebrow just names the system. No cryptic 4-letter stamp. */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Dogtype</Text>
      </View>

      {/* Hero avatar */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          {/* Emoji sits underneath the photo, so if a remote photo hasn't
              decoded yet at capture time the card still shows a meaningful
              avatar instead of an empty circle. */}
          <Text style={styles.avatarEmoji}>{dogtype.emoji}</Text>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={[StyleSheet.absoluteFill, styles.avatarPhoto]} />
          ) : null}
        </View>
        {photoUrl ? (
          <View style={styles.emojiBadge}>
            <Text style={styles.emojiBadgeText}>{dogtype.emoji}</Text>
          </View>
        ) : null}
      </View>

      {/* Info panel */}
      <View style={styles.info}>
        <Text style={styles.owner}>{dogName}&apos;s Dogtype</Text>
        <Text style={styles.name}>{dogtype.name}</Text>
        <Text style={styles.tagline}>{dogtype.tagline}</Text>
        <Text style={styles.blurb}>{dogtype.blurb}</Text>

        {/* Axis readout — the four real dimensions, straight from the profile */}
        <View style={styles.axisGrid}>
          {dogtype.axes.map((a) => (
            <View key={a.key} style={styles.axisChip}>
              <Text style={styles.axisEmoji}>{a.pole.emoji}</Text>
              <Text style={styles.axisLabel}>{a.pole.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.brand}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

DogtypeCard.displayName = 'DogtypeCard';
export default DogtypeCard;

const CARD_WIDTH = 340;
const CARD_HEIGHT = (CARD_WIDTH * 16) / 9;
const AVATAR = 150;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.brown,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 20,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.4,
  },
  hero: {
    alignItems: 'center',
    marginTop: 28,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarEmoji: { fontSize: 88 },
  emojiBadge: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    right: CARD_WIDTH / 2 - AVATAR / 2 - 8,
    bottom: -6,
  },
  emojiBadgeText: { fontSize: 30 },
  info: {
    marginTop: 'auto',
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  owner: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  name: {
    color: '#fff',
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 34,
    marginTop: 2,
  },
  tagline: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.semibold,
    fontStyle: 'italic',
    fontSize: 14,
    marginTop: 4,
  },
  blurb: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  axisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  axisChip: {
    width: (CARD_WIDTH - 44 - 6) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  axisEmoji: { fontSize: 15 },
  axisLabel: { color: '#fff', fontFamily: fonts.bold, fontSize: 11 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  brand: { color: '#fff', fontFamily: fonts.display, fontSize: 14 },
  brandUrl: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: fonts.body },
});
