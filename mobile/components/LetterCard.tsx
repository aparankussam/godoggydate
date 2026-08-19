// mobile/components/LetterCard.tsx
// The shareable "Gotcha Day Letter" — mirrors web/components/LetterCard.tsx as a
// sealed keepsake letter on warm parchment: a wax-seal header, the occasion, and
// a handwritten-feeling note from the dog to its human. It is the <View ref>
// captured by react-native-view-shot (via lib/shareCard.ts), so — exactly like
// every other shareable card — two things are baked INTO the pixels: the honesty
// label ("written with AI, from real moments") and the brand + URL
// ("GoDoggyDate · godoggydate.com"). A reposted screenshot keeps both.
//
// Parchment palette is kept as literal hex (matching the web card) rather than
// theme tokens, because the letter has its own aged-paper look distinct from the
// coral brand surfaces.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../constants/theme';

interface Props {
  salutation: string;
  body: string;
  signOff: string;
  dogName: string;
  /** The real occasion, e.g. "Rex's Gotcha Day". */
  occasion: string;
  /** The honest subtitle, e.g. "3 years since Rex came home". */
  occasionSubtitle?: string;
}

// Warm parchment palette, literal hex to match the web keepsake card exactly.
const PAPER = '#FBF3E2';
const INK = '#2B2015';
const INK_SOFT = '#8C7A5E';
const RULE = '#E6D6B6';
const WAX = '#B23A2E';
const GOLD = '#B07D1A';

const LetterCard = forwardRef<View, Props>(function LetterCard(
  { salutation, body, signOff, dogName, occasion, occasionSubtitle },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Header — wax seal + occasion */}
      <View style={styles.header}>
        <View style={styles.wax}>
          <Text style={styles.waxPaw}>🐾</Text>
        </View>
        <Text style={styles.fromLabel}>A Letter From {dogName}</Text>
        <Text style={styles.occasion}>{occasion}</Text>
        {occasionSubtitle ? <Text style={styles.occasionSub}>{occasionSubtitle}</Text> : null}
        <View style={styles.headerRule} />
      </View>

      {/* The letter itself — flexes to centre both short (sparse) and long
          letters between header and footer. */}
      <View style={styles.letterBody}>
        <Text style={styles.salutation}>{salutation}</Text>
        <Text style={styles.body}>{body}</Text>
        <Text style={styles.signOff}>{signOff}</Text>
      </View>

      {/* Footer — baked-in honesty label + brand/URL. */}
      <View style={styles.footer}>
        <Text style={styles.honesty}>
          Written with AI, from {dogName}&apos;s real moments — nothing invented.
        </Text>
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

export default LetterCard;

const styles = StyleSheet.create({
  card: {
    aspectRatio: 9 / 16,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: RULE,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 28,
  },
  wax: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: WAX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waxPaw: { fontSize: 28, lineHeight: 32 },
  fromLabel: {
    marginTop: 14,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 2.2,
    color: GOLD,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  occasion: {
    marginTop: 6,
    fontFamily: fonts.display,
    fontSize: 22,
    color: INK,
    textAlign: 'center',
    lineHeight: 26,
  },
  occasionSub: {
    marginTop: 3,
    fontFamily: fonts.body,
    fontSize: 12,
    color: INK_SOFT,
    textAlign: 'center',
  },
  headerRule: { marginTop: 16, width: 48, height: 2, backgroundColor: RULE },
  letterBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 14,
  },
  salutation: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 15, color: INK },
  body: {
    marginTop: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: INK,
  },
  signOff: {
    marginTop: 14,
    fontFamily: fonts.semibold,
    fontStyle: 'italic',
    fontSize: 15,
    color: INK,
  },
  footer: { paddingHorizontal: 28, paddingBottom: 26 },
  honesty: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11,
    color: INK_SOFT,
    textAlign: 'center',
  },
  brandRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: RULE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandName: { fontFamily: fonts.display, fontSize: 14, color: INK },
  brandUrl: { fontFamily: fonts.body, fontSize: 11, color: INK_SOFT },
});
