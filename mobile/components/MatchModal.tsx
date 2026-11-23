// mobile/components/MatchModal.tsx
// The pop-up shown when a WOOF turns into a mutual match, "Sticker Book" look.
// Mirrors web/components/MatchModal.tsx: a MUTUAL WOOF stamp, two taped
// polaroids (their dog, yours), the fit sticker with the top reasons, a calm
// owner-attributed "Before you meet" slip, ONE pink "Say hi" and a paper
// "Keep swiping". No hearts, no confetti.
//
// It used to celebrate identically no matter what the engine thought, so a
// pairing calculateCompatibility() itself labels 'blocked' (score under 45, or
// an owner who said their dog isn't vaccinated) got the same party as a
// perfect one. The blocked variant stays sober: the same information, a
// "READ FIRST" stamp, and the owner has to acknowledge it before "Say hi".

import { useState, type ReactNode } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import CompatBreakdown from './CompatBreakdown';
import type { DiscoverDog } from '../lib/discover';
import { playdateSafetyUrl } from '../lib/webLinks';
import { canOfferInAppPurchase } from '../lib/pro';
import { getHeroPhoto, getRenderablePhotos } from '../lib/photos';
import { resolveHeroIndex } from '../lib/coverPhoto';
import { getChatUnlockPitch } from '../../shared/utils/stripe';
import { CHAT_FREE_LAUNCH_MODE } from '../../shared/matchAccess';
import { getVaccinationStatus, type SavedDogProfile } from '../../shared/profile';
import { formatDistanceMiles } from '../../shared/utils/matchingEngine';
import { PawIcon, PrimaryButton, SecondaryButton, SkyBackground, StickerDog, Tape } from './sticker';
import DogtypeRevealCard, { type RevealVariant } from './DogtypeRevealCard';
import { Dot, FIT_TONE_BG, fitShortLabel, fitTone } from './discover/DiscoverBits';

export interface MatchReveal {
  ownCode: string;
  otherCode: string;
  ownName: string;
  discovered: number;
  variant: RevealVariant;
}

interface Props {
  dog: DiscoverDog | null;
  /** The Dogtype reveal for this match, when both types are known. */
  reveal?: MatchReveal | null;
  matchId: string | null;
  /** The viewer's own dog, for the second polaroid. */
  viewer?: SavedDogProfile | null;
  onSayHi: () => void;
  onKeepSwiping: () => void;
}

export default function MatchModal({ dog, matchId, viewer, reveal, onSayHi, onKeepSwiping }: Props) {
  const visible = dog !== null && matchId !== null;
  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onKeepSwiping}
    >
      {/* Keyed so the acknowledgement and the "show the math" toggle start
          fresh for each new match. */}
      {dog && matchId ? (
        <MatchModalContent
          key={`${matchId}:${dog.id}`}
          dog={dog}
          viewer={viewer ?? null}
          reveal={reveal ?? null}
          onSayHi={onSayHi}
          onKeepSwiping={onKeepSwiping}
        />
      ) : null}
    </Modal>
  );
}

function MatchModalContent({
  dog,
  viewer,
  reveal,
  onSayHi,
  onKeepSwiping,
}: {
  dog: DiscoverDog;
  viewer: SavedDogProfile | null;
  reveal: MatchReveal | null;
  onSayHi: () => void;
  onKeepSwiping: () => void;
}) {
  const isBlocked = dog.compat.quality === 'blocked';
  const [acknowledged, setAcknowledged] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const theirPhotos = getRenderablePhotos(dog.photos);
  const theirHero = resolveHeroIndex(dog);
  const photo =
    (typeof theirHero === 'number' && theirPhotos[theirHero]) || theirPhotos[0] || null;
  const myPhoto = viewer ? getHeroPhoto(viewer.photos, resolveHeroIndex(viewer)) : null;
  const myName = viewer?.name?.trim() || 'Your dog';
  const topReasons = dog.compat.reasons.slice(0, 2);
  const vaccination = getVaccinationStatus(dog);

  // An unknown distance is never "nearby" — that's the overclaim the engine
  // used to make by scoring a missing location as maximum proximity.
  const knownDistance = formatDistanceMiles(dog.distanceMiles);
  const distanceSummary = knownDistance
    ? `${knownDistance} apart`
    : dog.neighbourhood ?? 'Location not shared';

  // A blocked pairing shouldn't make "Say hi" the default action before the
  // owner has seen why it's flagged.
  const chatUnlocked = !isBlocked || acknowledged;
  // The pitch is a free-chat line today. If chat ever goes paid again, the
  // priced version must not appear on iOS, where purchases are hidden.
  const showPitch = chatUnlocked && (CHAT_FREE_LAUNCH_MODE || canOfferInAppPurchase());

  // Owner-attributed lines. A limit the engine tripped against the viewer's
  // dog is the one thing marked amber.
  const limitItems = dog.compat.limits ? dog.compat.limits.items : null;
  const theirLimits = limitItems ? limitItems.filter((i) => i.side === 'theirs') : [];
  const yourLimits = limitItems ? limitItems.filter((i) => i.side === 'yours') : [];
  const fallbackWarnings = limitItems ? [] : dog.compat.warnings;
  const vaccLine =
    dog.vaccinated === false
      ? `${dog.name}’s owner marked them NOT currently vaccinated`
      : vaccination.tone === 'dated' || vaccination.tone === 'expired'
        ? `${dog.name}’s owner entered a rabies date (${vaccination.label.replace(/^Rabies: /, '')})`
        : dog.vaccinated === true
          ? `${dog.name}’s owner marked them vaccinated`
          : `${dog.name}’s owner didn’t say about vaccination`;
  const vaccCaution = dog.vaccinated === false || vaccination.tone === 'expired';

  function openSafetyGuide() {
    Linking.openURL(playdateSafetyUrl()).catch(() => {});
  }

  const tone = fitTone(dog.compat);

  return (
    <View style={styles.page}>
      <SkyBackground />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        accessibilityViewIsModal
      >
        {/* The stamp */}
        <View style={styles.stampOuter} accessible accessibilityRole="header" accessibilityLabel={isBlocked ? 'You both said WOOF, read this first' : 'Mutual WOOF'}>
          <View style={styles.stampInner}>
            <PawIcon size={20} />
            <Text style={styles.stampText} numberOfLines={1} adjustsFontSizeToFit>
              {isBlocked ? 'READ FIRST' : 'MUTUAL WOOF'}
            </Text>
            <PawIcon size={20} />
          </View>
        </View>

        <View style={styles.bothRow}>
          <Text style={styles.bothText}>You both said WOOF.</Text>
          <View style={styles.distancePill}>
            <Ionicons name="location-sharp" size={14} color={colors.ink} />
            <Text style={styles.distanceText} numberOfLines={1}>
              {distanceSummary}
            </Text>
          </View>
        </View>

        {/* Two taped polaroids */}
        <View style={styles.polaroids}>
          <Tape width={76} height={22} angle={-5} style={styles.polaroidTape} />
          <Polaroid
            name={dog.name}
            sub={dog.breed}
            tilt={-2.5}
            photo={photo}
            label={`${dog.name}, ${dog.breed}`}
          />
          <Polaroid
            name={myName}
            sub="That’s you"
            tilt={3}
            offset
            photo={myPhoto}
            label={viewer ? `${myName}, your dog` : 'Your dog'}
            mine
          />
        </View>

        {/* Fit sticker + the top reasons, on a little note */}
        {dog.compat.score > 0 && (
          <View
            style={styles.fitRow}
            accessible
            accessibilityLabel={`Fit with your dog: ${dog.compat.score} out of 100, ${dog.compat.label}. ${topReasons.join('. ')}`}
          >
            <View style={[styles.fitSticker, { backgroundColor: FIT_TONE_BG[tone] }]}>
              <Text style={styles.fitNum}>{dog.compat.score}</Text>
              <Text style={styles.fitLabel} numberOfLines={2}>
                {fitShortLabel(dog.compat)}
              </Text>
            </View>
            {topReasons.length > 0 && (
              <View style={styles.reasonNote}>
                {topReasons.map((r, i) => (
                  <Text key={r} style={styles.reasonNoteText}>
                    {r}
                    {i < topReasons.length - 1 ? ' ·' : ''}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Dogtype reveal: after the fit sticker on a normal pairing; a blocked
            pairing reads the safety slip first (below). */}
        {!isBlocked && reveal && (
          <DogtypeRevealCard
            ownName={reveal.ownName}
            ownCode={reveal.ownCode}
            otherName={dog.name}
            otherCode={reveal.otherCode}
            discovered={reveal.discovered}
            variant={reveal.variant}
          />
        )}

        {/* Before you meet: calm slip, owner-attributed */}
        <View style={styles.slip}>
          <Text style={styles.slipTitle}>{isBlocked ? 'Why this pairing needs care' : 'Before you meet'}</Text>
          <Bullet amber={vaccCaution}>{vaccLine}</Bullet>
          {limitItems && theirLimits.length === 0 ? (
            <Bullet>{`${dog.name}’s owner listed no limits`}</Bullet>
          ) : (
            theirLimits.map((i) => (
              <Bullet key={i.id} amber={i.severity === 'caution'}>
                {i.text}
                {i.severity === 'caution' && i.detail ? ` (${i.detail})` : ''}
              </Bullet>
            ))
          )}
          {yourLimits.map((i) => (
            <Bullet key={i.id} amber={i.severity === 'caution'}>
              You said: {i.chip}
              {i.severity === 'caution' && i.detail ? ` (${i.detail})` : ''}
            </Bullet>
          ))}
          {fallbackWarnings.map((w) => (
            <Bullet key={w} amber>
              {w}
            </Bullet>
          ))}
          <Bullet>
            <Text style={styles.bulletStrong}>Meet somewhere neutral and public</Text> the first time, not either
            dog’s home or regular park.{' '}
            <Text style={styles.link} onPress={openSafetyGuide} accessibilityRole="link">
              How to run a first meeting
            </Text>
          </Bullet>
          <Text style={styles.slipSmall}>
            Everything here comes from what each owner typed in. GoDoggyDate doesn’t verify it.
          </Text>
          <Pressable
            onPress={() => setShowBreakdown((v) => !v)}
            style={styles.mathBtn}
            accessibilityRole="button"
            accessibilityState={{ expanded: showBreakdown }}
          >
            <Text style={styles.mathText}>{showBreakdown ? 'Hide the math' : 'How this was calculated'}</Text>
          </Pressable>
          {showBreakdown && <CompatBreakdown breakdown={dog.compat.breakdown} score={dog.compat.score} />}
        </View>

        {isBlocked && acknowledged && reveal && (
          <DogtypeRevealCard
            ownName={reveal.ownName}
            ownCode={reveal.ownCode}
            otherName={dog.name}
            otherCode={reveal.otherCode}
            discovered={reveal.discovered}
            variant={reveal.variant}
          />
        )}

        {/* CTAs: exactly one pink */}
        <View style={styles.ctas}>
          {isBlocked && !acknowledged ? (
            <PrimaryButton label="Got it, I’ve read this" onPress={() => setAcknowledged(true)} />
          ) : (
            <PrimaryButton
              label={`Say hi to ${dog.name}`}
              onPress={onSayHi}
              icon={<Ionicons name="chatbubble-ellipses" size={24} color={colors.ink} />}
            />
          )}
          {showPitch && <Text style={styles.pitch}>{getChatUnlockPitch()}</Text>}
          <SecondaryButton label="Keep swiping" onPress={onKeepSwiping} />
        </View>
      </ScrollView>
    </View>
  );
}

function Bullet({ children, amber = false }: { children: ReactNode; amber?: boolean }) {
  return (
    <View style={[styles.bullet, amber && styles.bulletAmber]}>
      <Dot color={amber ? colors.amberSpine : colors.ink} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function Polaroid({
  name,
  sub,
  photo,
  label,
  tilt,
  offset,
  mine,
}: {
  name: string;
  sub: string;
  photo: string | null;
  label: string;
  tilt: number;
  offset?: boolean;
  mine?: boolean;
}) {
  return (
    <View
      style={[styles.polaroid, { transform: [{ rotate: `${tilt}deg` }] }, offset && { marginTop: 16 }]}
      accessible
      accessibilityLabel={label}
    >
      <View style={styles.polaroidPhoto}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
        ) : (
          <StickerDog size={76} label={mine ? 'A drawn sticker dog standing in for your dog' : `${name}, drawn`} />
        )}
      </View>
      <Text style={styles.polaroidName} numberOfLines={1} adjustsFontSizeToFit>
        {name}
      </Text>
      <Text style={styles.polaroidSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.sky },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 44,
    paddingBottom: 28,
  },

  stampOuter: {
    alignSelf: 'center',
    padding: 3,
    backgroundColor: colors.paper,
    borderWidth: 2.5,
    borderColor: colors.ink,
    borderRadius: 8,
    transform: [{ rotate: '-2.5deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 0,
    elevation: 4,
  },
  stampInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 5,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  stampText: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: 1, color: colors.ink },

  bothRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bothText: { fontFamily: fonts.black, fontSize: 16, lineHeight: 20, color: colors.ink },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: colors.kraft,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    transform: [{ rotate: '-1.5deg' }],
  },
  distanceText: { flexShrink: 1, fontFamily: fonts.black, fontSize: 13.5, lineHeight: 17, color: colors.ink },

  polaroids: { marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 8 },
  polaroidTape: { top: -6, left: '50%', marginLeft: -38, zIndex: 5 },
  polaroid: {
    width: '46%',
    maxWidth: 172,
    padding: 7,
    paddingBottom: 8,
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 10,
    elevation: 5,
  },
  polaroidPhoto: {
    aspectRatio: 148 / 120,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.note,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  polaroidName: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
  },
  polaroidSub: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 16, color: colors.brownMid },

  fitRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fitSticker: {
    zIndex: 2,
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    transform: [{ rotate: '-5deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 4,
  },
  fitNum: { fontFamily: fonts.display, fontSize: 32, lineHeight: 32, color: colors.ink },
  fitLabel: { fontFamily: fonts.black, fontSize: 12, lineHeight: 13, color: colors.ink, textAlign: 'center' },
  reasonNote: {
    flexShrink: 1,
    marginLeft: -8,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    paddingVertical: 8,
    paddingLeft: 18,
    paddingRight: 12,
    transform: [{ rotate: '1.5deg' }],
  },
  reasonNoteText: { fontFamily: fonts.black, fontSize: 13.5, lineHeight: 19, color: colors.ink },

  slip: {
    marginTop: 16,
    backgroundColor: colors.creamDark,
    borderLeftWidth: 4,
    borderLeftColor: colors.ink,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  slipTitle: { fontFamily: fonts.black, fontSize: 15.5, lineHeight: 20, color: colors.ink, marginBottom: 6 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  bulletAmber: {
    backgroundColor: colors.amber,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bulletText: { flex: 1, fontFamily: fonts.bold, fontSize: 14.5, lineHeight: 21, color: colors.ink },
  bulletStrong: { fontFamily: fonts.black },
  link: { fontFamily: fonts.black, textDecorationLine: 'underline' },
  slipSmall: { marginTop: 6, fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17, color: colors.brownMid },
  mathBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  mathText: { fontFamily: fonts.black, fontSize: 12.5, color: colors.brownMid, textDecorationLine: 'underline' },

  ctas: { marginTop: 18, gap: 12 },
  pitch: {
    marginTop: -4,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.brownMid,
  },
});
