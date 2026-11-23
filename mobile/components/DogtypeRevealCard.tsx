// mobile/components/DogtypeRevealCard.tsx
// The reveal: "Biscuit is The Social Butterfly", how that type gets along with
// your dog, and a count-only tease of the Dogtypes still hidden. Shown on the
// match screen and, later, as a sheet for a match you weren't there for. It only
// ever receives a type you've just met (or your own), never a hidden one.

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { trackEvent } from '../lib/analytics';
import { colors, fonts } from '../constants/theme';
import { dogtypeByCode, dogtypeCompat, dogtypeReasons } from '../../shared/dogtype';

export type RevealVariant = 'new' | 'met' | 'same';

interface Props {
  ownName: string;
  ownCode: string;
  otherName: string;
  otherCode: string;
  /** Types discovered so far, including this one. */
  discovered: number;
  variant: RevealVariant;
  showTease?: boolean;
  /** Short version for the match screen: one reason and a link to the full sheet. */
  compact?: boolean;
  onOpenMore?: () => void;
}

const EYEBROW: Record<RevealVariant, string> = {
  new: 'New Dogtype discovered',
  met: 'A Dogtype you’ve met',
  same: 'Same Dogtype as yours',
};

export default function DogtypeRevealCard({ ownName, ownCode, otherName, otherCode, discovered, variant, showTease = true, compact = false, onOpenMore }: Props) {
  useEffect(() => {
    trackEvent('dogtype_reveal_shown', { context: showTease ? 'modal' : 'sheet', variant });
  }, [showTease, variant]);
  const type = dogtypeByCode(otherCode);
  const compat = dogtypeCompat(ownCode, otherCode);
  if (!type || !compat) return null;
  const reasons = dogtypeReasons(ownCode, otherCode);
  const hidden = Math.max(0, 16 - discovered);
  const vibeLabel = `Personality vibe · ${compat.vibe === 'great' ? 'Great' : compat.vibe === 'spicy' ? 'Spicy, take it slow' : 'Good potential'}`;
  const headline = variant === 'same' ? `${otherName} is a ${type.name.replace(/^The /, '')} too` : type.name;

  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>{EYEBROW[variant]}</Text>
        {variant === 'new' && (
          <View style={styles.chip} accessibilityLabel={`${discovered} of 16 discovered`}>
            <Text style={styles.chipText}>{discovered} of 16</Text>
          </View>
        )}
      </View>

      <View style={styles.identity}>
        <View style={styles.sticker} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.stickerEmoji}>{type.emoji}</Text>
        </View>
        <View style={styles.identityText}>
          {variant !== 'same' && <Text style={styles.isLine}>{otherName} is</Text>}
          <Text style={styles.typeName}>{headline}</Text>
          <Text style={styles.tagline}>{type.tagline}</Text>
        </View>
      </View>
      {!compact && <Text style={styles.blurb}>{type.blurb}</Text>}

      <View style={styles.rule} />
      {!compact && <Text style={styles.sectionTitle}>How they get along with {ownName}</Text>}
      <View style={[styles.vibe, compat.vibe === 'great' && { backgroundColor: colors.fit }]} accessibilityLabel={`Vibe: ${vibeLabel}`}>
        <Text style={styles.vibeText}>{vibeLabel}</Text>
      </View>
      {(compact ? reasons.slice(0, 1) : reasons).map((r) => (
        <View key={r.text} style={styles.reasonRow}>
          <View style={[styles.mark, r.mark === 'good' ? { backgroundColor: colors.fit } : { backgroundColor: colors.amber }]}>
            <Text style={styles.markText}>{r.mark === 'good' ? '✓' : '!'}</Text>
          </View>
          <Text style={styles.reasonText}>{r.text}</Text>
        </View>
      ))}

      {compact && onOpenMore && (
        <Pressable style={styles.more} accessibilityRole="button" onPress={onOpenMore}>
          <Text style={styles.moreText}>See how they get along with {ownName} ›</Text>
        </Pressable>
      )}

      {showTease && hidden > 0 && (
        <View style={styles.tease} accessible accessibilityLabel={`${hidden} Dogtypes still hidden. Each new match could uncover the next one.`}>
          <View style={styles.teaseTop}>
            <Text style={styles.teaseTitle}>{hidden} Dogtype{hidden === 1 ? '' : 's'} still hidden</Text>
            <Text style={styles.teaseCount}>{discovered} / 16</Text>
          </View>
          <View style={styles.segments}>
            {Array.from({ length: 16 }, (_, i) => (
              <View key={i} style={[styles.segment, i < discovered ? styles.segmentOn : styles.segmentOff]} />
            ))}
          </View>
          <Text style={styles.teaseNote}>Each new match could uncover the next one.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 24,
    padding: 16,
    gap: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 0,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flex: 1, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  chip: { backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontFamily: fonts.black, fontSize: 12, color: colors.paper },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sticker: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.note,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerEmoji: { fontSize: 38 },
  identityText: { flex: 1 },
  isLine: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid },
  typeName: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  tagline: { fontFamily: fonts.hand, fontSize: 21, lineHeight: 24, color: colors.ink },
  blurb: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  rule: { height: 2, backgroundColor: colors.border },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink },
  vibe: {
    alignSelf: 'flex-start',
    backgroundColor: colors.kraft,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  vibeText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  reasonText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  more: { minHeight: 40, justifyContent: 'center' },
  moreText: { fontFamily: fonts.black, fontSize: 14, color: colors.rose },
  tease: { marginTop: 4, backgroundColor: colors.note, borderWidth: 2, borderColor: colors.ink, borderRadius: 18, padding: 14, gap: 8 },
  teaseTop: { flexDirection: 'row', alignItems: 'baseline' },
  teaseTitle: { flex: 1, fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  teaseCount: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 14, borderRadius: 4 },
  segmentOn: { backgroundColor: colors.ink },
  segmentOff: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.brownMid },
  teaseNote: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
});
