// mobile/components/ApologyCard.tsx
// The shareable "notes-app apology" card — the celebrity-statement screenshot,
// but the celebrity is a dog. Mirrors web/components/ApologyCard.tsx: styled like
// a phone notes app (white note chrome, a plain-text statement, a paw-print
// signature) so it reads as the familiar internet apology format at a glance.
//
// Openly a JOKE — the subtitle carries "written by AI, in {dog}'s voice" and it
// never claims to be a real statement. Following the shareCard.ts contract every
// mobile card upholds, the brand + godoggydate.com URL are baked INSIDE the
// captured <View ref> so a reposted PNG still carries a working back-link.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius } from '../constants/theme';

interface Props {
  statement: string;
  signOff: string;
  dogName: string;
  /** Optional honest "today" label for the note subtitle. */
  dateLabel?: string;
}

// iOS-notes-ish palette, kept as literal hex for a faithful view-shot capture.
const PAPER = '#FFFDF9';
const INK = '#1F1B16';
const INK_SOFT = '#8A8378';
const RULE = '#ECE6DA';
const ACCENT = '#E8633A'; // brand primary-ish, for the paw + brand mark

const ApologyCard = forwardRef<View, Props>(function ApologyCard(
  { statement, signOff, dogName, dateLabel },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Note chrome — a faux toolbar row that sells the "notes app" read */}
      <View style={styles.chrome}>
        <Text style={styles.chromeLabel}>Notes</Text>
        <Text style={styles.chromeDots}>•••</Text>
      </View>

      <View style={styles.body}>
        {/* Title + honest subtitle */}
        <Text style={styles.title}>A Statement</Text>
        <Text style={styles.subtitle}>
          {dateLabel ? `${dateLabel} · ` : ''}from {dogName} · written by AI, in {dogName}&apos;s voice
        </Text>

        <View style={styles.divider} />

        {/* The statement itself */}
        <Text style={styles.statement}>{statement}</Text>

        {/* Signature line */}
        <Text style={styles.signOff}>{signOff}</Text>

        {/* Paw "signature stamp" */}
        <View style={styles.stampRow}>
          <Text style={styles.stampPaw}>🐾</Text>
          <Text style={styles.stampText}>Signed, under duress, by a very good dog</Text>
        </View>

        {/* Baked-in brand + URL — a reposted PNG still carries the back-link. */}
        <View style={styles.brand}>
          <Text style={styles.brandName}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

export default ApologyCard;

const styles = StyleSheet.create({
  card: {
    width: 340,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: RULE,
  },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  chromeLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: ACCENT,
    textTransform: 'uppercase',
  },
  chromeDots: { fontSize: 15, color: INK_SOFT },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  title: { fontFamily: fonts.display, fontSize: 24, color: INK },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: INK_SOFT, marginTop: 3 },
  divider: { height: 1, backgroundColor: RULE, marginVertical: 14 },
  statement: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: INK },
  signOff: { fontFamily: fonts.semibold, fontSize: 15, color: INK, marginTop: 16 },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  stampPaw: { fontSize: 26, lineHeight: 28 },
  stampText: { fontFamily: fonts.body, fontSize: 11, fontStyle: 'italic', color: INK_SOFT },
  brand: {
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
