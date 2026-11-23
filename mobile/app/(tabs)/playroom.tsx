// mobile/app/(tabs)/playroom.tsx
// The Playroom tab: today's Barkle up top, the National Dog Day diptych when it
// applies, a grid of toys, and the AI "make something" generators. Everything
// the old long Profile scroll held in the way of games and keepsakes lives here.
// Each generator only calls its AI route on an explicit tap.

import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { Gingham, Glyph, Heading, PinkButton, card, type GlyphName } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { trackEvent } from '../../lib/analytics';
import RoastSection from '../../components/RoastSection';
import ApologySection from '../../components/ApologySection';
import TextsSection from '../../components/TextsSection';
import HumanReviewSection from '../../components/HumanReviewSection';
import DogQuizSection from '../../components/DogQuizSection';
import PlaqueCard from '../../components/PlaqueCard';
import DiptychSection, { shouldShowDiptych } from '../../components/DiptychSection';
import LetterSection from '../../components/LetterSection';
import TradingCardShare from '../../components/TradingCardShare';
import { pickLetterMilestone } from '../../lib/letter';

type Tile = { key: string; glyph: GlyphName; label: string; route?: Href };

const TILES: Tile[] = [
  { key: 'snoot', glyph: 'gesture-tap', label: 'Snoot Boop', route: '/fun/snoot' },
  { key: 'sticker-studio', glyph: 'sticker-emoji', label: 'Sticker Studio', route: '/fun/sticker-studio' },
  { key: 'wanted', glyph: 'card-account-details-star', label: 'Wanted Poster', route: '/fun/wanted' },
  { key: 'adventures', glyph: 'map-marker-path', label: 'Adventure Passport', route: '/fun/adventures' },
  { key: 'excuse', glyph: 'note-edit', label: 'Excuse Note', route: '/fun/excuse' },
  { key: 'letter', glyph: 'note-edit', label: 'A letter from your dog' },
  { key: 'card', glyph: 'card-account-details-star', label: 'Trading card' },
];

export default function PlayroomTab() {
  const { user, profile } = useSession();
  const [open, setOpen] = useState<'letter' | 'card' | null>(null);
  const dogName = profile?.name?.trim() || 'your dog';

  if (!profile || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Glyph name="paw" size={40} /></View>
          <Text style={styles.emptyText}>Set up your dog&apos;s profile first. The Playroom is built from it.</Text>
          <PinkButton label="Go to profile" onPress={() => router.replace('/(tabs)/profile')} style={styles.emptyButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <ScrollView contentContainerStyle={styles.content}>
        <Heading size={32}>Playroom</Heading>

        <View style={[card.paper, styles.hero]}>
          <Text style={styles.eyebrow}>Today’s Barkle</Text>
          <Text style={styles.heroTitle}>Guess the dog in six tries</Text>
          <PinkButton
            label="Play today’s Barkle"
            onPress={() => { trackEvent('fun_open', { feature: 'barkle' }); router.push('/fun/barkle'); }}
          />
        </View>

        {shouldShowDiptych(profile) && <DiptychSection savedProfile={profile} />}

        <Heading size={24}>More to play</Heading>
        <View style={styles.grid}>
          {TILES.map((t) => (
            <Pressable
              key={t.key}
              style={({ pressed }) => [styles.tile, open === t.key && styles.tileOpen, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t.key === 'letter' ? `A letter from ${dogName}` : t.label}
              onPress={() => {
                trackEvent('fun_open', { feature: t.key });
                if (t.route) router.push(t.route);
                else setOpen((cur) => (cur === t.key ? null : (t.key as 'letter' | 'card')));
              }}
            >
              <View style={styles.tileIcon}><Glyph name={t.glyph} size={22} /></View>
              <Text style={styles.tileLabel}>{t.key === 'letter' ? `A letter from ${dogName}` : t.label}</Text>
            </Pressable>
          ))}
        </View>

        {open === 'letter' &&
          (pickLetterMilestone(profile) ? (
            <LetterSection savedProfile={profile} userId={user.uid} />
          ) : (
            <View style={[card.paper, styles.note]}>
              <Text style={styles.noteText}>
                A letter from {dogName} arrives on their Gotcha Day or birthday. Add those dates in Profile, under Dates, and it will be ready the week they come around.
              </Text>
            </View>
          ))}
        {open === 'card' && <TradingCardShare profile={profile} userId={user.uid} />}

        <Heading size={24}>Make something</Heading>
        <RoastSection savedProfile={profile} />
        <ApologySection savedProfile={profile} />
        <TextsSection savedProfile={profile} />
        <HumanReviewSection savedProfile={profile} userId={user.uid} />
        <DogQuizSection savedProfile={profile} />
        <PlaqueCard savedProfile={profile} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  hero: { borderRadius: 22, padding: 16, gap: 10 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  heroTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '30%', flexGrow: 1, ...card.paper, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 6 },
  tileOpen: { backgroundColor: colors.note },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  tileIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.note, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, textAlign: 'center' },
  note: { borderRadius: 18, padding: 14 },
  noteText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'center', lineHeight: 21 },
  emptyButton: { marginTop: 8, alignSelf: 'stretch' },
});
