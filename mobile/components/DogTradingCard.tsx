import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  profile: SavedDogProfile;
}

function energyLabel(level: number): string {
  if (level >= 75) return 'High energy';
  if (level <= 35) return 'Mellow';
  return 'Balanced';
}

function locationLabel(profile: SavedDogProfile): string {
  if (profile.city && profile.state) return `${profile.city}, ${profile.state}`;
  if (profile.location && !/^\d{5}(-\d{4})?$/.test(profile.location)) return profile.location;
  return 'Somewhere with good parks';
}

/**
 * The shareable "dog trading card" — mirrors web/components/DogTradingCard.tsx.
 * Wrapped in forwardRef so react-native-view-shot can capture it as a PNG.
 */
const DogTradingCard = forwardRef<View, Props>(({ profile }, ref) => {
  const photo = (profile.photos ?? []).find((p) => p && !p.startsWith('_'));
  const energy = Math.max(0, Math.min(100, profile.energyLevel ?? 50));
  const tags = [...(profile.playStyles ?? []), ...(profile.temperament ?? [])].slice(0, 3);

  return (
    <View ref={ref} style={styles.card}>
      {/* Photo occupies a defined square at the top rather than bleeding
          behind the whole 9:16 card. Full-bleed cover meant a landscape
          photo — which most phone dog photos are — got cropped to a 9:16
          slice, routinely cutting the dog's head off. A square crop only
          trims the sides of a landscape shot (or top/bottom of a portrait
          one), so the subject survives in both orientations. */}
      <View style={styles.photoFrame}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={{ fontSize: 64 }}>🐕</Text>
          </View>
        )}

        {/* Fades the photo into the panel below. Replaces a flat 55% dark
            wash over the entire image, which muddied every photo — the web
            card always used a gradient; mobile never matched it. */}
        <LinearGradient
          colors={['transparent', 'rgba(45,26,14,0.6)', colors.brown]}
          locations={[0.55, 0.85, 1]}
          style={styles.photoFade}
          pointerEvents="none"
        />

        {typeof profile.foundingPackNumber === 'number' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Founding Pack #{profile.foundingPackNumber}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoPanel}>
        {/* Vibe Check's named archetype — the most shareable, distinctive
            thing the app generates about this dog, previously rendered on
            no surface at all including this one. */}
        {profile.ai?.vibeCheck?.archetype.name && (
          <Text style={styles.archetype}>✨ {profile.ai.vibeCheck.archetype.name}</Text>
        )}
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.meta}>
          {[profile.breed, profile.age, profile.size].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.location}>{locationLabel(profile)}</Text>

        <View style={styles.energyRow}>
          <Text style={styles.energyLabel}>{energyLabel(energy)}</Text>
          <Text style={styles.energyLabel}>{energy}/100</Text>
        </View>
        <View style={styles.energyTrack}>
          <View style={[styles.energyFill, { width: `${energy}%` }]} />
        </View>

        {tags.length > 0 && (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.brand}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

DogTradingCard.displayName = 'DogTradingCard';
export default DogTradingCard;

const CARD_WIDTH = 340;
const CARD_HEIGHT = (CARD_WIDTH * 16) / 9;
// Square photo area — see the framing note in the component above.
const PHOTO_HEIGHT = CARD_WIDTH;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.brown,
  },
  photoFrame: {
    width: CARD_WIDTH,
    height: PHOTO_HEIGHT,
  },
  badge: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: colors.gold,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  photoFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  infoPanel: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 16,
  },
  archetype: {
    color: colors.gold,
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  name: {
    color: '#fff',
    fontFamily: fonts.display,
    fontSize: 30,
  },
  meta: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bold,
    fontSize: 13,
    marginTop: 2,
  },
  location: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 2,
  },
  energyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 4,
  },
  energyLabel: {
    color: colors.gold,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  energyTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  energyFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.gold,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: fonts.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Pinned to the bottom of the panel: the panel is now a flex child with
    // a fixed height, so a plain marginTop would leave the footer floating
    // mid-card whenever a dog has few tags.
    marginTop: 'auto',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  brand: {
    color: '#fff',
    fontFamily: fonts.display,
    fontSize: 13,
  },
  brandUrl: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
});
