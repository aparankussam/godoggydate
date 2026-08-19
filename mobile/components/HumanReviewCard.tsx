// mobile/components/HumanReviewCard.tsx
// The shareable "My Human: A Review" card — mirrors web/components/HumanReviewCard.tsx.
// Styled like a customer-review-site entry (avatar, star row, verdict headline,
// Pros / Areas-for-improvement columns) except the reviewer is a dog and the
// establishment is its human. Openly a joke: it carries a "playful AI read" label
// baked INTO the captured view and the star row is captioned "not a real score".
//
// Captured to PNG via react-native-view-shot (shareCard.ts), so the brand + a
// godoggydate.com URL are baked INSIDE the captured region — a reposted PNG keeps
// the back-link even after social apps strip the caption. Colours are literal hex
// to match the web card exactly.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../constants/theme';

interface Props {
  stars: number;
  headline: string;
  pros: string[];
  improvements: string[];
  verdict: string;
  dogName: string;
  dateLabel?: string;
}

// Review-site palette, kept as literal hex for a faithful capture (matches web).
const PAPER = '#FFFDF9';
const INK = '#1F1B16';
const INK_SOFT = '#8A8378';
const RULE = '#ECE6DA';
const ACCENT = '#E8633A';
const STAR_ON = '#F4B740';
const STAR_OFF = '#E5DECF';
const PRO_GREEN = '#2F7A4B';
const IMPROVE_AMBER = '#B9791C';
const AVATAR_BG = '#F3ECDD';

/** Five-glyph star row that renders halves faithfully in view-shot: each star is
 *  an empty glyph with a width-clipped filled glyph overlaid (0, 50%, or 100%). */
function StarRow({ value }: { value: number }) {
  const clamped = Math.min(5, Math.max(0, value));
  return (
    <View style={styles.starRow} accessibilityLabel={`${clamped} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, clamped - i)); // 0, 0.5, or 1
        return (
          <View key={i} style={styles.starCell}>
            <Text style={[styles.star, { color: STAR_OFF }]}>★</Text>
            {fill > 0 && (
              <View style={[styles.starFillClip, { width: 18 * fill }]}>
                <Text style={[styles.star, { color: STAR_ON }]}>★</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const HumanReviewCard = forwardRef<View, Props>(function HumanReviewCard(
  { stars, headline, pros, improvements, verdict, dogName, dateLabel },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Review-site chrome */}
      <View style={styles.chromeRow}>
        <Text style={styles.chromeEyebrow}>My Human · A Review</Text>
        <Text style={styles.chromeMeta}>Verified pack member</Text>
      </View>

      <View style={styles.body}>
        {/* Reviewer row — the dog is the reviewer */}
        <View style={styles.reviewerRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>🐕</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.reviewerName}>Reviewed by {dogName}</Text>
            <View style={styles.starLine}>
              <StarRow value={stars} />
              <Text style={styles.starValue}>{stars.toFixed(1)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.scoreCaption}>
          {dateLabel ? `${dateLabel} · ` : ''}playful, not a real score
        </Text>

        {/* Headline */}
        <Text style={styles.headline}>“{headline}”</Text>

        <View style={styles.divider} />

        {/* Pros */}
        <Text style={[styles.listLabel, { color: PRO_GREEN }]}>Pros</Text>
        <View style={styles.list}>
          {pros.map((p, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={[styles.bullet, { color: PRO_GREEN }]}>＋</Text>
              <Text style={styles.listText}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Areas for improvement */}
        <Text style={[styles.listLabel, { color: IMPROVE_AMBER, marginTop: 12 }]}>
          Areas for improvement
        </Text>
        <View style={styles.list}>
          {improvements.map((p, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={[styles.bullet, { color: IMPROVE_AMBER }]}>•</Text>
              <Text style={styles.listText}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Verdict */}
        <View style={styles.verdictBlock}>
          <Text style={[styles.listLabel, { color: INK_SOFT }]}>Verdict</Text>
          <Text style={styles.verdictText}>{verdict}</Text>
        </View>

        {/* Honest "playful AI read" stamp — baked in, always in the PNG */}
        <View style={styles.stampRow}>
          <Text style={styles.stampEmoji}>🐾</Text>
          <Text style={styles.stampText}>
            A playful AI read in {dogName}&apos;s voice — not a real rating
          </Text>
        </View>

        {/* Baked-in brand + URL — a reposted PNG still carries the back-link. */}
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

export default HumanReviewCard;

const styles = StyleSheet.create({
  card: {
    width: 340,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: RULE,
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  chromeEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: ACCENT,
    textTransform: 'uppercase',
  },
  chromeMeta: { fontFamily: fonts.body, fontSize: 11, color: INK_SOFT },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  reviewerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: AVATAR_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },
  reviewerName: { fontFamily: fonts.bold, fontSize: 14, color: INK, lineHeight: 17 },
  starLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  starRow: { flexDirection: 'row', gap: 2 },
  starCell: { width: 18, height: 18, position: 'relative' },
  star: { fontSize: 18, lineHeight: 18, width: 18, textAlign: 'left' },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 18, overflow: 'hidden' },
  starValue: { fontFamily: fonts.bold, fontSize: 13, color: INK },
  scoreCaption: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT, marginTop: 6 },
  headline: { fontFamily: fonts.display, fontSize: 20, color: INK, marginTop: 12, lineHeight: 24 },
  divider: { height: 1, backgroundColor: RULE, marginVertical: 14 },
  listLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  list: { marginTop: 6, gap: 4 },
  listRow: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 19 },
  listText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: INK },
  verdictBlock: { marginTop: 14, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 12 },
  verdictText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: INK, marginTop: 4 },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  stampEmoji: { fontSize: 20, lineHeight: 20 },
  stampText: { flex: 1, fontFamily: fonts.body, fontStyle: 'italic', fontSize: 11, color: INK_SOFT },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: RULE,
  },
  brandName: { fontFamily: fonts.display, fontSize: 13, color: INK },
  brandUrl: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT },
});
