// mobile/components/RoastCard.tsx
// The shareable "Roast My Dog (Certified Affectionate)" card — a 9:16 comedy-
// club poster mirroring web/components/RoastCard.tsx. The dog sits on a stool
// under a spotlight; three roast lines land as the set, and one warm compliment
// closes it out. Deliberately styled like a stand-up flyer ("TONIGHT ONLY",
// spotlight, brick-red stage) so it reads as an affectionate roast at a glance —
// never as a real judgement of the dog.
//
// It carries an "affectionate roast · written by AI" label baked INTO the
// captured region, alongside the GoDoggyDate + URL back-link, so a reposted
// screenshot still shows both that it's AI comedy and where it came from.
//
// forwardRef<View> for react-native-view-shot capture, like every other
// shareable card. Colours are literal hex for faithful capture.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts } from '../constants/theme';

interface Props {
  dogName: string;
  /** Exactly 3 affectionate roast lines. */
  lines: string[];
  /** The mandatory warm closing compliment. */
  compliment: string;
}

// Comedy-club palette, literal hex for faithful capture.
const STAGE = '#241014'; // deep brick-red house
const STAGE_2 = '#3A1A18';
const STAGE_DEEP = '#180A0D';
const SPOT = '#F5B731'; // spotlight gold
const CREAM = '#FDF6EE';
const CREAM_SOFT = '#E9D9C6';
const PRIMARY = '#E8633A';
const INK_SOFT = 'rgba(253,246,238,0.62)';

const RoastCard = forwardRef<View, Props>(function RoastCard({ dogName, lines, compliment }, ref) {
  const three = (lines ?? []).slice(0, 3);

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Deep brick-red house lights, top-lit toward the stage. */}
      <LinearGradient
        colors={[STAGE_2, STAGE, STAGE_DEEP]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Spotlight cone from the top, behind the dog. */}
      <LinearGradient
        colors={['rgba(245,183,49,0.30)', 'rgba(245,183,49,0.08)', 'rgba(245,183,49,0)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.spotlight}
        pointerEvents="none"
      />

      <View style={styles.inner}>
        {/* Marquee eyebrow */}
        <Text style={styles.marquee}>★ TONIGHT ONLY ★</Text>

        {/* The dog on a stool, under the spotlight. */}
        <View style={styles.stageDog}>
          <Text style={styles.dogEmoji}>🐕</Text>
          <Text style={styles.stoolEmoji}>🪑</Text>
        </View>

        <Text style={styles.title}>Roasting {dogName}</Text>
        <Text style={styles.subtitle}>A certified affectionate roast</Text>

        {/* The three-beat set. */}
        <View style={styles.set}>
          {three.map((line, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={styles.lineNum}>{i + 1}</Text>
              <Text style={styles.lineText}>{line}</Text>
            </View>
          ))}
        </View>

        {/* The warm landing — the closer. */}
        <View style={styles.complimentBox}>
          <Text style={styles.complimentLabel}>BUT HONESTLY —</Text>
          <Text style={styles.complimentText}>{compliment}</Text>
        </View>

        {/* Baked-in AI label + brand + URL — a reposted PNG still shows it's AI
            comedy and still carries the back-link. */}
        <View style={styles.footer}>
          <Text style={styles.aiLabel}>affectionate roast · written by AI</Text>
          <View style={styles.brandWrap}>
            <Text style={styles.brand}>GoDoggyDate</Text>
            <Text style={styles.url}>godoggydate.com</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

RoastCard.displayName = 'RoastCard';
export default RoastCard;

const CARD_WIDTH = 340;
const CARD_HEIGHT = Math.round((CARD_WIDTH * 16) / 9); // 9:16 → 604

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: STAGE,
  },
  spotlight: {
    position: 'absolute',
    top: -30,
    left: CARD_WIDTH / 2 - 145,
    width: 290,
    height: 330,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
  },
  marquee: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: SPOT,
    letterSpacing: 4,
    textAlign: 'center',
  },
  stageDog: { alignItems: 'center', marginTop: 6 },
  dogEmoji: { fontSize: 64, lineHeight: 68 },
  stoolEmoji: { fontSize: 40, lineHeight: 40, marginTop: -6 },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: CREAM,
    textAlign: 'center',
    lineHeight: 32,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: INK_SOFT,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  set: { alignSelf: 'stretch', marginTop: 18, gap: 10 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lineNum: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: PRIMARY,
    width: 20,
    lineHeight: 22,
  },
  lineText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: CREAM },
  complimentBox: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,183,49,0.35)',
    backgroundColor: 'rgba(245,183,49,0.10)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  complimentLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: SPOT,
    letterSpacing: 2,
    marginBottom: 5,
  },
  complimentText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: CREAM },
  footer: {
    alignSelf: 'stretch',
    marginTop: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(253,246,238,0.18)',
  },
  aiLabel: { fontFamily: fonts.body, fontSize: 11, color: CREAM_SOFT, flex: 1 },
  brandWrap: { alignItems: 'flex-end' },
  brand: { fontFamily: fonts.display, fontSize: 13, color: CREAM },
  url: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT },
});
