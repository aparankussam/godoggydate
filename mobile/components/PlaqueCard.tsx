// mobile/components/PlaqueCard.tsx
// "EMPLOYEE OF THE MONTH" — a walnut-and-brass office plaque for a dog, ported
// from web/components/PlaqueCard.tsx. Built on top of the dog's deterministic
// Dogtype (shared/dogtype.ts) and shared/plaque.ts: the job title ("Senior VP of
// Squirrel Surveillance") is picked from a hand-written bank keyed to the 16-type
// code, hashed by name + current month, so it's stable for the month and rotates
// as the months turn. NO AI, no fabricated stat — the "performance highlights"
// are generic, obviously-in-on-the-joke corporate lines, and the plaque reads
// unmistakably as an office gag, never a real HR document.
//
// Self-contained profile section (mirrors the web default export): computes the
// plaque from the owner's own saved profile, renders the capturable plate (brand
// + godoggydate.com baked INSIDE the captured region so a reposted screenshot
// still carries the back-link), and offers a Share button via the shared
// captureAndShare path. forwardRef<View> for react-native-view-shot. Works at N=1.

import { forwardRef, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { getHeroPhoto } from '../lib/photos';
import { resolveHeroIndex } from '../lib/coverPhoto';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { computeDogtype } from '../../shared/dogtype';
import { computePlaque, type Plaque } from '../../shared/plaque';
import type { SavedDogProfile } from '../lib/profile';
import { formatUsMonthYear } from '../../shared/dates';

interface Props {
  savedProfile: SavedDogProfile;
}

// Walnut + brass palette — solid values so react-native-view-shot captures it
// faithfully, same rationale as the web card's aged-brass gradient.
const ENGRAVE = '#E9D8B0'; // aged-brass lettering on the dark walnut
const BRASS_INK = '#3A2A0E';
const BRASS_INK_SOFT = '#5E4718';

// ── The capturable plaque plate (forwardRef target for view-shot) ────────────
interface PlateProps {
  plaque: Plaque;
  dogName: string;
  photoUrl?: string;
}

const PlaquePlate = forwardRef<View, PlateProps>(({ plaque, dogName, photoUrl }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Dark walnut board with a subtle grain via a layered gradient. */}
      <LinearGradient
        colors={['#4A3524', '#3A2817', '#2C1E11']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Brass outer bevel */}
      <View style={styles.bevel}>
        <View style={styles.inner}>
          {/* Etched header on the walnut */}
          <Text style={styles.employee}>EMPLOYEE</Text>
          <Text style={styles.ofTheMonth}>OF THE MONTH</Text>
          <Text style={styles.month}>{plaque.monthLabel || '—'}</Text>

          {/* Brass medallion with the dog's photo. Emoji sits behind so an
              undecoded remote image still captures a meaningful badge. */}
          <View style={styles.medallion}>
            <Text style={styles.medallionEmoji}>{plaque.emoji}</Text>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={[StyleSheet.absoluteFill, styles.medallionPhoto]} />
            ) : null}
          </View>

          {/* Brass nameplate — the engraved bar every plaque has */}
          <LinearGradient
            colors={['#F6DC93', '#D8B25C', '#A9832F']}
            locations={[0, 0.42, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.nameplate}
          >
            <Text style={styles.nameplateName}>{dogName}</Text>
            <Text style={styles.nameplateTitle}>{plaque.title}</Text>
          </LinearGradient>

          {/* Performance highlights — obviously-playful corporate filler */}
          <Text style={styles.highlightsLabel}>PERFORMANCE HIGHLIGHTS</Text>
          <View style={styles.highlights}>
            {plaque.highlights.map((h, i) => (
              <Text key={i} style={styles.highlight}>
                <Text style={styles.highlightStar}>★</Text> {h}
              </Text>
            ))}
          </View>

          {/* Straight-faced "official" line — small, so no one mistakes the gag */}
          <Text style={styles.ceremonial}>Issued by the GoDoggyDate HR Dept. · Strictly ceremonial</Text>

          {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
          <View style={styles.footer}>
            <Text style={styles.brand}>GoDoggyDate</Text>
            <Text style={styles.url}>godoggydate.com</Text>
          </View>
        </View>
      </View>
    </View>
  );
});
PlaquePlate.displayName = 'PlaquePlate';

// ── Self-contained profile-page section ──────────────────────────────────────
export default function PlaqueCard({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const dogtype = computeDogtype(savedProfile);
  // Current month, computed once so it's stable across re-renders (and matches
  // between the visible card and the captured PNG).
  const [monthLabel] = useState(() =>
    formatUsMonthYear(new Date()),
  );

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const plaque = dogtype ? computePlaque({ dogtype, name: dogName, monthLabel }) : null;
  if (!dogtype || !plaque) return null;
  // Capture as a non-null local so the async share closure keeps the narrowing.
  const readyPlaque = plaque;

  const photo = getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile));

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    trackEvent('plaque_share_click', { code: dogtype!.code });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-employee-of-the-month.png`,
      `${dogName}: Employee of the Month`,
    );
    if (result === 'shared') trackEvent('plaque_shared', { code: dogtype!.code, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Just for fun</Text>
      <Text style={styles.sectionTitle}>🏆 Employee of the Month</Text>
      <Text style={styles.sectionBlurb}>
        {dogName}&apos;s official (and entirely ceremonial) office plaque — a straight-faced job title picked from
        their Dogtype, plus some very serious performance highlights. Updates each month.
      </Text>

      {/* The plaque itself — this is what gets captured to PNG. */}
      <View style={styles.cardWrap}>
        <PlaquePlate ref={cardRef} plaque={readyPlaque} dogName={dogName} photoUrl={photo ?? undefined} />
      </View>

      <Pressable
        style={[styles.shareButton, sharing && { opacity: 0.6 }]}
        onPress={handleShare}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel={`Share ${dogName}'s plaque`}
      >
        <Text style={styles.shareText}>{sharing ? 'Preparing…' : `📤 Share ${dogName}'s plaque`}</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        A joke, not a job. The title comes from {dogName}&apos;s Dogtype and the highlights are all in good fun —
        no real performance review was harmed.
      </Text>
    </View>
  );
}

const CARD_WIDTH = 320;

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.gold}4D`, // ~30%
    backgroundColor: `${colors.gold}14`, // ~8%
    padding: 18,
    marginBottom: 16,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, marginTop: 1 },
  sectionBlurb: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },
  cardWrap: { alignItems: 'center', marginTop: 14 },

  // ── The capturable plate ───────────────────────────────────────────────────
  card: {
    width: CARD_WIDTH,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#3A2817',
  },
  bevel: {
    margin: 12,
    borderWidth: 2,
    borderColor: '#B78E3E',
    padding: 2,
    borderRadius: 2,
  },
  inner: {
    borderWidth: 1,
    borderColor: '#7A5C22',
    borderRadius: 2,
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
  },
  employee: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: ENGRAVE,
    letterSpacing: 4,
    lineHeight: 16,
    textAlign: 'center',
  },
  ofTheMonth: {
    fontFamily: fonts.display,
    fontSize: 12,
    color: ENGRAVE,
    letterSpacing: 6,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  month: { fontFamily: fonts.body, fontSize: 10, color: '#B9A578', letterSpacing: 2, marginTop: 4 },
  medallion: {
    width: 118,
    height: 118,
    marginTop: 16,
    borderRadius: 59,
    borderWidth: 4,
    borderColor: '#C9A24B',
    backgroundColor: '#7A5C22',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  medallionEmoji: { fontSize: 52, lineHeight: 58 },
  medallionPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  nameplate: {
    width: '100%',
    marginTop: 16,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  nameplateName: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: BRASS_INK,
    letterSpacing: 0.5,
    lineHeight: 28,
    textAlign: 'center',
  },
  nameplateTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: BRASS_INK_SOFT,
    letterSpacing: 0.3,
    lineHeight: 16,
    marginTop: 2,
    textAlign: 'center',
  },
  highlightsLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: '#B9A578',
    letterSpacing: 2,
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  highlights: { alignSelf: 'stretch', marginTop: 6, gap: 4 },
  highlight: { fontFamily: fonts.body, fontSize: 11.5, color: ENGRAVE, lineHeight: 16 },
  highlightStar: { color: '#D8B25C' },
  ceremonial: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 9.5,
    color: '#9C8A5F',
    letterSpacing: 0.4,
    marginTop: 16,
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    marginTop: 12,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,162,75,0.4)',
  },
  brand: { fontFamily: fonts.display, fontSize: 12, color: ENGRAVE },
  url: { fontFamily: fonts.body, fontSize: 9.5, color: '#9C8A5F' },

  // ── Section share button + disclaimer ──────────────────────────────────────
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 10,
  },
});
