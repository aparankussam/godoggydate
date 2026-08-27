// mobile/components/LetterCard.tsx
// The shareable "Gotcha Day Letter" — mirrors web/components/LetterCard.tsx as a
// sealed keepsake letter on warm parchment: a wax-seal header, the occasion, and
// a handwritten-feeling note from the dog to its human.
//
// Renders in two variants from the SAME letter data (see LetterSection):
//  - 'screen': the full letter, unclipped, sized to its natural content
//    height so the profile ScrollView carries it. No text is ever trimmed.
//  - 'capture': the fixed 9:16 keepsake actually captured for sharing (via
//    lib/shareCard.ts's captureRef). A long letter would overflow a fixed
//    9:16 box, so this variant measures itself (via onLayout — RN has no
//    scrollHeight/clientHeight) and steps the body text down through a small
//    size ladder until it fits; only if even the smallest size still
//    overflows does it fall back to trimming the body at the last full
//    sentence (never mid-word), marked with an ellipsis.
//
// It is the <View ref> captured by react-native-view-shot (via
// lib/shareCard.ts), so — exactly like every other shareable card — two
// things are baked INTO the pixels: the honesty label ("written with AI, from
// real moments") and the brand + URL ("GoDoggyDate · godoggydate.com").
//
// Parchment palette is kept as literal hex (matching the web card) rather than
// theme tokens, because the letter has its own aged-paper look distinct from the
// coral brand surfaces.

import { forwardRef, useEffect, useState } from 'react';
import {
  Dimensions, StyleSheet, Text, View,
  type LayoutChangeEvent, type NativeSyntheticEvent, type TextLayoutEventData,
} from 'react-native';
import { fonts } from '../constants/theme';

interface Props {
  /** 'screen' = full letter, natural height, the ScrollView carries it —
   *  never trimmed. 'capture' = the fixed 9:16 keepsake that gets
   *  captured/shared; auto-fits the body text down before ever trimming it. */
  variant: 'screen' | 'capture';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Matches the profile screen's content padding (20px each side) — the same
// on-screen width the card rendered at before this change (it used to just
// stretch to fill its parent; the capture variant now needs an explicit
// width since it's positioned independently of that parent).
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = (CARD_WIDTH * 16) / 9;

// Font-size/line-height ladder the CAPTURE variant steps down through before
// ever trimming a word. Tuned so most real letters (AI target ~150 words,
// hard cap ~235) fit within the first step or two.
const FIT_LADDER: { fontSize: number; lineHeight: number }[] = [
  { fontSize: 14, lineHeight: 22 },
  { fontSize: 13, lineHeight: 20 },
  { fontSize: 12, lineHeight: 18 },
];

/** Floor on the trim budget, so the fit loop is always bounded. */
const MIN_BUDGET = 60;

// Layout constants for the capture fit maths. These MUST stay in sync with the
// styles below — they're what turns measured line counts into a required
// height (a clamped View height can't be used; see the `lines` state comment).
const BODY_PAD_TOP = 18;
const BODY_PAD_BOTTOM = 14;
const BODY_MARGIN_TOP = 10;
const SIGNOFF_MARGIN_TOP = 14;
/** Explicit lineHeight on the salutation/sign-off (fontSize 15). */
const CHROME_LINE_HEIGHT = 21;

/** Trim `text` to at most `maxChars`, cutting at the last full sentence
 *  inside that budget — never mid-word — and marking the cut with an
 *  ellipsis. Falls back to the last whole word if no sentence boundary falls
 *  within a reasonable share of the budget. */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const sentenceMatch = slice.match(/^[\s\S]*[.!?](?=\s|$)/);
  let cut = sentenceMatch ? sentenceMatch[0].trim() : '';
  if (cut.length < maxChars * 0.4) {
    cut = slice.replace(/\s+\S*$/, '').trim();
  }
  return cut.replace(/[.!?]+$/, '') + '…';
}

const LetterCard = forwardRef<View, Props>(function LetterCard(
  { variant, salutation, body, signOff, dogName, occasion, occasionSubtitle },
  ref,
) {
  const isCapture = variant === 'capture';
  const [stepIndex, setStepIndex] = useState(0);
  const fit = FIT_LADDER[stepIndex];
  const [displayBody, setDisplayBody] = useState(body);
  const [budget, setBudget] = useState(body.length);
  // Natural (unconstrained) heights from onLayout — RN has no
  // scrollHeight/clientHeight, so the fit is driven by these measurements
  // instead of a synchronous DOM read. The middle measurement is TAGGED with
  // the rung and text it was taken for: without that, a change to stepIndex
  // would re-run the effect against the PREVIOUS rung's height and step the
  // whole ladder in one pass before anything was re-measured.
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  // LINE COUNTS, not box heights. A View's onLayout height here is clamped by
  // the fixed-height card (Yoga reports the constrained box, which saturates —
  // a 773-char and a 1759-char body both measured the same height), so it
  // cannot detect overflow. onTextLayout reports how many lines the text
  // ACTUALLY rendered, which is unaffected by the clamp, and the required
  // height follows from lines x lineHeight. Tagged with the rung/text it was
  // measured for so a stale count can't drive an extra shrink.
  const [lines, setLines] = useState<{ count: number; step: number; body: string } | null>(null);
  const [salLines, setSalLines] = useState(1);
  const [signLines, setSignLines] = useState(1);

  // Reset the fit whenever the underlying letter text changes.
  useEffect(() => {
    setStepIndex(0);
    setDisplayBody(body);
    setBudget(body.length);
    setLines(null);
  }, [body]);

  // Step the ladder (then, at the floor, trim the text) whenever a fresh
  // measurement shows the letter still doesn't fit the fixed capture frame.
  // Only the CAPTURE variant measures/shrinks; SCREEN always shows the full
  // letter and lets the ScrollView carry it.
  useEffect(() => {
    if (!isCapture) return;
    if (!lines || headerHeight == null || footerHeight == null) return;
    // Ignore a count taken for a different rung/text — the next onTextLayout
    // will deliver a matching one.
    if (lines.step !== stepIndex || lines.body !== displayBody) return;

    const available = CARD_HEIGHT - headerHeight - footerHeight;
    // Required height, derived from real line counts rather than a clamped box.
    const required =
      BODY_PAD_TOP + BODY_PAD_BOTTOM +
      salLines * CHROME_LINE_HEIGHT +
      BODY_MARGIN_TOP + lines.count * fit.lineHeight +
      SIGNOFF_MARGIN_TOP + signLines * CHROME_LINE_HEIGHT;
    if (required <= available + 1) return; // +1pt rounding slack

    if (stepIndex < FIT_LADDER.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }

    // Smallest font and still overflowing — trim instead. Keep stepping the
    // budget until the rendered string ACTUALLY changes: truncateAtSentence
    // snaps to a sentence boundary, so a smaller budget can yield the very
    // same string, and an unchanged string means no re-layout, no onLayout,
    // and a fit loop that stalls while still overflowing.
    let nextBudget = budget;
    let nextBody = displayBody;
    while (nextBudget > MIN_BUDGET && nextBody === displayBody) {
      nextBudget = Math.max(MIN_BUDGET, Math.floor(nextBudget * 0.85));
      nextBody = truncateAtSentence(body, nextBudget);
    }
    if (nextBody !== displayBody) {
      setBudget(nextBudget);
      setDisplayBody(nextBody);
    }
  }, [lines, salLines, signLines, fit.lineHeight, headerHeight, footerHeight, stepIndex, displayBody, budget, body, isCapture]);

  function onHeaderLayout(e: LayoutChangeEvent) {
    if (isCapture) setHeaderHeight(e.nativeEvent.layout.height);
  }
  function onFooterLayout(e: LayoutChangeEvent) {
    if (isCapture) setFooterHeight(e.nativeEvent.layout.height);
  }
  function onBodyTextLayout(e: NativeSyntheticEvent<TextLayoutEventData>) {
    if (!isCapture) return;
    // Tag with the rung/text these lines were actually rendered for.
    setLines({ count: e.nativeEvent.lines.length, step: stepIndex, body: displayBody });
  }

  const shownBody = isCapture ? displayBody : body;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={isCapture ? [styles.card, { width: CARD_WIDTH }] : styles.cardScreen}
    >
      {/* Header — wax seal + occasion */}
      <View style={styles.header} onLayout={onHeaderLayout}>
        <View style={styles.wax}>
          <Text style={styles.waxPaw}>🐾</Text>
        </View>
        <Text style={styles.fromLabel}>A Letter From {dogName}</Text>
        <Text style={styles.occasion}>{occasion}</Text>
        {occasionSubtitle ? <Text style={styles.occasionSub}>{occasionSubtitle}</Text> : null}
        <View style={styles.headerRule} />
      </View>

      {/* The letter itself. CAPTURE: an outer flex:1 + centered wrapper gives
          the same "short letters sit centred" look as before, but the INNER
          box (the one actually measured via onLayout) is plain, unconstrained
          flow — so its reported height is the letter's true natural size,
          not clamped to the available space the way the old flex:1 box was
          (that's what let it silently grow past the card and spill over the
          header/footer). SCREEN: no flex/centering at all — it just stacks
          normally and the ScrollView carries whatever height it needs. */}
      {isCapture ? (
        <View style={styles.middleFill}>
          <View style={styles.letterBody}>
            <Text
              style={styles.salutation}
              onTextLayout={(e) => setSalLines(e.nativeEvent.lines.length)}
            >
              {salutation}
            </Text>
            <Text
              style={[styles.body, { fontSize: fit.fontSize, lineHeight: fit.lineHeight }]}
              onTextLayout={onBodyTextLayout}
            >
              {shownBody}
            </Text>
            <Text
              style={styles.signOff}
              onTextLayout={(e) => setSignLines(e.nativeEvent.lines.length)}
            >
              {signOff}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.letterBodyScreen}>
          <Text style={styles.salutation}>{salutation}</Text>
          <Text style={styles.bodyScreen}>{shownBody}</Text>
          <Text style={styles.signOff}>{signOff}</Text>
        </View>
      )}

      {/* Footer — baked-in honesty label + brand/URL. */}
      <View style={styles.footer} onLayout={onFooterLayout}>
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
  cardScreen: {
    alignSelf: 'stretch',
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: RULE,
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
  // CAPTURE: fills the space between header and footer, centering short
  // letters — purely visual, not the box we measure (see letterBody below).
  middleFill: {
    flex: 1,
    justifyContent: 'center',
  },
  letterBody: {
    paddingHorizontal: 28,
    paddingTop: BODY_PAD_TOP,
    paddingBottom: BODY_PAD_BOTTOM,
  },
  // SCREEN: no flex/centre — a normal stacked block the ScrollView carries.
  letterBodyScreen: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 14,
  },
  // Explicit lineHeight so CHROME_LINE_HEIGHT matches what actually renders.
  salutation: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 15, lineHeight: CHROME_LINE_HEIGHT, color: INK },
  body: {
    marginTop: BODY_MARGIN_TOP,
    fontFamily: fonts.body,
    color: INK,
  },
  bodyScreen: {
    marginTop: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: INK,
  },
  signOff: {
    marginTop: SIGNOFF_MARGIN_TOP,
    fontFamily: fonts.semibold,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: CHROME_LINE_HEIGHT,
    color: INK,
  },
  footer: { paddingHorizontal: 28, paddingTop: 14, paddingBottom: 26 },
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
