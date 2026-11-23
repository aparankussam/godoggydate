import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import { StickerDog } from './sticker';

interface Props {
  dogName: string;
  dogBreed?: string;
  /** The dog's primary photo — the one it leads with (cover pick, else AI
   *  hero, else first real photo), not raw photos[0], which can be the
   *  '_placeholder_' padding token. */
  photo?: string | null;
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
  const renderablePhoto = photo && photo.trim() && photo.trim() !== '_placeholder_' ? photo : null;

  return (
    <View ref={ref} style={styles.card}>
      {renderablePhoto ? (
        <Image source={{ uri: renderablePhoto }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoFallback]}>
          <StickerDog size={140} label={`A drawn sticker dog standing in for ${dogName}`} />
        </View>
      )}
      <LinearGradient
        colors={['rgba(42,31,74,0)', 'rgba(42,31,74,0.5)', 'rgba(42,31,74,0.95)']}
        locations={[0.25, 0.6, 1]}
        style={styles.overlay}
        pointerEvents="none"
      />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Playdate · Confirmed</Text>
      </View>
      <View style={styles.ball} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="tennisball" size={20} color={colors.ink} />
      </View>

      <View style={styles.infoPanel}>
        {clampedStars !== null && clampedStars > 0 && (
          <View style={styles.stars} accessibilityLabel={`${clampedStars} out of 5 stars`}>
            {Array.from({ length: clampedStars }).map((_, i) => (
              <Ionicons key={i} name="star" size={24} color={colors.paper} />
            ))}
          </View>
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
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  badge: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: { color: colors.ink, fontSize: 12.5, fontFamily: fonts.black },
  ball: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  photoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.note },
  overlay: { ...StyleSheet.absoluteFillObject },
  infoPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 40 },
  stars: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  name: { color: colors.paper, fontFamily: fonts.display, fontSize: 30, lineHeight: 34 },
  breed: { color: 'rgba(255,249,236,0.85)', fontFamily: fonts.bold, fontSize: 12.5, marginTop: 2 },
  tagline: { color: 'rgba(255,249,236,0.9)', fontFamily: fonts.bold, fontSize: 14, marginTop: 10 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,249,236,0.2)',
  },
  brand: { color: colors.paper, fontFamily: fonts.display, fontSize: 18 },
  brandUrl: { color: 'rgba(255,249,236,0.75)', fontFamily: fonts.bold, fontSize: 12 },
});
