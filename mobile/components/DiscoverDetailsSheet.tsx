// mobile/components/DiscoverDetailsSheet.tsx
// The "ℹ" details sheet for the top Discover card. Mirrors the details sheet in
// web/components/SwipeStack.tsx: photo gallery, the dog's Vibe Check bio and
// breed read, a stat grid (fit score, distance, energy, vaccination), the
// "why you'll click" card, neighbourhood, member since, temperament, play style
// and prompts. The "Woof!" like button is mobile-only (web D2).

import { useState } from 'react';
import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import CompatBreakdown from './CompatBreakdown';
import { QUALITY_RING_COLORS } from './SwipeCard';
import type { DiscoverDog } from '../lib/discover';
import { resolveHeroIndex } from '../lib/coverPhoto';
import { breedConfidencePhrase } from '../lib/vibeCheck';
import { formatUsMonthYear } from '../../shared/dates';

interface Props {
  dog: DiscoverDog | null;
  onClose: () => void;
  /** Likes this dog (the mobile-only "Woof!" button). */
  onLike: () => void;
  /** Opens the report/block sheet for this dog. */
  onReport?: () => void;
}

const AGE_LABELS: Record<DiscoverDog['age'], string> = {
  puppy: 'Puppy',
  adult: 'Adult',
  senior: 'Senior',
};

function getEnergyLabel(energyLevel: number): string {
  if (energyLevel >= 75) return 'High energy';
  if (energyLevel <= 35) return 'Mellow';
  return 'Balanced';
}

function formatMemberSince(timestamp?: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  return formatUsMonthYear(new Date(timestamp));
}

function openingPhotoIndex(dog: DiscoverDog): number {
  const hero = resolveHeroIndex(dog);
  return typeof hero === 'number' && hero >= 0 && hero < dog.photos.length ? hero : 0;
}

export default function DiscoverDetailsSheet({ dog, onClose, onLike, onReport }: Props) {
  return (
    <Modal
      visible={dog !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {dog && (
        <DetailsBody key={dog.id} dog={dog} onClose={onClose} onLike={onLike} onReport={onReport} />
      )}
    </Modal>
  );
}

// Keyed by dog id in the parent, so the photo and "show the math" state start
// fresh for each dog.
function DetailsBody({ dog, onClose, onLike, onReport }: Props & { dog: DiscoverDog }) {
  const [photoIndex, setPhotoIndex] = useState(() => openingPhotoIndex(dog));
  const [showBreakdown, setShowBreakdown] = useState(false);

  const photos = dog.photos;
  const activePhoto = photos[Math.min(photoIndex, photos.length - 1)] ?? null;
  const vibeCheck = dog.ai?.vibeCheck;
  const memberSince = formatMemberSince(dog.createdAt);
  const hasScore = dog.compat.score > 0;
  const ringColor = QUALITY_RING_COLORS[dog.compat.quality] ?? colors.primary;

  const stats: { label: string; value: string }[] = [
    // Not a "%": the score isn't a percentage of anything measured, and
    // labelling it one primes people to read it as a probability.
    { label: 'Fit score', value: hasScore ? `${dog.compat.score}` : '—' },
    {
      label: 'Distance',
      value:
        typeof dog.distanceMiles === 'number' && dog.distanceMiles >= 0
          ? `${dog.distanceMiles.toFixed(1)} mi`
          : dog.neighbourhood ?? 'Not shared',
    },
    { label: 'Energy', value: `${getEnergyLabel(dog.energyLevel)} · ${dog.energyLevel}%` },
    // `false` is an explicit "no" from the owner, not an absence of
    // information — collapsing it into "Unknown" would hide the one health
    // answer that flips the pairing's quality tier.
    {
      label: 'Vaccinated',
      value:
        dog.vaccinated === true ? 'Marked yes' : dog.vaccinated === false ? 'Marked no ⚠' : 'Not stated',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>{dog.name}</Text>
          <Text style={styles.headerMeta}>
            {[dog.breed, AGE_LABELS[dog.age], dog.sex === 'M' ? 'Male' : 'Female', dog.size]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close details">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Photo gallery — the active photo full width, thumbnails below. */}
        {activePhoto && (
          <View style={styles.gallery}>
            <Image source={{ uri: activePhoto }} style={styles.galleryHero} accessibilityLabel={dog.name} />
            {photos.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbRow}
              >
                {photos.map((uri, i) => (
                  <Pressable
                    key={`${uri}-${i}`}
                    onPress={() => setPhotoIndex(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`View photo ${i + 1} of ${dog.name}`}
                    accessibilityState={{ selected: i === photoIndex }}
                  >
                    <Image source={{ uri }} style={[styles.thumb, i === photoIndex && styles.thumbActive]} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Vibe Check bio + breed read — the dog's own voice, written at
            onboarding. Renders nothing for dogs without a Vibe Check. */}
        {vibeCheck && (vibeCheck.bio || vibeCheck.breedGuess) ? (
          <View style={styles.vibeCard}>
            {vibeCheck.bio ? (
              <>
                <Text style={styles.aiLabel}>✨ Written by AI from their photos</Text>
                <Text style={styles.vibeBio}>“{vibeCheck.bio}”</Text>
              </>
            ) : null}
            {vibeCheck.breedGuess ? (
              <Text style={styles.breedGuess}>
                🔍 AI&apos;s read: {vibeCheck.breedGuess.name} · {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.statGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        {hasScore && (
          <View style={styles.compatCard}>
            <View style={styles.compatHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.compatEyebrow}>Why you&apos;ll click</Text>
                <Text style={styles.compatTitle}>{dog.compat.label}</Text>
                {dog.compat.microcopy ? (
                  <Text style={styles.compatMicrocopy}>{dog.compat.microcopy}</Text>
                ) : null}
              </View>
              {/* Ring colour signals compat.quality, so a blocked pairing and
                  a perfect one don't look identically inviting. */}
              <View style={[styles.compatScoreRing, { borderColor: ringColor }]}>
                <Text style={styles.compatScoreText}>{dog.compat.score}</Text>
              </View>
            </View>
            {dog.compat.reasons.slice(0, 3).map((reason) => (
              <Text key={reason} style={styles.compatReason}>
                <Text style={styles.compatReasonBullet}>• </Text>
                {reason}
              </Text>
            ))}
            {/* All warnings, not just the first — a second safety flag
                silently dropped is exactly the detail an owner needs before
                agreeing to a meetup. */}
            {dog.compat.warnings.length > 0 ? (
              <View style={styles.compatWarningBox}>
                <Text style={styles.compatWarningLabel}>Worth knowing</Text>
                {dog.compat.warnings.map((warning) => (
                  <Text key={warning} style={styles.compatWarningText}>{warning}</Text>
                ))}
              </View>
            ) : null}
            <Pressable
              onPress={() => setShowBreakdown((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ expanded: showBreakdown }}
            >
              <Text style={styles.compatShowMath}>{showBreakdown ? 'Hide the math' : 'Show the math'}</Text>
            </Pressable>
            {showBreakdown && (
              <View style={{ marginTop: 8 }}>
                <CompatBreakdown breakdown={dog.compat.breakdown} score={dog.compat.score} />
              </View>
            )}
          </View>
        )}

        {dog.neighbourhood ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Neighbourhood</Text>
            <Text style={styles.infoValue}>{dog.neighbourhood}</Text>
          </View>
        ) : null}

        {memberSince ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Member since</Text>
            <Text style={styles.infoValue}>{memberSince}</Text>
          </View>
        ) : null}

        {dog.temperament.length > 0 && (
          <>
            <Text style={styles.section}>Personality</Text>
            <View style={styles.tags}>
              {dog.temperament.map((trait) => (
                <View key={trait} style={styles.tag}>
                  <Text style={styles.tagText}>{trait}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {dog.playStyles.length > 0 && (
          <>
            <Text style={styles.section}>Play style</Text>
            <View style={styles.tags}>
              {dog.playStyles.map((style) => (
                <View key={style} style={styles.tag}>
                  <Text style={styles.tagText}>{style}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {dog.prompts.length > 0 && (
          <View style={styles.prompts}>
            {dog.prompts.map((prompt) => (
              <View key={prompt.prompt} style={styles.infoCard}>
                <Text style={styles.infoLabel}>{prompt.prompt}</Text>
                <Text style={styles.promptAnswer}>{prompt.answer}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 28 }} />
        <Pressable style={styles.likeBtn} onPress={onLike} accessibilityRole="button">
          <Text style={styles.likeBtnText}>Woof! 🐾</Text>
        </Pressable>

        {onReport && (
          <Pressable style={styles.reportLink} onPress={onReport} hitSlop={8} accessibilityRole="button">
            <Text style={styles.reportLinkText}>Report or block {dog.name}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1 },
  name: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brown,
  },
  headerMeta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    marginTop: 2,
  },
  close: {
    fontSize: 20,
    color: colors.brownLight,
    padding: 4,
  },
  body: { padding: 20 },
  gallery: {
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 4,
  },
  galleryHero: {
    width: '100%',
    height: 240,
    backgroundColor: colors.creamDark,
  },
  thumbRow: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.creamDark,
  },
  thumbActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  vibeCard: {
    marginTop: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,183,49,0.3)',
    backgroundColor: 'rgba(245,183,49,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  aiLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 10,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  vibeBio: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
    color: colors.brownMid,
  },
  breedGuess: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginTop: 8,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  statValue: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 15,
    color: colors.brown,
    marginTop: 4,
  },
  compatCard: {
    marginTop: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(232,99,58,0.25)',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  compatHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compatEyebrow: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  compatTitle: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 16,
    color: colors.brown,
    marginTop: 6,
  },
  compatMicrocopy: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginTop: 2,
  },
  compatScoreRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compatScoreText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 16,
    color: colors.primary,
  },
  compatReason: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    lineHeight: 21,
    marginTop: 10,
  },
  compatReasonBullet: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  compatWarningBox: {
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(180,83,9,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  compatWarningLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  compatWarningText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    marginTop: 4,
    lineHeight: 20,
  },
  compatShowMath: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 12,
    color: colors.primary,
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  infoCard: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brown,
    marginTop: 4,
  },
  promptAnswer: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.brown,
    marginTop: 4,
  },
  prompts: {
    marginTop: 8,
  },
  section: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: colors.creamDark,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 14,
    color: colors.brownMid,
  },
  likeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  likeBtnText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 17,
    color: '#fff',
  },
  reportLink: {
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 12,
    paddingVertical: 6,
  },
  reportLinkText: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 13,
    color: colors.brownLight,
    textDecorationLine: 'underline',
  },
});
