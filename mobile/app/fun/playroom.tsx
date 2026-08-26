// mobile/app/fun/playroom.tsx
// The Playroom — one home for the playful, shareable generators built from the
// dog's own profile (Roast, Notes-App Apology, Texts, My Human Review, the
// pass-the-phone quiz, and the Employee-of-the-Month plaque). Grouped into a
// single screen so the profile stays about the dog's life, and the fun lives
// one tap away. Each section is self-contained and only calls the AI routes on
// an explicit tap, so an idle Playroom costs nothing.

import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { trackEvent } from '../../lib/analytics';
import RoastSection from '../../components/RoastSection';
import ApologySection from '../../components/ApologySection';
import TextsSection from '../../components/TextsSection';
import HumanReviewSection from '../../components/HumanReviewSection';
import DogQuizSection from '../../components/DogQuizSection';
import PlaqueCard from '../../components/PlaqueCard';

export default function PlayroomScreen() {
  const { user, profile } = useSession();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>The Playroom 🎉</Text>
        <View style={{ width: 48 }} />
      </View>

      {profile && user ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Playful, shareable cards and games built from {profile.name?.trim() || 'your dog'}&apos;s own profile.
            Each one only runs when you tap it.
          </Text>

          {/* Quick-links to the standalone toys/games (mirrors web's Playroom
              chips). The generators below render inline on this screen. */}
          <View style={styles.quickLinks}>
            {[
              { key: 'snoot', emoji: '🐽', label: 'Snoot Boop', route: '/fun/snoot' },
              { key: 'sticker-studio', emoji: '🎨', label: 'Sticker Studio', route: '/fun/sticker-studio' },
              { key: 'barkle', emoji: '🟩', label: 'Barkle', route: '/fun/barkle' },
              { key: 'wanted', emoji: '🤠', label: 'Wanted Poster', route: '/fun/wanted' },
              { key: 'adventures', emoji: '🗺️', label: 'Adventure Passport', route: '/fun/adventures' },
            ].map((t) => (
              <Pressable
                key={t.key}
                style={styles.quickLink}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                onPress={() => { trackEvent('fun_open', { feature: t.key }); router.push(t.route); }}
              >
                <Text style={styles.quickLinkEmoji} accessibilityElementsHidden importantForAccessibility="no">{t.emoji}</Text>
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
          <Text style={styles.emptyEmoji}>🐶</Text>
          <Text style={styles.emptyText}>Set up your dog&apos;s profile first — the Playroom is built from it.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.primaryText}>Go to profile</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  intro: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickLink: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  quickLinkEmoji: { fontSize: 26 },
  quickLinkLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brown, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { fontFamily: fonts.body, fontSize: 15, color: colors.brownLight, textAlign: 'center', lineHeight: 21 },
  primaryButton: { marginTop: 8, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 28 },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
});
