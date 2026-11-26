// mobile/components/pack/kit.tsx
// "Sticker Book, grown up" building blocks for the Pack Day, Profile and
// Playroom screens: the sky page with its quiet gingham, paper cards with an
// ink outline and a hard flat shadow, the ONE pink action (ink text, hard
// darker bottom edge), paper buttons, slips, tags and a back header.
// Mirrors web/app/globals.css (.bg-gingham, .card, .btn-primary, .btn-secondary).

import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';

export type GlyphName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** A filled glyph in ink (or the color given). Replaces emoji-as-icons. */
export function Glyph({ name, size = 20, color = colors.ink, style }: { name: GlyphName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} style={style} accessible={false} importantForAccessibility="no" />;
}

export const ink = colors.ink;
export const softInk = colors.brownMid;
export const paper = colors.cream;
export const paperEdge = '#E3D6BA';
export const slip = colors.creamDark;
export const sky = colors.sky;

/** The page's quiet gingham: white stripes at 6%, 52px period, like web's .bg-gingham. */
export function Gingham() {
  const { width, height } = Dimensions.get('window');
  const cols = Math.ceil(Math.max(width, 430) / 52) + 1;
  const rows = Math.ceil(Math.max(height, 932) / 52) + 1;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      {Array.from({ length: cols }, (_, i) => (
        <View key={`c${i}`} style={[styles.stripeV, { left: i * 52 }]} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View key={`r${i}`} style={[styles.stripeH, { top: i * 52 }]} />
      ))}
    </View>
  );
}

/** Paper card: ink outline, rounded, hard flat shadow. */
export function Paper({ children, style, tape, padded = true }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tape?: boolean; padded?: boolean }) {
  return (
    <View style={[styles.paper, padded && styles.paperPad, tape && styles.paperTaped, style]}>
      {tape && <Tape />}
      {children}
    </View>
  );
}

/** A strip of striped kraft tape across the top edge of a paper card. */
export function Tape({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.tape, style]}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={[styles.tapeStripe, { left: i * 16 - 10 }]} />
      ))}
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: GlyphName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Smaller paper button (min 44pt tall). */
  small?: boolean;
}

/** The ONE pink action of a screen. Ink text on pink, hard darker bottom edge. */
export function PinkButton({ label, onPress, icon, disabled, busy, style, accessibilityLabel, accessibilityHint }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.btn, styles.pink, pressed && styles.pressed, off && styles.disabled, style]}
    >
      <View pointerEvents="none" style={[styles.edge, styles.pinkEdge]} />
      <View style={styles.btnInner}>
        {busy ? <ActivityIndicator color={ink} /> : icon ? <Glyph name={icon} size={22} /> : null}
        <Text style={styles.pinkText} numberOfLines={2}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Every other button: paper, ink outline, hard paper-edge bottom. */
export function PaperButton({ label, onPress, icon, disabled, busy, style, accessibilityLabel, accessibilityHint, small }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.btn, styles.paperBtn, small && styles.btnSmall, pressed && styles.pressed, off && styles.disabled, style]}
    >
      <View pointerEvents="none" style={[styles.edge, styles.paperBtnEdge]} />
      <View style={styles.btnInner}>
        {busy ? <ActivityIndicator color={ink} size="small" /> : icon ? <Glyph name={icon} size={small ? 18 : 20} /> : null}
        <Text style={[styles.paperBtnText, small && styles.paperBtnTextSmall]} numberOfLines={2}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** An underlined ink text link with a 44pt tap target. */
export function InkLink({ label, onPress, accessibilityLabel, style, center }: { label: string; onPress: () => void; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; center?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.link, center && styles.linkCenter, style]}
      hitSlop={4}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** A Chewy heading (never under 18px). */
export function Heading({ children, size = 24, style, numberOfLines }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text accessibilityRole="header" numberOfLines={numberOfLines} style={[styles.heading, { fontSize: Math.max(18, size), lineHeight: Math.round(Math.max(18, size) * 1.1) }, style]}>
      {children}
    </Text>
  );
}

/** A small Nunito 900 label, e.g. a section label on the sky. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

/** Calm paper slip with a colored spine for status / errors / success. */
export function Slip({ tone = 'info', children, icon, style, live }: { tone?: 'info' | 'ok' | 'error' | 'amber'; children: ReactNode; icon?: GlyphName; style?: StyleProp<ViewStyle>; live?: boolean }) {
  const spine = tone === 'ok' ? colors.success : tone === 'error' ? colors.danger : tone === 'amber' ? colors.amberSpine : ink;
  const glyph: GlyphName | undefined = icon ?? (tone === 'error' ? 'alert-circle' : tone === 'ok' ? 'check-circle' : undefined);
  return (
    <View
      style={[styles.slip, { borderLeftColor: spine }, tone === 'amber' && { backgroundColor: '#FFF1D6' }, style]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={live ? 'polite' : undefined}
    >
      {glyph && <Glyph name={glyph} size={20} color={tone === 'error' ? colors.danger : tone === 'ok' ? colors.success : ink} style={styles.slipIcon} />}
      <View style={styles.slipBody}>{typeof children === 'string' ? <Text style={styles.slipText}>{children}</Text> : children}</View>
    </View>
  );
}

/** Paper pill tag with an ink outline. dark = ink fill + paper text. */
export function Tag({ label, icon, dark, kraft, style }: { label: string; icon?: GlyphName; dark?: boolean; kraft?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tag, dark && styles.tagDark, kraft && styles.tagKraft, style]}>
      {icon && <Glyph name={icon} size={15} color={dark ? paper : ink} />}
      <Text style={[styles.tagText, dark && styles.tagTextDark]}>{label}</Text>
    </View>
  );
}

/** Round paper back button + Chewy screen title on the sky. */
export function BackHeader({ title, onBack, backLabel = 'Back', right }: { title: string; onBack: () => void; backLabel?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        hitSlop={4}
      >
        <Glyph name="chevron-left" size={28} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

/** Shared text styles for bodies on paper. */
export const type = StyleSheet.create({
  body: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: ink },
  soft: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: softInk },
  small: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: softInk },
  strong: { fontFamily: fonts.black, fontSize: 15, lineHeight: 21, color: ink },
  rose: { fontFamily: fonts.black, color: colors.rose },
});

/** Card shell styles, for components that need a plain StyleSheet object. */
export const card = StyleSheet.create({
  paper: {
    backgroundColor: paper,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: ink,
    shadowColor: ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 3,
  },
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  stripeV: { position: 'absolute', top: 0, bottom: 0, width: 26, backgroundColor: 'rgba(255,255,255,0.07)' },
  stripeH: { position: 'absolute', left: 0, right: 0, height: 26, backgroundColor: 'rgba(255,255,255,0.07)' },
  paper: { ...card.paper },
  paperPad: { paddingHorizontal: 18, paddingVertical: 18 },
  paperTaped: { marginTop: 14, paddingTop: 24 },
  tape: {
    position: 'absolute',
    top: -14,
    alignSelf: 'center',
    width: 96,
    height: 26,
    backgroundColor: '#E6CFA6',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#D9BC8C',
    opacity: 0.92,
    overflow: 'hidden',
    transform: [{ rotate: '-2deg' }],
    zIndex: 2,
  },
  tapeStripe: { position: 'absolute', top: -8, width: 8, height: 44, backgroundColor: '#D9BC8C', transform: [{ rotate: '45deg' }] },
  btn: {
    minHeight: 56,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: ink,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 13,
  },
  btnSmall: { minHeight: 46, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  pink: { backgroundColor: colors.primary },
  pinkEdge: { height: 6, backgroundColor: colors.primaryDark },
  pinkText: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: ink, textAlign: 'center', flexShrink: 1, letterSpacing: 0.3 },
  paperBtn: { backgroundColor: paper },
  paperBtnEdge: { height: 5, backgroundColor: paperEdge },
  paperBtnText: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21, color: ink, textAlign: 'center', flexShrink: 1 },
  paperBtnTextSmall: { fontSize: 15, lineHeight: 19 },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  disabled: { opacity: 0.55 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkCenter: { alignSelf: 'center' },
  linkText: { fontFamily: fonts.black, fontSize: 15, color: ink, textDecorationLine: 'underline' },
  heading: { fontFamily: fonts.display, color: ink, letterSpacing: 0.2 },
  label: { fontFamily: fonts.black, fontSize: 13, letterSpacing: 0.3, color: ink },
  slip: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: paper,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ink,
    borderLeftWidth: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  slipIcon: { marginTop: 1 },
  slipBody: { flex: 1, minWidth: 0 },
  slipText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: ink },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: paper,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 0,
  },
  tagDark: { backgroundColor: ink, shadowOpacity: 0 },
  tagKraft: { backgroundColor: colors.kraft, shadowOpacity: 0 },
  tagText: { fontFamily: fonts.black, fontSize: 14, color: ink },
  tagTextDark: { color: paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: ink,
    backgroundColor: paper,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 0,
  },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: ink },
});

/** Filled glyphs for the Dogtype trait poles (in place of their emoji). */
const POLE_GLYPHS: Record<string, GlyphName> = {
  Spark: 'lightning-bolt',
  Zen: 'meditation',
  Rowdy: 'star-four-points',
  Gentle: 'flower',
  Outgoing: 'emoticon-happy',
  Selective: 'shield',
  Bold: 'flag',
  Softie: 'cloud',
};
export function poleGlyph(label: string): GlyphName {
  return POLE_GLYPHS[label] ?? 'paw';
}

// Surrogate-pair ranges rather than \p{...}, which older Hermes builds reject.
const EMOJI_RE = /(?:[☀-➿⭐⭕]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])[️‍]*/g;
/** A label from shared data without its decorative emoji ("Playful 🎮" -> "Playful"). */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}
