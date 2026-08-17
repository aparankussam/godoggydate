// mobile/components/DogtypeCompatSection.tsx
// "Who does {dog} vibe with?" — the invite-loop surface. Computes your dog's
// Dogtype, lets you pick any of the 16 types (best matches surfaced first), and
// renders a shareable two-dog compatibility card. Sharing it is the invite:
// "find your dog's Dogtype and see if they get along with mine."

import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import DogtypeCompatCard from './DogtypeCompatCard';
import {
  computeDogtype,
  dogtypeByCode,
  dogtypeCompat,
  dogtypeBestMatches,
  DOGTYPE_CODES,
} from '../../shared/dogtype';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  savedProfile: SavedDogProfile;
}

export default function DogtypeCompatSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const mine = computeDogtype(savedProfile);
  const dogName = savedProfile.name?.trim() || 'Your dog';

  // Order the picker: best matches first, then the rest — minus the dog's own
  // type (comparing a dog to itself isn't the point).
  const best = mine ? dogtypeBestMatches(mine.code, 3).map((t) => t.code) : [];
  const ordered = mine
    ? [...best, ...DOGTYPE_CODES.filter((c) => c !== mine.code && !best.includes(c))]
    : [];

  const [selectedCode, setSelectedCode] = useState<string>(ordered[0] ?? '');

  if (!mine || ordered.length === 0) return null;
  // Non-null capture so the async share closure keeps the narrowing.
  const myType = mine;

  const other = dogtypeByCode(selectedCode);
  const compat = other ? dogtypeCompat(myType.code, other.code) : null;

  async function handleShare() {
    if (sharing || !compat || !other) return;
    setSharing(true);
    trackEvent('dogtype_compat_share_click', { a: myType.code, b: other.code, vibe: compat.vibe });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-vs-${other.code}.png`,
      `Does your dog get along with ${dogName}?`,
    );
    if (result === 'shared') {
      trackEvent('dogtype_compat_shared', { a: myType.code, b: other.code, vibe: compat.vibe, method: 'native_share' });
    }
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Who does {dogName} vibe with?</Text>
      <Text style={styles.sub}>
        Pick a type to see the vibe, then share it — tag a friend to find their dog&apos;s Dogtype.
      </Text>

      {/* Type picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerRow}
      >
        {ordered.map((code) => {
          const t = dogtypeByCode(code);
          if (!t) return null;
          const active = code === selectedCode;
          const isBest = best.includes(code);
          return (
            <Pressable
              key={code}
              onPress={() => setSelectedCode(code)}
              style={[styles.pick, active && styles.pickActive]}
            >
              <Text style={styles.pickEmoji}>{t.emoji}</Text>
              <Text style={[styles.pickName, active && styles.pickNameActive]} numberOfLines={1}>
                {t.name.replace(/^The /, '')}
              </Text>
              {isBest && <Text style={styles.bestTag}>top match</Text>}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* The shareable card */}
      {compat && other && (
        <>
          <View style={styles.cardWrap}>
            <DogtypeCompatCard ref={cardRef} aType={mine} bType={other} aName={dogName} compat={compat} />
          </View>
          <Pressable style={[styles.shareButton, sharing && { opacity: 0.6 }]} onPress={handleShare} disabled={sharing}>
            <Text style={styles.shareText}>{sharing ? 'Preparing…' : '📤 Share this match'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight, lineHeight: 18, marginTop: 3 },
  pickerRow: { gap: 8, paddingVertical: 12, paddingRight: 4 },
  pick: {
    width: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  pickActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14`, borderWidth: 2 },
  pickEmoji: { fontSize: 26 },
  pickName: { fontFamily: fonts.semibold, fontSize: 11, color: colors.brownMid, marginTop: 4, textAlign: 'center' },
  pickNameActive: { color: colors.brown, fontFamily: fonts.bold },
  bestTag: {
    fontFamily: fonts.bold,
    fontSize: 8,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  cardWrap: { alignItems: 'center', marginTop: 4, marginBottom: 12 },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
});
