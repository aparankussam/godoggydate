// mobile/components/PlaydateHeadsUpCard.tsx
// The pre-meetup briefing, pinned in the chat above the composer once a
// playdate is confirmed and hasn't happened yet. Port of
// web/components/PlaydateHeadsUpCard.tsx; read that file's header for the
// reasoning. In short: it's the one place BOTH owners see the same safety
// information at the same time, and can come back to re-read it.
//
// CALM register: level (no tilt), plain Nunito, dots not ticks, each declared
// limit once and in the owner's name ("Moose's owner prefers no puppies").
// Amber appears only on a limit the other dog actually trips.
//
// HARD CONSTRAINT, same as web: there are exactly three real safety inputs —
// behaviorFlags, notGoodWith and vaccinated. boundaries, allergies,
// specialNeeds and vetChecked are hardcoded empty/false by toFullProfile() for
// every real dog because no form collects them. Don't add a section for them.

import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import type { SavedDogProfile } from '../../shared/profile';
import { toFullProfile } from '../../shared/profile';
import { analyzeLimits, describeLimits } from '../../shared/utils/matchingEngine';
import { playdateSafetyUrl } from '../lib/webLinks';
import { formatPlaydateWhen } from '../lib/playdates';

interface Props {
  dogName: string;
  otherProfile: SavedDogProfile;
  myProfile: SavedDogProfile | null;
  playdate: { date: string; time?: string; place: string };
  /** The other owner's first name, from the match document (never from a public profile). */
  ownerFirstName?: string | null;
  /** Folded to its header for now (the keyboard is up), without losing the open/closed choice. */
  compact?: boolean;
}

/** One declared limit, as the engine words it (owner-named), and whether the other dog trips it. */
export interface LimitLine {
  id: string;
  text: string;
  severity: 'caution' | 'note' | 'declared';
  /** Why it applies, e.g. "Waffles is small". */
  detail?: string;
}

/**
 * Every declared limit between two dogs, each once, split by whose it is. The
 * same analysis the Discover card and the compatibility score use, so this card
 * and the score cannot tell different stories. Without your own profile (still
 * loading) only the other owner's limits can be listed, and none are marked.
 */
export function playdateLimitLines(
  myProfile: SavedDogProfile | null,
  otherProfile: SavedDogProfile | null,
): { theirs: LimitLine[]; yours: LimitLine[] } {
  if (!otherProfile) return { theirs: [], yours: [] };
  try {
    if (!myProfile) {
      return {
        theirs: describeLimits(otherProfile).map((text, i) => ({ id: `theirs:${i}`, text, severity: 'declared' as const })),
        yours: [],
      };
    }
    const analysis = analyzeLimits(
      toFullProfile(myProfile, 'me'),
      toFullProfile(otherProfile, 'them'),
      { viewerAll: true },
    );
    const line = (i: (typeof analysis.items)[number]): LimitLine => ({ id: i.id, text: i.text, severity: i.severity, detail: i.detail });
    return {
      theirs: analysis.items.filter((i) => i.side === 'theirs').map(line),
      yours: analysis.items.filter((i) => i.side === 'yours').map(line),
    };
  } catch (error) {
    // A malformed profile must not take the whole chat down with it.
    console.warn('Heads-Up limits failed', error);
    return { theirs: [], yours: [] };
  }
}

/**
 * The limits that CROSS between these two dogs (either owner's, tripped by the
 * other dog): what to name before accepting. Empty means nothing to warn about.
 */
export function playdateConflicts(
  myProfile: SavedDogProfile | null,
  otherProfile: SavedDogProfile | null,
): LimitLine[] {
  const { theirs, yours } = playdateLimitLines(myProfile, otherProfile);
  return [...theirs, ...yours].filter((l) => l.severity === 'caution');
}

function Dot() {
  return <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

export default function PlaydateHeadsUpCard({ dogName, otherProfile, myProfile, playdate, ownerFirstName, compact = false }: Props) {
  const [openChoice, setOpen] = useState(true);
  const open = openChoice && !compact;

  const { theirs: theirLimits, yours: myLimits } = useMemo(
    () => playdateLimitLines(myProfile, otherProfile),
    [myProfile, otherProfile],
  );
  // vaccinated defaulted to true for years, and null/undefined mean "not
  // stated". Only an explicit false is information.
  const unvaccinated = otherProfile.vaccinated === false;
  const flagged = theirLimits.length > 0 || unvaccinated;
  const whenWhere = `${formatPlaydateWhen(playdate)} · ${playdate.place}`;

  function openSafetyGuide() {
    Linking.openURL(playdateSafetyUrl()).catch((error) => {
      console.warn('Failed to open the playdate safety guide', error);
    });
  }

  return (
    <View style={styles.wrap} accessibilityLabel={`Before you meet ${dogName}`}>
      <Pressable
        style={styles.toggle}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleTitle} numberOfLines={2}>
          Before you meet {dogName}
          {ownerFirstName ? <Text style={styles.toggleOwner}> · with {ownerFirstName}</Text> : null}
        </Text>
        <Text style={styles.toggleCta}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>

      {open && (
        // Capped and scrollable: the thread must keep room to breathe and the
        // composer must stay on screen.
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.whenWhere}>{whenWhere}</Text>

          <View style={styles.list}>
            <View style={styles.item}><Dot /><Text style={styles.itemText}>Meet somewhere public, like a dog park.</Text></View>
            <View style={styles.item}><Dot /><Text style={styles.itemText}>Keep leashes on until both dogs are calm.</Text></View>
            <View style={styles.item}><Dot /><Text style={styles.itemText}>Introduce them slowly. A short sniff first, then see how it goes.</Text></View>
            <View style={styles.item}>
              <Dot />
              <View style={styles.itemBody}>
                {flagged ? (
                  <>
                    <Text style={[styles.itemText, styles.strong]}>What the other owner asked for:</Text>
                    <View style={styles.limits}>
                      {theirLimits.map((limit) => (
                        <View key={limit.id} style={[styles.limit, limit.severity === 'caution' && styles.limitCaution]}>
                          <Text style={[styles.limitText, limit.severity === 'caution' && styles.strong]}>
                            {limit.text}
                            {limit.severity === 'caution' && limit.detail ? (
                              <Text style={styles.limitDetail}>. {limit.detail}.</Text>
                            ) : null}
                          </Text>
                        </View>
                      ))}
                      {unvaccinated && (
                        <View style={[styles.limit, styles.limitCaution]}>
                          <Text style={[styles.limitText, styles.strong]}>
                            {dogName}’s owner marked {dogName} as not currently vaccinated.
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                ) : (
                  <Text style={styles.itemText}>
                    <Text style={styles.strong}>What the other owner asked for:</Text>{' '}
                    <Text style={styles.soft}>nothing. That means nothing was flagged, not that anything was checked.</Text>
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* The mirror: what the other owner can see about your dog. It's what
              makes the card a mutual disclosure rather than a dossier. */}
          <View style={styles.mirror}>
            <Text style={styles.mirrorLabel}>
              What {dogName}’s owner sees about {myProfile?.name ?? 'your dog'}
            </Text>
            {myLimits.length > 0 ? (
              <View style={styles.mirrorList}>
                {myLimits.map((limit) => (
                  <Text
                    key={limit.id}
                    style={[styles.itemText, limit.severity === 'caution' && styles.mirrorCaution]}
                  >
                    {limit.text}
                    {limit.severity === 'caution' && limit.detail ? (
                      <Text style={styles.limitDetail}>. {limit.detail}.</Text>
                    ) : null}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={[styles.itemText, styles.soft]}>
                You haven’t declared any limits.{' '}
                <Text style={styles.link} onPress={() => router.push('/(tabs)/profile')} accessibilityRole="link">
                  Add them to your profile
                </Text>{' '}
                so the other owner is warned before you meet.
              </Text>
            )}
          </View>

          <Text style={styles.footnote}>
            This is what each owner typed about their own dog. GoDoggyDate doesn’t verify any of it.
          </Text>
          <Pressable onPress={openSafetyGuide} accessibilityRole="link" style={styles.guideLink}>
            <Text style={styles.link}>How to run a first meeting</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.creamDark,
    borderTopWidth: 2,
    borderTopColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleTitle: { flex: 1, fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: colors.ink },
  toggleOwner: { fontFamily: fonts.bold, color: colors.brownMid },
  toggleCta: {
    fontFamily: fonts.black,
    fontSize: 12,
    color: colors.brownMid,
    textDecorationLine: 'underline',
  },
  // Pinned above the composer, so it must never push the thread off screen.
  body: { maxHeight: 210, marginTop: 2 },
  bodyContent: { gap: 10, paddingBottom: 6 },
  whenWhere: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.brownMid },
  list: { gap: 7 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  itemBody: { flex: 1, minWidth: 0 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink, marginTop: 8 },
  itemText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  strong: { fontFamily: fonts.black },
  soft: { color: colors.brownMid },
  limits: { marginTop: 5, gap: 5 },
  limit: {
    borderRadius: 12,
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  limitCaution: { borderWidth: 2, borderColor: colors.amber },
  limitText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.ink },
  limitDetail: { fontFamily: fonts.semibold },
  mirror: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  mirrorLabel: { fontFamily: fonts.black, fontSize: 12, color: colors.brownMid },
  mirrorList: { gap: 2 },
  mirrorCaution: {
    fontFamily: fonts.black,
    textDecorationLine: 'underline',
    textDecorationColor: colors.amber,
  },
  footnote: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, color: colors.brownMid },
  guideLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: {
    fontFamily: fonts.black,
    fontSize: 14,
    color: colors.rose,
    textDecorationLine: 'underline',
  },
});
