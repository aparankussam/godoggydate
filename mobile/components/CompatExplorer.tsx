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
  dogtypeByCode,
  dogtypeCompat,
  dogtypeRankedMatches,
  dogtypeVibe,
  type Dogtype,
  type DogtypeVibe,
  type RankedDogtype,
} from '../../shared/dogtype';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

type Compat = NonNullable<ReturnType<typeof dogtypeCompat>>;

// How many best-match types to reveal. dogtypeRankedMatches only returns "great"
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
// Puppies", "Old Soul" -> "Old Souls", "Velvet Couch Potato" -> "Potatoes").
// Only used for display copy. Mirrors the web twin's rule set.
function pluralize(name: string): string {
  if (/[^aeiou]y$/i.test(name)) return name.replace(/y$/i, 'ies');
  if (/(s|x|z|ch|sh|o)$/i.test(name)) return `${name}es`;
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
  // Ranked by real axis score (best first) so we can honestly badge a clear #1.
  const ranked = code ? dogtypeRankedMatches(code, MAX_REVEALS) : [];
  const matches = ranked.map((r) => r.type);
  const rankByCode = new Map<string, RankedDogtype>(ranked.map((r) => [r.type.code, r]));

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

  // Same capture-and-share mechanic as handleShare — the shared image IS the
  // invite (it carries the brand + a "what's your dog?" prompt). Copy-only:
  // there is deliberately no attribution backend tying a signup back to this.
  async function handleInvite(other: Dogtype, compat: Compat) {
    if (sharing) return;
    setSharing(true);
    trackEvent('compat_explorer_invite_click', { a: dogtype.code, b: other.code, vibe: compat.vibe });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-invite-${other.code}.png`,
      `Know a ${bareName(other.name)}? ${dogName} is looking for one.`,
    );
    if (result === 'shared') {
      trackEvent('compat_explorer_invite_shared', { a: dogtype.code, b: other.code, vibe: compat.vibe, method: 'native_share' });
    }
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  function handleCta() {
    trackEvent('compat_explorer_cta_click', { code: dogtype.code });
    void Linking.openURL(`${webBase}/compat/${dogtype.code}`).catch(() => {});
  }

  function openTypePage(typeCode: string) {
    trackEvent('compat_explorer_type_page_click', { code: dogtype.code, match_code: typeCode });
    void Linking.openURL(`${webBase}/dogtype/${typeCode}`).catch(() => {});
  }

  /** True when this type has no real dogs on the app yet. null while counting. */
  function isZeroCount(matchCode: string): boolean | null {
    if (!counts) return null;
    return (counts.byCode[matchCode] ?? 0) === 0;
  }

  // A short, honest superlative for the strongest match only. A tie (two matches
  // sharing the top score) never earns "#1" — see dogtypeRankedMatches.isClearTop.
  function rankLabel(match: Dogtype): string | null {
    const r = rankByCode.get(match.code);
    if (!r) return null;
    if (r.isClearTop) return `⭐ ${dogName}’s #1 easiest match`;
    return null;
  }

  function densityLine(match: Dogtype): { main: string; sub: string | null } {
    if (!counts) return { main: 'Counting the pack…', sub: null };
    const n = counts.byCode[match.code] ?? 0;
    const bare = bareName(match.name);
    const plural = pluralize(bare);
    if (n === 0) {
      // Not a dead end — a rare, specific vibe that hasn't joined yet. The
      // count is a nationwide census, so we never claim anything local.
      return {
        main: `No ${plural} on GoDoggyDate yet`,
        sub: `One of ${dogName}’s rarer vibes so far — not a dead end.`,
      };
    }
    return {
      // Singularize a lone dog — "1 Old Soul", not "1 Old Souls".
      main: `${n} ${n === 1 ? bare : plural} on GoDoggyDate`,
      sub: 'You meet them one swipe at a time.',
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
                rankLabel={rankLabel(match)}
                isExpanded={isExpanded}
                dogName={dogName}
                onReveal={() => handleReveal(index, match)}
                onToggle={() => toggleExpand(match)}
              />
              {isExpanded && other && compat && (
                <View style={styles.detail}>
                  {/* What this type IS — its own blurb, straight from the
                      engine, so "Invite a Lazy Goofball" isn't asking the owner
                      to recruit something they can't picture. */}
                  <Text style={styles.typeBlurb}>{other.blurb}</Text>

                  {/* Why THESE two vibe — the existing side-by-side card. */}
                  <View style={styles.detailCardWrap}>
                    <DogtypeCompatCard ref={cardRef} aType={dogtype} bType={other} aName={dogName} compat={compat} />
                  </View>

                  {isZeroCount(other.code) === null ? (
                    // Census still loading — hold the CTA rather than flashing
                    // the wrong (Share) branch for a type that may be zero-count.
                    <View style={[styles.shareButton, { opacity: 0.6 }]}>
                      <Text style={styles.shareText}>Checking GoDoggyDate…</Text>
                    </View>
                  ) : isZeroCount(other.code) ? (
                    // No dogs of this type yet: the honest way to fill the vibe
                    // is to recruit one, so the share IS the invite (copy-only;
                    // no attribution backend).
                    <>
                      <Pressable
                        style={[styles.shareButton, sharing && { opacity: 0.6 }]}
                        onPress={() => handleInvite(other, compat)}
                        disabled={sharing}
                        accessibilityRole="button"
                      >
                        <Text style={styles.shareText}>
                          {sharing ? 'Preparing…' : `🐾 Invite a ${bareName(other.name)} →`}
                        </Text>
                      </Pressable>
                      <Text style={styles.inviteMicro}>
                        Real matches still happen when you both swipe.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={[styles.shareButton, sharing && { opacity: 0.6 }]}
                        onPress={() => handleShare(other, compat)}
                        disabled={sharing}
                        accessibilityRole="button"
                      >
                        <Text style={styles.shareText}>{sharing ? 'Preparing…' : '📤 Share this match'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleInvite(other, compat)}
                        disabled={sharing}
                        accessibilityRole="button"
                      >
                        <Text style={styles.inviteNudge}>
                          🐾 Know another {bareName(other.name)}? Invite them
                        </Text>
                      </Pressable>
                    </>
                  )}

                  <Pressable onPress={() => openTypePage(other.code)} accessibilityRole="link">
                    <Text style={styles.typeLink}>See the full {bareName(other.name)} page →</Text>
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
  rankLabel: string | null;
  isExpanded: boolean;
  dogName: string;
  onReveal: () => void;
  onToggle: () => void;
}

function RevealCard({ state, index, total, match, vibe, density, rankLabel, isExpanded, dogName, onReveal, onToggle }: RevealCardProps) {
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
            {rankLabel && <Text style={styles.rankLabel}>{rankLabel}</Text>}
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
  rankLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.gold, marginTop: 4 },
  densityMain: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown, marginTop: 8 },
  densitySub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 1 },
  expandHint: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary, marginTop: 8 },
  nextPrompt: { fontFamily: fonts.bold, fontSize: 16, color: colors.brown },
  nextSub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 2 },
  lockedText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brownLight },
  detail: { alignItems: 'stretch' },
  typeBlurb: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 19,
    color: colors.brownMid,
    marginBottom: 12,
  },
  detailCardWrap: { alignItems: 'center', marginBottom: 12 },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  inviteMicro: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    textAlign: 'center',
    marginTop: 8,
  },
  inviteNudge: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 12,
  },
  typeLink: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 14,
  },
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
