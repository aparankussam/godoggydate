// mobile/components/PlaydateHeadsUpCard.tsx
// The pre-meetup briefing, pinned in the chat above the input once a playdate
// is confirmed and hasn't happened yet. Port of
// web/components/PlaydateHeadsUpCard.tsx; read that file's header for the
// reasoning. In short: it's the one place BOTH owners see the same safety
// information at the same time, and can come back to re-read it.
//
// HARD CONSTRAINT, same as web: there are exactly three real safety inputs —
// behaviorFlags, notGoodWith and vaccinated. boundaries, allergies,
// specialNeeds and vetChecked are hardcoded empty/false by toFullProfile() for
// every real dog because no form collects them. Don't add a section for them.

import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, radius } from '../constants/theme';
import type { SavedDogProfile } from '../../shared/profile';
import { toFullProfile } from '../../shared/profile';
import { detectUnsafePairings } from '../../shared/utils/matchingEngine';
import { playdateSafetyUrl } from '../lib/webLinks';
import { formatPlaydateWhen } from '../lib/playdates';

interface Props {
  dogName: string;
  otherProfile: SavedDogProfile;
  myProfile: SavedDogProfile | null;
  playdate: { date: string; time?: string; place: string };
}

const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#FCD34D';
const AMBER_TEXT = '#451A03';
const AMBER_HEADING = '#78350F';
const AMBER_ACCENT = '#B45309';

// Verbatim, in the owner's own selected words. The two lists stay LABELLED
// SEPARATELY: a notGoodWith value is a bare noun ("small dogs"), so under a
// neutral heading it would read as a preference FOR that thing.
function declaredFlags(p: SavedDogProfile | null): string[] {
  const flags = p?.behaviorFlags;
  return Array.isArray(flags) ? flags : [];
}
function declaredNotGoodWith(p: SavedDogProfile | null): string[] {
  const notGoodWith = p?.notGoodWith;
  return Array.isArray(notGoodWith) ? notGoodWith : [];
}
function declaredCount(p: SavedDogProfile | null): number {
  return declaredFlags(p).length + declaredNotGoodWith(p).length;
}

function Chip({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <View style={[styles.chip, warn && styles.chipWarn]}>
      <Text style={[styles.chipText, warn && styles.chipTextWarn]}>{warn ? `🚫 ${label}` : label}</Text>
    </View>
  );
}

export default function PlaydateHeadsUpCard({ dogName, otherProfile, myProfile, playdate }: Props) {
  const [open, setOpen] = useState(false);

  const crossings = useMemo(() => {
    if (!myProfile) return [];
    try {
      const mine = toFullProfile(myProfile, 'me');
      const theirs = toFullProfile(otherProfile, 'them');
      // Both directions, deduped — the same union calculateCompatibility()
      // scores from, so the card and the score can never tell different stories.
      return [...new Set([
        ...detectUnsafePairings(mine, theirs),
        ...detectUnsafePairings(theirs, mine),
      ])];
    } catch (error) {
      // A malformed profile must not take the whole chat down with it.
      console.warn('Heads-Up crossings failed', error);
      return [];
    }
  }, [myProfile, otherProfile]);

  const theirFlags = declaredFlags(otherProfile);
  const theirNotGoodWith = declaredNotGoodWith(otherProfile);
  const myFlags = declaredFlags(myProfile);
  const myNotGoodWith = declaredNotGoodWith(myProfile);
  // vaccinated defaulted to true for years, and null/undefined mean "not
  // stated". Only an explicit false is information.
  const unvaccinated = otherProfile.vaccinated === false;

  const itemCount = crossings.length + declaredCount(otherProfile) + (unvaccinated ? 1 : 0);
  const whenWhere = `${formatPlaydateWhen(playdate)} · ${playdate.place}`;

  function openSafetyGuide() {
    Linking.openURL(playdateSafetyUrl()).catch((error) => {
      console.warn('Failed to open the playdate safety guide', error);
    });
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleTitle} numberOfLines={2}>
          {itemCount > 0 ? '⚠️' : '🐾'} Before you meet {dogName}
          {itemCount > 0 && (
            <Text style={styles.toggleCount}>
              {' '}· {itemCount} {itemCount === 1 ? 'thing' : 'things'} to know
            </Text>
          )}
        </Text>
        <Text style={styles.toggleCta}>{open ? 'Hide ↑' : 'Read ↓'}</Text>
      </Pressable>

      {open && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.whenWhere}>{whenWhere}</Text>

          {/* What crosses between these two specific dogs. */}
          {crossings.length > 0 && (
            <View style={styles.amberBox}>
              <Text style={[styles.eyebrow, { color: AMBER_HEADING }]}>Where your two dogs cross</Text>
              {crossings.map((c) => (
                <Text key={c} style={styles.amberLine}>• {c}</Text>
              ))}
            </View>
          )}

          {theirFlags.length > 0 && (
            <View>
              <Text style={styles.eyebrow}>{dogName}’s owner flagged</Text>
              <View style={styles.chipRow}>
                {theirFlags.map((item) => <Chip key={item} label={item} />)}
              </View>
            </View>
          )}
          {theirNotGoodWith.length > 0 && (
            <View>
              <Text style={styles.eyebrow}>
                {dogName} is <Text style={{ color: AMBER_ACCENT }}>not good with</Text>
              </Text>
              <View style={styles.chipRow}>
                {theirNotGoodWith.map((item) => <Chip key={item} label={item} warn />)}
              </View>
            </View>
          )}

          {unvaccinated && (
            <View style={styles.amberBox}>
              <Text style={styles.amberStrong}>
                {dogName}’s owner marked them as not currently vaccinated.
              </Text>
            </View>
          )}

          {itemCount === 0 && (
            <Text style={styles.muted}>
              Neither owner declared anything that crosses. That means nothing was flagged — not
              that anything was checked.
            </Text>
          )}

          {/* The mirror: what makes this a mutual disclosure rather than a
              dossier, and the one place an owner sees what skipping the
              Safety section of their profile means. */}
          <View style={styles.mirror}>
            <Text style={styles.eyebrow}>What they can see about {myProfile?.name ?? 'your dog'}</Text>
            {declaredCount(myProfile) > 0 ? (
              <View style={styles.chipRow}>
                {myFlags.map((item) => <Chip key={`f-${item}`} label={item} />)}
                {myNotGoodWith.map((item) => <Chip key={`n-${item}`} label={item} warn />)}
              </View>
            ) : (
              <Text style={styles.muted}>
                You haven’t declared anything.{' '}
                <Text style={styles.link} onPress={() => router.push('/(tabs)/profile')}>
                  Add it to your profile
                </Text>{' '}
                — it’s the only thing that can warn them before you meet.
              </Text>
            )}
          </View>

          <Text style={styles.footnote}>
            All of this is what each owner typed about their own dog. GoDoggyDate doesn’t verify any
            of it.{' '}
            <Text style={styles.link} onPress={openSafetyGuide} accessibilityRole="link">
              How to run a first meeting →
            </Text>
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.brown,
  },
  toggleCount: {
    fontFamily: fonts.semibold,
    color: colors.brownLight,
  },
  toggleCta: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  // Pinned above the input, so it must never push the thread off screen.
  body: { maxHeight: 300, marginTop: 10 },
  bodyContent: { gap: 12, paddingBottom: 4 },
  whenWhere: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brownLight,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.brownLight,
  },
  amberBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    backgroundColor: AMBER_BG,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  amberLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: AMBER_TEXT,
  },
  amberStrong: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: AMBER_TEXT,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipWarn: {
    borderColor: AMBER_BORDER,
    backgroundColor: AMBER_BG,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brown,
  },
  chipTextWarn: { color: AMBER_TEXT },
  mirror: {
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownLight,
    marginTop: 4,
  },
  link: {
    fontFamily: fonts.semibold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.brownLight,
  },
});
