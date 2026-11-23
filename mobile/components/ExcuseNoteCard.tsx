// mobile/components/ExcuseNoteCard.tsx
// The shareable "Official Dog Excuse Note" — a formal-looking note "issued" by
// your dog explaining why you can't make it to a thing. Mirrors
// web/components/ExcuseNoteCard.tsx and is built entirely from
// shared/excuseNote.ts (deterministic; no AI). It is a JOKE by construction and
// by presentation:
//
//   • A bright "NOT A REAL DOCTOR'S NOTE" ribbon hangs from the top of the frame.
//   • The letterhead is a fictional dog office, the seal is a paw print, the
//     signature is the dog's name, and a plain-language disclaimer runs along
//     the bottom.
//   • The brand + godoggydate.com URL are baked INSIDE the captured <View ref>,
//     so a reposted PNG still carries the back-link.
//
// Web renders it at a fixed 4:5. Here 4:5 is the minimum height and the card
// grows if a long name or event needs another line, so nothing is ever clipped.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts } from '../constants/theme';
import type { ExcuseNote } from '../../shared/excuseNote';

interface Props {
  note: ExcuseNote;
}

// Aged-paper palette as literal hex for a faithful view-shot capture (same
// values as the web card).
const INK = '#2A1F4A';
const INK_SOFT = '#6B4E2E';
const SEAL = '#D63A6B';

const CARD_WIDTH = 340;

const ExcuseNoteCard = forwardRef<View, Props>(function ExcuseNoteCard({ note }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={['#FBF3E4', '#F3E4C9']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Formal double-border frame: an ink border with a fine inner rule. */}
      <View style={styles.frame}>
        <View style={styles.innerRule} pointerEvents="none" />

        {/* "Not a real note" ribbon — the unmistakable tell, kept in-frame */}
        <View style={styles.ribbon}>
          <Text style={styles.ribbonText}>🐾 Not a real doctor&apos;s note 🐾</Text>
        </View>

        <View style={styles.body}>
          {/* Letterhead */}
          <View style={styles.letterhead}>
            <Text style={styles.notice}>Official Notice</Text>
            <Text style={styles.office}>{note.office}</Text>
            <Text style={styles.department}>{note.department}</Text>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerPaw}>🐾</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.refNo}>Ref. No. {note.refNo}</Text>

          <Text style={styles.salutation}>{note.salutation}</Text>
          <Text style={styles.noteBody}>{note.body}</Text>
          <Text style={styles.supporting}>{note.supporting}</Text>
          <Text style={styles.closing}>{note.closing}</Text>

          {/* Signature block + paw seal */}
          <View style={styles.signatureRow}>
            <View style={styles.signature}>
              <Text style={styles.signoff}>{note.signoff}</Text>
              <Text style={styles.signerName}>{note.signerName} 🐾</Text>
              <Text style={styles.signerTitle}>{note.signerTitle}</Text>
            </View>

            {/* Paw seal — an obviously-a-joke rubber stamp */}
            <View style={styles.seal}>
              <Text style={styles.sealPaw}>🐾</Text>
              <Text style={styles.sealText}>{'Certified\nGood Dog'}</Text>
            </View>
          </View>

          {/* Disclaimer — plain-language honesty, always in the capture */}
          <Text style={styles.disclaimer}>{note.disclaimer}</Text>

          {/* Baked-in brand + URL — a reposted PNG keeps the back-link */}
          <View style={styles.footer}>
            <Text style={styles.brand}>GoDoggyDate</Text>
            <Text style={styles.brandUrl}>godoggydate.com</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default ExcuseNoteCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    minHeight: (CARD_WIDTH * 5) / 4,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#FBF3E4',
  },
  // flexGrow, not flex: 1, so the frame sizes to its content and then stretches
  // to the card's 4:5 minimum height.
  frame: { flexGrow: 1, borderWidth: 2, borderColor: INK },
  innerRule: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: INK_SOFT,
  },
  ribbon: { alignSelf: 'center', backgroundColor: SEAL, paddingHorizontal: 12, paddingVertical: 4 },
  ribbonText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  body: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 },
  letterhead: { alignItems: 'center' },
  notice: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: INK_SOFT,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  office: { fontFamily: fonts.display, fontSize: 17, lineHeight: 21, color: INK, textAlign: 'center', marginTop: 2 },
  department: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 10, color: INK_SOFT, textAlign: 'center', marginTop: 2 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: INK_SOFT, opacity: 0.5 },
  dividerPaw: { fontSize: 12 },
  refNo: { fontFamily: fonts.body, fontSize: 9, color: INK_SOFT },
  salutation: { fontFamily: fonts.semibold, fontSize: 12, color: INK, marginTop: 8 },
  noteBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16.5, color: INK, marginTop: 6 },
  supporting: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 11, lineHeight: 15, color: INK_SOFT, marginTop: 6 },
  closing: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: INK, marginTop: 6 },
  signatureRow: {
    marginTop: 'auto',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  signature: { flex: 1 },
  signoff: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT },
  signerName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: INK, marginTop: 2 },
  signerTitle: { fontFamily: fonts.body, fontSize: 9, color: INK_SOFT, marginTop: 1 },
  seal: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: SEAL,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-11deg' }],
  },
  sealPaw: { fontSize: 22, lineHeight: 24, color: SEAL },
  sealText: {
    fontFamily: fonts.bold,
    fontSize: 6,
    lineHeight: 7.5,
    color: SEAL,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 1,
  },
  disclaimer: { fontFamily: fonts.body, fontSize: 7.5, lineHeight: 9.5, color: INK_SOFT, textAlign: 'center', marginTop: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: INK_SOFT,
  },
  brand: { fontFamily: fonts.display, fontSize: 11, color: INK },
  brandUrl: { fontFamily: fonts.body, fontSize: 8.5, color: INK_SOFT },
});
