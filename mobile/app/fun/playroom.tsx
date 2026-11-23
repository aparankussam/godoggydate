// mobile/app/fun/playroom.tsx
// The Playroom — one home for the playful, shareable generators built from the
// dog's own profile (Roast, Notes-App Apology, Texts, My Human Review, the
// pass-the-phone quiz, and the Employee-of-the-Month plaque), plus quick-links
// to the standalone toys (Snoot Boop, Sticker Studio, Barkle, Wanted Poster,
// Adventure Passport and the Excuse Note). Grouped into a
// single screen so the profile stays about the dog's life, and the fun lives
// one tap away. Each section is self-contained and only calls the AI routes on
// an explicit tap, so an idle Playroom costs nothing.

import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, PinkButton, card, type GlyphName } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { trackEvent } from '../../lib/analytics';
import RoastSection from '../../components/RoastSection';
import ApologySection from '../../components/ApologySection';
import TextsSection from '../../components/TextsSection';
import HumanReviewSection from '../../components/HumanReviewSection';
import DogQuizSection from '../../components/DogQuizSection';
import PlaqueCard from '../../components/PlaqueCard';

const TOYS: { key: string; glyph: GlyphName; label: string; route: Href }[] = [
  { key: 'snoot', glyph: 'gesture-tap', label: 'Snoot Boop', route: '/fun/snoot' },
  { key: 'sticker-studio', glyph: 'sticker-emoji', label: 'Sticker Studio', route: '/fun/sticker-studio' },
  { key: 'barkle', glyph: 'grid', label: 'Barkle', route: '/fun/barkle' },
  { key: 'wanted', glyph: 'card-account-details-star', label: 'Wanted Poster', route: '/fun/wanted' },
  { key: 'adventures', glyph: 'map-marker-path', label: 'Adventure Passport', route: '/fun/adventures' },
  { key: 'excuse', glyph: 'note-edit', label: 'Excuse Note', route: '/fun/excuse' },
];

export default function PlayroomScreen() {
  const { user, profile } = useSession();

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="The Playroom" onBack={() => router.back()} />

      {profile && user ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Playful, shareable cards and games built from {profile.name?.trim() || 'your dog'}&apos;s own profile.
            Each one only runs when you tap it.
          </Text>

          {/* Quick-links to the standalone toys/games (mirrors web's Playroom
              chips). The generators below render inline on this screen. */}
          <View style={styles.quickLinks}>
            {TOYS.map((t) => (
              <Pressable
                key={t.key}
                style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                onPress={() => { trackEvent('fun_open', { feature: t.key }); router.push(t.route); }}
              >
                <View style={styles.quickLinkIcon}><Glyph name={t.glyph} size={22} /></View>
                <Text style={styles.quickLinkLabel}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <RoastSection savedProfile={profile} />
          <ApologySection savedProfile={profile} />
          <TextsSection savedProfile={profile} />
          <HumanReviewSection savedProfile={profile} userId={user.uid} />
          <DogQuizSection savedProfile={profile} />
          <PlaqueCard savedProfile={profile} />
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Glyph name="paw" size={40} /></View>
          <Text style={styles.emptyText}>Set up your dog&apos;s profile first — the Playroom is built from it.</Text>
          <PinkButton label="Go to profile" onPress={() => router.replace('/(tabs)/profile')} style={styles.primaryButton} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40, gap: 18 },
  intro: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, lineHeight: 21 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickLink: {
    flexBasis: '30%',
    flexGrow: 1,
    ...card.paper,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
  },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  quickLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.note,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkLabel: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'center', lineHeight: 21 },
  primaryButton: { marginTop: 8, alignSelf: 'stretch' },
});
