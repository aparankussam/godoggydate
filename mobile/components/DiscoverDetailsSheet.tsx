// mobile/components/DiscoverDetailsSheet.tsx
// Details for the top Discover card: richer but calm. Mirrors the Details
// overlay in web/components/SwipeStack.tsx: the photo with the next one as a
// taped mini polaroid, name + place ticket + facts, the dog's Vibe Check bio,
// the expanded fit panel ("Compatible on what owners shared"), the owner's
// prompt answers as sticky notes, Plays / Is chips, energy and member-since, and
// the full trust block. Pass and WOOF stay reachable at the bottom.

import { useState } from 'react';
import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import CompatBreakdown from './CompatBreakdown';
import type { DiscoverDog } from '../lib/discover';
import { focusForPhoto, resolveHeroIndex } from '../lib/coverPhoto';
import { getRenderablePhotos } from '../lib/photos';
import { breedConfidencePhrase } from '../lib/vibeCheck';
import { CoverImage } from './CoverPhotoEditor';
import { formatUsMonthYear } from '../../shared/dates';
import { PawIcon, SkyBackground, StickerDog, Tape } from './sticker';
import {
  Dot,
  FitSticker,
  LimitsBlock,
  PlaceTicket,
  energyWord,
  factsLine,
  fitTone,
  placeLabel,
  plain,
  vaccinationLine,
} from './discover/DiscoverBits';
import { uniqueTemperament, sentenceCase } from '../../shared/temperament';

interface Props {
  dog: DiscoverDog | null;
  onClose: () => void;
  /** WOOFs at this dog. */
  onLike: () => void;
  /** Passes on this dog. */
  onPass?: () => void;
  /** Opens the report/block sheet for this dog. */
  onReport?: () => void;
}

function formatMemberSince(timestamp?: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  return formatUsMonthYear(new Date(timestamp));
}

function openingPhotoIndex(dog: DiscoverDog, count: number): number {
  const hero = resolveHeroIndex(dog);
  return typeof hero === 'number' && hero >= 0 && hero < count ? hero : 0;
}

const microcopyPlain = (t: string) => plain(t);

export default function DiscoverDetailsSheet({ dog, onClose, onLike, onPass, onReport }: Props) {
  return (
    <Modal
      visible={dog !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {dog && (
        <DetailsBody
          key={dog.id}
          dog={dog}
          onClose={onClose}
          onLike={onLike}
          onPass={onPass}
          onReport={onReport}
        />
      )}
    </Modal>
  );
}

// Keyed by dog id in the parent, so the photo and "show the math" state start
// fresh for each dog.
function DetailsBody({ dog, onClose, onLike, onPass, onReport }: Props & { dog: DiscoverDog }) {
  const photos = getRenderablePhotos(dog.photos);
  const [photoIndex, setPhotoIndex] = useState(() => openingPhotoIndex(dog, photos.length));
  const [showBreakdown, setShowBreakdown] = useState(false);

  const activeIndex = Math.min(photoIndex, Math.max(0, photos.length - 1));
  const activePhoto = photos[activeIndex] ?? null;
  const nextPhoto = photos.length > 1 ? photos[(activeIndex + 1) % photos.length] : null;
  // The owner's focal point, while the gallery shows their cover.
  const activeFocus = focusForPhoto(dog, activeIndex, openingPhotoIndex(dog, photos.length));
  const vibeCheck = dog.ai?.vibeCheck;
  const memberSince = formatMemberSince(dog.createdAt);
  const hasScore = dog.compat.score > 0;
  const tone = fitTone(dog.compat);
  const prompts = dog.prompts.filter((p) => p.answer?.trim());
  const chipGroups = [
    { label: 'Plays', items: dog.playStyles.map(sentenceCase) },
    { label: 'Is', items: uniqueTemperament(dog.temperament ?? []) },
  ].filter((g) => g.items.length > 0);

  return (
    <SafeAreaView style={styles.container}>
      <SkyBackground />
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.headerBtnHit}
          accessibilityRole="button"
          accessibilityLabel="Back to the card"
        >
          <View style={styles.headerBtn}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={colors.ink} />
          </View>
        </Pressable>
        <Text style={styles.headerName} numberOfLines={1} accessibilityRole="header">
          {dog.name}
        </Text>
        {/* Reading the full profile is exactly when you'd want to report or block. */}
        {onReport && (
          <Pressable
            onPress={onReport}
            style={styles.headerBtnHit}
            accessibilityRole="button"
            accessibilityLabel={`Report or block ${dog.name}`}
          >
            <View style={styles.headerBtn}>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.ink} />
            </View>
          </Pressable>
        )}
      </View>

      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Hero photo + the next photo as a mini polaroid */}
            <View style={styles.hero}>
              {activePhoto ? (
                <CoverImage
                  uri={activePhoto}
                  focus={activeFocus}
                  style={StyleSheet.absoluteFill}
                  accessibilityLabel={`${dog.name}, photo ${activeIndex + 1}`}
                />
              ) : (
                <View style={styles.heroEmpty}>
                  <StickerDog size={80} label={`No photo of ${dog.name} yet`} />
                  <Text style={styles.heroEmptyText}>No photo yet</Text>
                </View>
              )}
              {photos.length > 1 && (
                <View
                  style={styles.counter}
                  accessible
                  accessibilityLabel={`Photo ${activeIndex + 1} of ${photos.length}`}
                >
                  <Text style={styles.counterText}>
                    {activeIndex + 1} / {photos.length}
                  </Text>
                </View>
              )}
              {nextPhoto && (
                <Pressable
                  onPress={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show the next photo of ${dog.name}`}
                  style={styles.nextPolaroid}
                >
                  <Tape width={36} height={12} angle={-5} style={{ top: -7, left: 22 }} />
                  <View style={styles.nextPhoto}>
                    <Image source={{ uri: nextPhoto }} style={StyleSheet.absoluteFill} />
                  </View>
                  <Text style={styles.nextText}>Next photo</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.body}>
              {/* Name, place, facts */}
              <View>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {dog.name}
                  </Text>
                  <PlaceTicket text={placeLabel(dog)} style={styles.nameTicket} />
                </View>
                <Text style={styles.facts}>{factsLine(dog)}</Text>
              </View>

              {/* Vibe Check bio + breed read: the dog's own voice, written at onboarding. */}
              {vibeCheck && (vibeCheck.bio || vibeCheck.breedGuess) ? (
                <View style={styles.vibe}>
                  {vibeCheck.bio ? (
                    <>
                      <Text style={styles.vibeSmall}>Written by AI from their photos</Text>
                      <Text style={styles.vibeBio}>“{vibeCheck.bio}”</Text>
                    </>
                  ) : null}
                  {vibeCheck.breedGuess ? (
                    <Text style={styles.vibeSmall}>
                      AI&apos;s read: {vibeCheck.breedGuess.name} ·{' '}
                      {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Expanded fit panel */}
              {hasScore && (
                <View style={styles.fitPanel} accessibilityLabel="Fit with your dog">
                  <View style={styles.fitRow}>
                    <FitSticker compat={dog.compat} size={76} />
                    <View style={styles.fitText}>
                      <Text style={styles.fitEyebrow}>
                        What lines up <Text style={styles.fitEyebrowSoft}>· Fit with your dog</Text>
                      </Text>
                      {dog.compat.reasons.length > 0 ? (
                        dog.compat.reasons.slice(0, 4).map((reason) => (
                          <View key={reason} style={styles.reason}>
                            <Dot />
                            <Text style={styles.reasonText}>{plain(reason)}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.reasonText}>{dog.compat.label}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.fitFoot}>
                    {tone === 'green' && (dog.compat.limits?.cautionCount ?? 0) === 0
                      ? 'Compatible on what owners shared.'
                      : microcopyPlain(dog.compat.microcopy)}
                  </Text>
                  <Pressable
                    onPress={() => setShowBreakdown((v) => !v)}
                    style={styles.mathBtn}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showBreakdown }}
                  >
                    <Text style={styles.mathText}>{showBreakdown ? 'Hide the math' : 'Show the math'}</Text>
                  </Pressable>
                  {showBreakdown && (
                    <CompatBreakdown breakdown={dog.compat.breakdown} score={dog.compat.score} />
                  )}
                </View>
              )}

              {/* Prompts as sticky notes, in the owner's own words */}
              {prompts.length > 0 && (
                <View style={styles.notes} accessibilityLabel={`${dog.name}’s answers`}>
                  {prompts.map((prompt, i) => (
                    <View
                      key={prompt.prompt}
                      style={[styles.note, { transform: [{ rotate: `${[-0.7, 0.6, -0.5][i % 3]}deg` }] }]}
                    >
                      <Tape
                        width={46}
                        height={14}
                        angle={i % 2 === 0 ? -4 : 4}
                        style={i % 2 === 0 ? { top: -8, left: 32 } : { top: -8, right: 36 }}
                      />
                      <Text style={styles.noteLabel}>{prompt.prompt}</Text>
                      <Text style={styles.noteAnswer}>{prompt.answer}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Plays / Is */}
              {chipGroups.length > 0 && (
                <View style={styles.chipGroups}>
                  {chipGroups.map((g) => (
                    <View key={g.label} style={styles.chipGroup}>
                      <Text style={styles.chipGroupLabel}>{g.label}</Text>
                      <View style={styles.chips}>
                        {g.items.map((item) => (
                          <View key={item} style={styles.chip}>
                            <Text style={styles.chipText}>{plain(item)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.energy}>
                Energy: <Text style={styles.energyStrong}>{energyWord(dog.energyLevel)}</Text>
                {memberSince ? (
                  <>
                    {' · Member since '}
                    <Text style={styles.energyStrong}>{memberSince}</Text>
                  </>
                ) : null}
              </Text>

              {/* Calm trust block: the owner's words, labelled as such */}
              <View style={styles.trust} accessibilityLabel={`What ${dog.name}’s owner shared`}>
                <Text style={styles.trustStrong}>{vaccinationLine(dog)}</Text>
                <View style={{ marginTop: 6 }}>
                  <LimitsBlock compat={dog.compat} ownerName={dog.name} />
                </View>
                <Text style={styles.trustSmall}>
                  From {dog.name}’s owner. GoDoggyDate doesn’t verify breed, vaccination, temperament, or the
                  limits owners list.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.helper}>It’s a match when you both say WOOF. Then propose a playdate.</Text>
        <View style={styles.footerRow}>
          {onPass && (
            <Pressable
              onPress={onPass}
              style={({ pressed }) => [styles.passBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Pass on ${dog.name}`}
            >
              <View pointerEvents="none" style={styles.passEdge} />
              <MaterialCommunityIcons name="close" size={24} color={colors.ink} style={{ marginBottom: -1 }} />
              <Text style={styles.passText}>Pass</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onLike}
            style={({ pressed }) => [styles.woofBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`WOOF at ${dog.name}`}
          >
            <View pointerEvents="none" style={styles.woofEdge} />
            <PawIcon size={27} />
            <Text style={styles.woofText}>WOOF</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
    minHeight: 54,
  },
  headerBtnHit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 4,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: { flex: 1, fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.ink },

  cardWrap: { flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 },
  card: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: 'hidden',
  },
  scroll: { paddingBottom: 16 },

  hero: {
    height: 190,
    backgroundColor: '#5B4A3A',
    borderBottomWidth: 2,
    borderBottomColor: colors.ink,
  },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.note },
  heroEmptyText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  counter: {
    position: 'absolute',
    top: 10,
    left: 12,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  counterText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: colors.ink },
  nextPolaroid: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 88,
    padding: 5,
    paddingBottom: 3,
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    transform: [{ rotate: '5deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  nextPhoto: {
    height: 58,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: '#E9E6E2',
    overflow: 'hidden',
  },
  nextText: { textAlign: 'center', fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: colors.ink, marginTop: 1 },

  body: { paddingHorizontal: 14, paddingTop: 12, gap: 14 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flexShrink: 1, fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.ink },
  nameTicket: { flexShrink: 1 },
  facts: { marginTop: 4, fontFamily: fonts.black, fontSize: 15, lineHeight: 19, color: colors.ink },

  vibe: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(42,31,74,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  vibeBio: { fontFamily: fonts.bold, fontStyle: 'italic', fontSize: 14, lineHeight: 19, color: colors.brownMid },
  vibeSmall: { marginVertical: 2, fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.brownMid },

  fitPanel: {
    backgroundColor: colors.creamDark,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fitText: { flex: 1, minWidth: 0 },
  fitEyebrow: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: colors.brownMid, marginBottom: 2 },
  fitEyebrowSoft: { fontFamily: fonts.bold },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reasonText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  fitFoot: { marginTop: 8, fontFamily: fonts.bold, fontSize: 12, lineHeight: 17, color: colors.brownMid },
  mathBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  mathText: { fontFamily: fonts.black, fontSize: 13, color: colors.rose, textDecorationLine: 'underline' },

  notes: { gap: 12, paddingTop: 4 },
  note: {
    marginHorizontal: 2,
    backgroundColor: colors.note,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  noteLabel: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.brownMid },
  noteAnswer: { fontFamily: fonts.hand, fontSize: 24, lineHeight: 27, color: colors.ink, marginTop: 2 },

  chipGroups: { gap: 8 },
  chipGroup: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  chipGroupLabel: { width: 40, paddingTop: 6, fontFamily: fonts.black, fontSize: 12, color: colors.brownMid },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 3,
    backgroundColor: colors.paper,
    paddingHorizontal: 11,
    paddingVertical: 3,
  },
  chipText: { fontFamily: fonts.black, fontSize: 13, lineHeight: 18, color: colors.ink },

  energy: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  energyStrong: { fontFamily: fonts.black, color: colors.ink },

  trust: {
    backgroundColor: colors.creamDark,
    borderLeftWidth: 4,
    borderLeftColor: colors.ink,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trustStrong: { fontFamily: fonts.black, fontSize: 14, lineHeight: 19, color: colors.ink },
  trustSmall: { marginTop: 8, fontFamily: fonts.bold, fontSize: 12, lineHeight: 17, color: colors.brownMid },

  footer: { paddingHorizontal: 14, paddingBottom: 10 },
  helper: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
    marginBottom: 6,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passBtn: {
    width: 66,
    height: 54,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 5,
    overflow: 'hidden',
  },
  passEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: colors.border },
  passText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: colors.ink },
  woofBtn: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: colors.ink,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  woofEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, backgroundColor: colors.primaryDark },
  woofText: { fontFamily: fonts.display, fontSize: 31, lineHeight: 36, letterSpacing: 1, color: colors.ink },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.94 },
});
