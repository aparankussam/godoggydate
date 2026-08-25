// mobile/components/CompatExplorer.tsx
// "Who does {dog} get along with?" — a gamified tap-to-reveal explorer that
// replaces the static "plays well with" list with a one-card-at-a-time reveal
// plus a real density hook.
//
// HONESTY (this is the whole point):
//  • The types a dog vibes with are DETERMINISTIC from its own Dogtype
//    (dogtypeBestMatches over the shared catalogue). We do NOT fake a quiz that
//    "computes" the answer — the answer already exists. The tap-to-reveal is
//    pure presentation: it turns a known, fixed list into a playful sequence.
//  • The vibe tier on each card is the real dogtypeVibe(myCode, theirCode).
//  • The density number is a real client-side census of every dog on the app
//    (lib/dogtypeCounts). We never fabricate a count; a type with zero dogs
//    honestly says "None yet — you'd be the first."
//
// Deliberately separate from <DogtypeCompatSection/> (the two-dog "do our dogs
// get along?" compare/invite card) — this is the single-player exploration of
// the dog's OWN best-match types.

import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { trackEvent } from '../lib/analytics';
import { fetchDogtypeCounts, type DogtypeCounts } from '../lib/dogtypeCounts';
import {
  computeDogtype,
  dogtypeBestMatches,
  dogtypeVibe,
  type Dogtype,
  type DogtypeVibe,
} from '../../shared/dogtype';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

// How many best-match types to reveal. dogtypeBestMatches only returns "great"
// vibes, so a code with fewer than this simply reveals fewer cards.
const MAX_REVEALS = 5;

const VIBE_META: Record<DogtypeVibe, { emoji: string; label: string }> = {
  great: { emoji: '💛', label: 'Great vibe' },
  good: { emoji: '🐾', label: 'Good vibe' },
  spicy: { emoji: '🌶️', label: 'Spicy' },
};

// Strip the leading "The " so a name reads naturally when pluralized in a count
// ("The Old Soul" -> "Old Soul" -> "Old Souls").
function bareName(name: string): string {
  return name.replace(/^The\s+/i, '');
}

// Light, honest pluralization for the density line ("Party Puppy" -> "Party
// Puppies", "Old Soul" -> "Old Souls"). Only used for display copy.
function pluralize(name: string): string {
  if (/[^aeiou]y$/i.test(name)) return name.replace(/y$/i, 'ies');
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}

const webBase =
  process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') || 'https://godoggydate.com';

export default function CompatExplorer({ savedProfile }: Props) {
  const computed = computeDogtype(savedProfile);
  const [counts, setCounts] = useState<DogtypeCounts | null>(null);
  const [revealed, setRevealed] = useState(0);
  const viewedRef = useRef(false);

  const code = computed?.code ?? '';
  const matches = code ? dogtypeBestMatches(code, MAX_REVEALS) : [];

  // Census once, on mount — mirrors discover's all-dogs fetch. Never throws.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await fetchDogtypeCounts();
      if (alive) setCounts(result);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (computed && matches.length > 0 && !viewedRef.current) {
      viewedRef.current = true;
      trackEvent('compat_explorer_view', { code: computed.code, matches: matches.length });
    }
  }, [computed, matches.length]);

  if (!computed || matches.length === 0) return null;
  const dogtype = computed;
  const dogName = savedProfile.name?.trim() || 'Your dog';

  const allRevealed = revealed >= matches.length;

  function handleReveal(index: number, match: Dogtype) {
    if (index !== revealed) return; // only the next hidden card is tappable
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = revealed + 1;
    setRevealed(next);
    trackEvent('compat_explorer_reveal', {
      code: dogtype.code,
      match_code: match.code,
      revealed: next,
    });
    if (next >= matches.length) {
      trackEvent('compat_explorer_complete', { code: dogtype.code, matches: matches.length });
    }
  }

  function handleCta() {
    trackEvent('compat_explorer_cta_click', { code: dogtype.code });
    void Linking.openURL(`${webBase}/compat/${dogtype.code}`).catch(() => {});
  }

  function densityLine(match: Dogtype): { main: string; sub: string | null } {
    if (!counts) return { main: 'Counting the pack…', sub: null };
    const n = counts.byCode[match.code] ?? 0;
    if (n === 0) {
      return { main: 'None yet — you’d be the first.', sub: null };
    }
    const label = pluralize(bareName(match.name));
    // No city-level claim — the count is nationwide, so "be the first in {city}"
    // would assert a local fact we have no data for (frequently false).
    return {
      main: `${n} ${label} on GoDoggyDate`,
      sub: null,
    };
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Reveal explorer</Text>
      <Text style={styles.title}>Who does {dogName} get along with?</Text>
      <Text style={styles.subtitle}>
        {allRevealed
          ? `The types ${dogName} vibes best with, revealed.`
          : `Tap to reveal who ${dogName} vibes with →`}
      </Text>

      <View style={styles.deck}>
        {matches.map((match, index) => {
          const state = index < revealed ? 'revealed' : index === revealed ? 'next' : 'locked';
          const vibe = dogtypeVibe(dogtype.code, match.code);
          return (
            <RevealCard
              key={match.code}
              state={state}
              index={index}
              total={matches.length}
              match={match}
              vibe={vibe}
              density={densityLine(match)}
              onReveal={() => handleReveal(index, match)}
            />
          );
        })}
      </View>

      {allRevealed && (
        <View style={styles.closer}>
          <Text style={styles.closerText}>That’s all {dogName}’s best matches 🎉</Text>
          <Pressable style={styles.cta} onPress={handleCta} accessibilityRole="button">
            <Text style={styles.ctaText}>See {dogName}’s compatibility page →</Text>
          </Pressable>
          <Text style={styles.disclaimer}>
            A playful vibe read from the Dogtypes — not a score. Real matches are worked out
            dog-by-dog when you swipe.
          </Text>
        </View>
      )}
    </View>
  );
}

interface RevealCardProps {
  state: 'revealed' | 'next' | 'locked';
  index: number;
  total: number;
  match: Dogtype;
  vibe: DogtypeVibe;
  density: { main: string; sub: string | null };
  onReveal: () => void;
}

function RevealCard({ state, index, total, match, vibe, density, onReveal }: RevealCardProps) {
  const anim = useRef(new Animated.Value(state === 'revealed' ? 1 : 0)).current;

  useEffect(() => {
    if (state === 'revealed') {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }).start();
    }
  }, [state, anim]);

  if (state === 'revealed') {
    const meta = VIBE_META[vibe];
    return (
      <Animated.View
        style={[
          styles.card,
          styles.cardRevealed,
          {
            opacity: anim,
            transform: [
              { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            ],
          },
        ]}
      >
        <Text style={styles.cardEmoji}>{match.emoji}</Text>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{match.name}</Text>
          <View style={styles.vibePill}>
            <Text style={styles.vibePillText}>
              {meta.emoji} {meta.label}
            </Text>
          </View>
          <Text style={styles.densityMain}>{density.main}</Text>
          {density.sub && <Text style={styles.densitySub}>{density.sub}</Text>}
        </View>
      </Animated.View>
    );
  }

  if (state === 'next') {
    return (
      <Pressable
        style={[styles.card, styles.cardNext]}
        onPress={onReveal}
        accessibilityRole="button"
        accessibilityLabel={`Reveal match ${index + 1} of ${total}`}
      >
        <Text style={styles.cardEmoji}>❓</Text>
        <View style={styles.cardBody}>
          <Text style={styles.nextPrompt}>Tap to reveal</Text>
          <Text style={styles.nextSub}>
            Match {index + 1} of {total}
          </Text>
        </View>
      </Pressable>
    );
  }

  // locked — not yet reachable
  return (
    <View style={[styles.card, styles.cardLocked]} accessible={false}>
      <Text style={[styles.cardEmoji, styles.lockedGlyph]}>🐾</Text>
      <View style={styles.cardBody}>
        <Text style={styles.lockedText}>Hidden</Text>
        <Text style={styles.nextSub}>
          Match {index + 1} of {total}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.primary}33`, // ~20%
    backgroundColor: `${colors.primary}0D`, // ~5%
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
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, marginTop: 2 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.brownMid, marginTop: 4, lineHeight: 18 },
  deck: { marginTop: 14, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
    minHeight: 84,
  },
  cardRevealed: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardNext: {
    backgroundColor: `${colors.gold}1F`, // ~12%
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderStyle: 'dashed',
  },
  cardLocked: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.55,
  },
  cardEmoji: { fontSize: 40, width: 48, textAlign: 'center' },
  lockedGlyph: { opacity: 0.5 },
  cardBody: { flex: 1 },
  cardName: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  vibePill: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.gold}26`, // ~15%
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  vibePillText: { fontFamily: fonts.bold, fontSize: 11, color: colors.brownMid },
  densityMain: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown, marginTop: 8 },
  densitySub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 1 },
  nextPrompt: { fontFamily: fonts.bold, fontSize: 16, color: colors.brown },
  nextSub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 2 },
  lockedText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brownLight },
  closer: { marginTop: 16, alignItems: 'center' },
  closerText: { fontFamily: fonts.display, fontSize: 16, color: colors.brown, textAlign: 'center' },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'stretch',
    ...shadow.button,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 15,
  },
});
