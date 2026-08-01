import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';

interface Props {
  dogName: string;
  dogBreed?: string;
  photo?: string;
  /** null = this playdate has no rating. Renders no star row and no verdict
   *  line rather than inventing either. */
  stars: number | null;
}

/** Mirrors web/components/PlaydateMemoryCard.tsx. The card used to hardcode
 *  "It went great." under every rating, so a 1-star playdate still minted a
 *  card claiming it went great — a shareable artifact contradicting what the
 *  owner actually said. Say only what the rating supports. */
function verdictLine(stars: number | null): string | null {
  if (stars === null) return null;
  if (stars >= 5) return 'Best playdate yet.';
  if (stars === 4) return 'It went great.';
  if (stars === 3) return 'A good hang.';
  return null;
}

const PlaydateMemoryCard = forwardRef<View, Props>(({ dogName, dogBreed, photo, stars }, ref) => {
  const clampedStars = stars === null ? null : Math.max(0, Math.min(5, stars));
  const verdict = verdictLine(clampedStars);

  return (
    <View ref={ref} style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Playdate Confirmed</Text>
      </View>
      <Text style={styles.pawEmoji}>🎾</Text>

      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoFallback]}>
          <Text style={{ fontSize: 64 }}>🐕</Text>
        </View>
      )}
      <View style={styles.overlay} />

      <View style={styles.infoPanel}>
        {clampedStars !== null && clampedStars > 0 && (
          <Text style={styles.stars}>{'⭐'.repeat(clampedStars)}</Text>
        )}
        <Text style={styles.name}>Playdate with {dogName}</Text>
        {dogBreed && <Text style={styles.breed}>{dogBreed}</Text>}
        {verdict && <Text style={styles.tagline}>Our dogs played. {verdict}</Text>}

        <View style={styles.footer}>
          <Text style={styles.brand}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

PlaydateMemoryCard.displayName = 'PlaydateMemoryCard';
export default PlaydateMemoryCard;

const CARD_WIDTH = 320;
const CARD_HEIGHT = (CARD_WIDTH * 16) / 9;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.primaryDark,
  },
  badge: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { color: colors.gold, fontSize: 10, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 1 },
  pawEmoji: { position: 'absolute', top: 20, right: 20, zIndex: 10, fontSize: 22 },
  photo: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,26,14,0.55)' },
  infoPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 40 },
  stars: { fontSize: 24, marginBottom: 6 },
  name: { color: '#fff', fontFamily: fonts.display, fontSize: 26 },
  breed: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  tagline: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.semibold, fontSize: 13, marginTop: 10 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  brand: { color: '#fff', fontFamily: fonts.display, fontSize: 13 },
  brandUrl: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
});
