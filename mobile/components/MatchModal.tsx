// mobile/components/MatchModal.tsx
// The pop-up shown when a like turns into a mutual match. Mirrors
// web/components/MatchModal.tsx.
//
// It used to celebrate identically no matter what the engine thought, so a
// pairing calculateCompatibility() itself labels 'Safety mismatch' (score under
// 45, or an owner who said their dog isn't vaccinated) got the same confetti
// and "It's a Match!" as a perfect one. The blocked variant below is
// deliberately sober: the same information, no party, and the owner has to
// acknowledge it before "Say hi" appears.

import { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import CompatBreakdown from './CompatBreakdown';
import { QUALITY_RING_COLORS } from './SwipeCard';
import type { DiscoverDog } from '../lib/discover';
import { playdateSafetyUrl } from '../lib/webLinks';
import { canOfferInAppPurchase } from '../lib/pro';
import { getChatUnlockPitch } from '../../shared/utils/stripe';
import { CHAT_FREE_LAUNCH_MODE } from '../../shared/matchAccess';

const MATCH_HEADLINES = ["It's a Match!", 'MUTUAL WOOF'];
const BLOCKED_HEADLINE = 'You both said WOOF — read this first';

interface Props {
  dog: DiscoverDog | null;
  matchId: string | null;
  onSayHi: () => void;
  onKeepSwiping: () => void;
}

export default function MatchModal({ dog, matchId, onSayHi, onKeepSwiping }: Props) {
  const visible = dog !== null && matchId !== null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onKeepSwiping}
    >
      {/* Keyed so the acknowledgement, the "show the math" toggle and the
          headline all start fresh for each new match. */}
      {dog && matchId ? (
        <MatchModalContent
          key={`${matchId}:${dog.id}`}
          dog={dog}
          onSayHi={onSayHi}
          onKeepSwiping={onKeepSwiping}
        />
      ) : null}
    </Modal>
  );
}

function MatchModalContent({
  dog,
  onSayHi,
  onKeepSwiping,
}: {
  dog: DiscoverDog;
  onSayHi: () => void;
  onKeepSwiping: () => void;
}) {
  const isBlocked = dog.compat.quality === 'blocked';
  // The blocked branch never randomizes — a safety message that reads
  // differently each time can't be reported or reproduced.
  const [headline] = useState(() =>
    isBlocked ? BLOCKED_HEADLINE : MATCH_HEADLINES[Math.floor(Math.random() * MATCH_HEADLINES.length)],
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const photo = dog.photos[0] ?? null;
  const topReasons = dog.compat.reasons.slice(0, 3);
  const warnings = dog.compat.warnings;
  const ringColor = QUALITY_RING_COLORS[dog.compat.quality] ?? colors.gold;

  // An unknown distance is never "nearby" — that's the overclaim the engine
  // used to make by scoring a missing location as maximum proximity.
  const distanceSummary =
    typeof dog.distanceMiles === 'number' && dog.distanceMiles >= 0
      ? `${dog.distanceMiles.toFixed(1)} mi apart`
      : dog.neighbourhood ?? 'Location not shared';

  // A blocked pairing shouldn't make "Say hi" the default action before the
  // owner has seen why it's flagged.
  const chatUnlocked = !isBlocked || acknowledged;
  // The pitch is a free-chat line today. If chat ever goes paid again, the
  // priced version must not appear on iOS, where purchases are hidden.
  const showPitch = chatUnlocked && (CHAT_FREE_LAUNCH_MODE || canOfferInAppPurchase());

  const eyebrow = isBlocked
    ? 'Why this pairing needs care'
    : warnings.length > 0
      ? 'What lines up, and what to watch'
      : 'What lines up';

  const vaccinationLine =
    dog.vaccinated === true
      ? `${dog.name}'s owner marked them vaccinated`
      : dog.vaccinated === false
        ? `${dog.name}'s owner marked them NOT currently vaccinated`
        : 'Vaccination: not stated';

  function openSafetyGuide() {
    Linking.openURL(playdateSafetyUrl()).catch(() => {});
  }

  return (
    <View style={[styles.overlay, isBlocked ? styles.overlayBlocked : styles.overlayCelebrate]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        accessibilityViewIsModal
      >
        <View style={[styles.modal, isBlocked ? styles.modalBlocked : styles.modalCelebrate]}>
          {!isBlocked && (
            <Text style={styles.burst} accessibilityElementsHidden importantForAccessibility="no">
              🐕 💛 🐶
            </Text>
          )}
          <Text style={[styles.title, isBlocked && styles.titleBlocked]} accessibilityRole="header">
            {headline}
          </Text>

          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} accessibilityLabel={dog.name} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Text style={styles.photoFallbackEmoji}>🐕</Text>
            </View>
          )}

          <Text style={styles.dogName}>{dog.name}</Text>
          {/* Asserts only what the data says: both owners swiped like. */}
          <Text style={styles.bothSaid}>You both said WOOF.</Text>
          <Text style={styles.meta}>
            {dog.breed} · {distanceSummary}
          </Text>
          {/* The verdict gets its own line in its tier colour — it's a
              conclusion, not a peer of breed and distance. */}
          <Text style={[styles.verdict, { color: ringColor }]}>{dog.compat.label}</Text>

          <View style={[styles.scoreRing, { borderColor: ringColor }]}>
            <Text style={styles.scoreRingText}>{dog.compat.score}</Text>
          </View>
          <Text style={styles.scoreRingLabel}>Fit score</Text>

          <View style={styles.reasonCard}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>

            {/* When there's something to be careful about, it goes FIRST. */}
            {warnings.length > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningLabel}>Before you meet</Text>
                {warnings.map((warning) => (
                  <Text key={warning} style={styles.warningText}>{warning}</Text>
                ))}
              </View>
            )}

            {topReasons.map((reason) => (
              <Text key={reason} style={styles.reasonText}>
                <Text style={styles.reasonBullet}>• </Text>
                {reason}
              </Text>
            ))}

            {/* Vaccination was visible while swiping and then disappeared at
                the moment the owner decides to meet. null means nobody
                answered. */}
            <Text style={styles.reasonText}>
              <Text style={styles.reasonBullet}>• </Text>
              {vaccinationLine}
            </Text>

            {/* Same size and contrast as the reasons above it — a disclosure
                in smaller, dimmer type is a disclaimer, not a disclosure. */}
            <Text style={styles.disclosure}>
              Everything here comes from what each owner typed in. GoDoggyDate doesn&apos;t
              verify breed, vaccination, or temperament.
            </Text>

            <Pressable
              onPress={() => setShowBreakdown((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ expanded: showBreakdown }}
            >
              <Text style={styles.mathToggle}>
                {showBreakdown ? 'Hide the math' : 'How this was calculated'}
              </Text>
            </Pressable>
            {showBreakdown && (
              <View style={styles.breakdownWrap}>
                <CompatBreakdown breakdown={dog.compat.breakdown} score={dog.compat.score} />
              </View>
            )}
          </View>

          {isBlocked && !acknowledged ? (
            <Pressable
              style={styles.ackBtn}
              onPress={() => setAcknowledged(true)}
              accessibilityRole="button"
            >
              <Text style={styles.ackBtnText}>Got it — I&apos;ve read the above</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={onSayHi} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>💬 Say hi to {dog.name}</Text>
            </Pressable>
          )}

          {/* Safety guidance outranks the payment pitch. */}
          <Text style={styles.safetyText}>
            Meet somewhere neutral and public the first time — not either dog&apos;s home or
            regular park.{' '}
            <Text style={styles.safetyLink} onPress={openSafetyGuide} accessibilityRole="link">
              How to run a first meeting
            </Text>
          </Text>

          {showPitch && <Text style={styles.pitchText}>{getChatUnlockPitch()}</Text>}

          <Pressable style={styles.secondaryBtn} onPress={onKeepSwiping} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Keep swiping →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  overlayCelebrate: {
    backgroundColor: 'rgba(42,31,74,0.72)',
  },
  overlayBlocked: {
    backgroundColor: 'rgba(15,23,42,0.78)',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 56,
  },
  modal: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  modalCelebrate: {
    backgroundColor: colors.brown,
  },
  // Slate, not brand brown — the same "read this first" palette as web.
  modalBlocked: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  burst: {
    fontSize: 34,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.white,
    marginBottom: 16,
    textAlign: 'center',
  },
  titleBlocked: {
    fontSize: 26,
    lineHeight: 32,
  },
  photo: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: colors.gold,
  },
  photoFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFallbackEmoji: {
    fontSize: 44,
  },
  dogName: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.white,
  },
  bothSaid: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginTop: 4,
  },
  verdict: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  scoreRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  scoreRingText: {
    fontFamily: fonts.bold,
    fontWeight: '800',
    fontSize: 18,
    color: colors.white,
  },
  scoreRingLabel: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 6,
  },
  reasonCard: {
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 18,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  warningBox: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.6)',
    backgroundColor: 'rgba(69,26,3,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  warningLabel: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  warningText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
    marginTop: 4,
  },
  reasonText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 10,
  },
  reasonBullet: {
    color: colors.gold,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  disclosure: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  mathToggle: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textDecorationLine: 'underline',
    marginTop: 12,
  },
  breakdownWrap: {
    marginTop: 10,
  },
  ackBtn: {
    width: '100%',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  ackBtnText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: '#0F172A',
    fontSize: 15,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.brown,
    fontSize: 16,
  },
  safetyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 14,
  },
  safetyLink: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.white,
    textDecorationLine: 'underline',
  },
  pitchText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginTop: 10,
  },
  secondaryBtn: {
    paddingVertical: 12,
    marginTop: 6,
  },
  secondaryBtnText: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
});
