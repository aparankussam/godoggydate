// mobile/components/CompatExplorer.tsx
// "Who does {dog} get along with?" — a gamified tap-to-reveal explorer that
// replaces the static "plays well with" list with a one-card-at-a-time reveal,
// a real density hook, AND a per-match "do our dogs get along?" detail that
// expands on tap (the shareable invite card).
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
// Consolidation (2026-08): the separate <DogtypeCompatSection/> ("who does {dog}
// vibe with?" — an always-open picker + share card) duplicated this list and
// doubled the scroll. Its "do our dogs get along?" card now lives here, revealed
// on demand when you tap a match, instead of being always displayed.

import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { fetchDogtypeCounts, type DogtypeCounts } from '../lib/dogtypeCounts';
import DogtypeCompatCard from './DogtypeCompatCard';
import {
  computeDogtype,
  dogtypeBestMatches,
  dogtypeByCode,
  dogtypeCompat,
  dogtypeVibe,
  type Dogtype,
  type DogtypeVibe,
} from '../../shared/dogtype';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

type Compat = NonNullable<ReturnType<typeof dogtypeCompat>>;

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
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
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

  function toggleExpand(match: Dogtype) {
    Haptics.selectionAsync().catch(() => {});
    setExpandedCode((prev) => {
      const opening = prev !== match.code;
      if (opening) {
        trackEvent('compat_explorer_detail_open', { code: dogtype.code, match_code: match.code });
      }
      return opening ? match.code : null;
    });
  }

  async function handleShare(other: Dogtype, compat: Compat) {
    if (sharing) return;
    setSharing(true);
    trackEvent('dogtype_compat_share_click', { a: dogtype.code, b: other.code, vibe: compat.vibe });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-vs-${other.code}.png`,
      `Does your dog get along with ${dogName}?`,
    );
    if (result === 'shared') {
      trackEvent('dogtype_compat_shared', { a: dogtype.code, b: other.code, vibe: compat.vibe, method: 'native_share' });
    }
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
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
          ? `Tap any match to see if your dogs get along — and share it.`
          : `Tap to reveal who ${dogName} vibes with →`}
      </Text>

      <View style={styles.deck}>
        {matches.map((match, index) => {
          const state = index < revealed ? 'revealed' : index === revealed ? 'next' : 'locked';
          const vibe = dogtypeVibe(dogtype.code, match.code);
          const isExpanded = state === 'revealed' && expandedCode === match.code;
          const other = isExpanded ? dogtypeByCode(match.code) : null;
          const compat = isExpanded && other ? dogtypeCompat(dogtype.code, other.code) : null;
          return (
            <View key={match.code} style={styles.slot}>
              <RevealCard
                state={state}
                index={index}
                total={matches.length}
                match={match}
                vibe={vibe}
                density={densityLine(match)}
                isExpanded={isExpanded}
                dogName={dogName}
                onReveal={() => handleReveal(index, match)}
                onToggle={() => toggleExpand(match)}
              />
              {isExpanded && other && compat && (
                <View style={styles.detail}>
                  <View style={styles.detailCardWrap}>
                    <DogtypeCompatCard ref={cardRef} aType={dogtype} bType={other} aName={dogName} compat={compat} />
                  </View>
                  <Pressable
                    style={[styles.shareButton, sharing && { opacity: 0.6 }]}
                    onPress={() => handleShare(other, compat)}
                    disabled={sharing}
                    accessibilityRole="button"
                  >
                    <Text style={styles.shareText}>{sharing ? 'Preparing…' : '📤 Share this match'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
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
  isExpanded: boolean;
  dogName: string;
  onReveal: () => void;
  onToggle: () => void;
}

function RevealCard({ state, index, total, match, vibe, density, isExpanded, dogName, onReveal, onToggle }: RevealCardProps) {
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
        style={{
          opacity: anim,
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <Pressable
          style={[styles.card, styles.cardRevealed, isExpanded && styles.cardExpanded]}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={`${match.name}. Tap to see if ${dogName} gets along.`}
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
            <Text style={styles.expandHint}>
              {isExpanded ? 'Hide the match ▴' : 'See if you’d get along ▾'}
            </Text>
          </View>
        </Pressable>
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
  slot: { gap: 10 },
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
  cardExpanded: { borderColor: colors.primary, borderWidth: 2 },
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
  expandHint: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary, marginTop: 8 },
  nextPrompt: { fontFamily: fonts.bold, fontSize: 16, color: colors.brown },
  nextSub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 2 },
  lockedText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brownLight },
  detail: { alignItems: 'stretch' },
  detailCardWrap: { alignItems: 'center', marginBottom: 12 },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
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
