// mobile/components/sticker/index.tsx
// "Sticker Book, grown up" building blocks shared by every screen of the
// iPhone app, mirroring web/components/StickerBits.tsx and the .btn-primary /
// .btn-secondary / .card / .chip classes in web/app/globals.css.
//
// Pure presentational, no state. The APIs are deliberately small; keep them
// stable because many screens import them.
//
//   import { PrimaryButton, SecondaryButton, PaperCard, PawCoin, PawIcon,
//            StickerDog, Tape, Tag, Chip, SkyBackground, StickerHeader,
//            Gingham } from '../components/sticker';

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';

const INK = colors.ink;
const PAPER = colors.paper;

// ---------------------------------------------------------------------------
// Icons and coins

/** Filled ink paw glyph (Discover, WOOF, the coin). */
export function PawIcon({ size = 20, color = INK }: { size?: number; color?: string }) {
  return <Ionicons name="paw" size={size} color={color} />;
}

/** The paper coin with an ink paw, tilted -8deg. Used in headers. */
export function PawCoin({ size = 34, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.coin,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      <PawIcon size={Math.round(size * 0.58)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The drawn sticker dog (stands in for any dog without a photo)

/**
 * A flat sticker dog face built from plain Views (no SVG dependency):
 * cream head, tan ears, a patch over one eye, white muzzle, ink outline.
 * `earColor` lets screens vary dogs; default is the web sticker dog.
 */
export function StickerDog({
  size = 80,
  earColor = '#C98A4E',
  patchColor = '#E7B987',
  label = 'A drawn sticker dog standing in for your dog',
  style,
}: {
  size?: number;
  earColor?: string;
  patchColor?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const u = size / 48; // drawing units (the web SVG viewBox is 48)
  const ow = Math.max(1.5, 2 * u); // outline width
  const head = { w: 30 * u, h: 28 * u, left: 9 * u, top: 12.5 * u };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[{ width: size, height: size }, style]}
    >
      {/* ears */}
      <View
        style={{
          position: 'absolute',
          left: 4.5 * u,
          top: 10.5 * u,
          width: 11 * u,
          height: 19 * u,
          borderRadius: 6 * u,
          backgroundColor: earColor,
          borderWidth: ow,
          borderColor: INK,
          transform: [{ rotate: '22deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 4.5 * u,
          top: 10.5 * u,
          width: 11 * u,
          height: 19 * u,
          borderRadius: 6 * u,
          backgroundColor: earColor,
          borderWidth: ow,
          borderColor: INK,
          transform: [{ rotate: '-22deg' }],
        }}
      />
      {/* head */}
      <View
        style={{
          position: 'absolute',
          left: head.left,
          top: head.top,
          width: head.w,
          height: head.h,
          borderRadius: head.w / 2,
          backgroundColor: '#FFF1D6',
          borderWidth: ow,
          borderColor: INK,
          overflow: 'hidden',
        }}
      >
        {/* patch over the right eye */}
        <View
          style={{
            position: 'absolute',
            left: 15 * u,
            top: 1 * u,
            width: 12 * u,
            height: 13 * u,
            borderRadius: 6.5 * u,
            backgroundColor: patchColor,
          }}
        />
        {/* muzzle */}
        <View
          style={{
            position: 'absolute',
            left: 6.5 * u,
            top: 13.5 * u,
            width: 15 * u,
            height: 12 * u,
            borderRadius: 7 * u,
            backgroundColor: '#FFFFFF',
          }}
        />
      </View>
      {/* eyes */}
      <View style={[styles.dot, { left: 16.2 * u, top: 22.5 * u, width: 4.2 * u, height: 4.2 * u, borderRadius: 2.1 * u }]} />
      <View style={[styles.dot, { left: 27.6 * u, top: 22.5 * u, width: 4.2 * u, height: 4.2 * u, borderRadius: 2.1 * u }]} />
      {/* nose */}
      <View
        style={[
          styles.dot,
          { left: 20.9 * u, top: 26.7 * u, width: 6.2 * u, height: 4.6 * u, borderRadius: 2.4 * u },
        ]}
      />
      {/* mouth */}
      <View
        style={{
          position: 'absolute',
          left: 21.2 * u,
          top: 30.6 * u,
          width: 5.6 * u,
          height: 3.6 * u,
          borderBottomLeftRadius: 3 * u,
          borderBottomRightRadius: 3 * u,
          borderWidth: Math.max(1, 1.4 * u),
          borderTopWidth: 0,
          borderColor: INK,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tape, tags, paper

/**
 * Kraft tape strip. Position it with `style` (absolute; top/left/right) and
 * let it hang 7-10px over a card's top edge. Never over text.
 */
export function Tape({
  width = 84,
  height = 22,
  angle = -4,
  style,
}: {
  width?: number;
  height?: number;
  angle?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const stripes = Math.ceil(width / 14) + 2;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          zIndex: 3,
          width,
          height,
          overflow: 'hidden',
          backgroundColor: 'rgba(230,207,166,0.94)',
          transform: [{ rotate: `${angle}deg` }],
        },
        style,
      ]}
    >
      {Array.from({ length: stripes }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: -height,
            left: i * 14 - 10,
            width: 7,
            height: height * 3,
            backgroundColor: 'rgba(217,188,140,0.94)',
            transform: [{ rotate: '25deg' }],
          }}
        />
      ))}
    </View>
  );
}

/** Small paper tag ("Sample card", "Free · 90 seconds"). */
export function Tag({
  label,
  tilt = -3,
  style,
  textStyle,
}: {
  label: string;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.tag, { transform: [{ rotate: `${tilt}deg` }] }, style]}>
      <Text style={[styles.tagText, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Paper card: 2px ink outline, radius 24, hard flat shadow. */
export function PaperCard({
  children,
  style,
  tilt,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tilt?: number;
}) {
  return (
    <View style={[styles.card, tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null, style]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Optional leading icon element (e.g. <PawIcon />). */
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

/**
 * THE pink action. Exactly one per screen. Ink text (Chewy), ink outline and
 * a hard darker pink bottom edge.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  accessibilityLabel,
  style,
  textStyle,
  testID,
}: ButtonProps) {
  const off = Boolean(disabled || loading);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.btnBase,
        styles.primary,
        pressed && !off ? styles.pressed : null,
        off ? styles.disabled : null,
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.edge, styles.primaryEdge]} />
      {loading ? (
        <ActivityIndicator color={INK} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={[styles.primaryText, textStyle]} numberOfLines={1} adjustsFontSizeToFit>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Every other pressable: paper, ink outline, hard cream-dark bottom edge. */
export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  accessibilityLabel,
  style,
  textStyle,
  testID,
}: ButtonProps) {
  const off = Boolean(disabled || loading);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.btnBase,
        styles.secondary,
        pressed && !off ? styles.pressed : null,
        off ? styles.disabled : null,
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.edge, styles.secondaryEdge]} />
      {loading ? (
        <ActivityIndicator color={INK} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={[styles.secondaryText, textStyle]} numberOfLines={1} adjustsFontSizeToFit>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Paper chip; selected = ink fill with paper text. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  disabled,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected, disabled: Boolean(disabled) } : undefined}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipOn : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Page

/**
 * Quiet gingham over the sky (white 9%, 44px squares). Absolute-fill; put it
 * first inside a sky-coloured container. Purely decorative.
 */
export function Gingham({ columns = 12, rows = 26 }: { columns?: number; rows?: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Clip the stripes to the parent: 12 columns are wider than a phone, and
      // without this they widened the page (horizontal scroll on web).
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <View key={`c${i}`} style={[styles.ginghamCol, { left: i * 44 }]} />
      ))}
      {Array.from({ length: rows }).map((_, i) => (
        <View key={`r${i}`} style={[styles.ginghamRow, { top: i * 44 }]} />
      ))}
    </View>
  );
}

/** Sky page background (with optional gingham) filling its parent. */
export function SkyBackground({ gingham = true }: { gingham?: boolean }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.sky, overflow: 'hidden' }]}>
      {gingham ? <Gingham /> : null}
    </View>
  );
}

/** In-app header: paw coin + one Chewy title on the sky; optional right slot. */
export function StickerHeader({
  title,
  right,
  style,
  large,
  leading,
}: {
  title: string;
  /** Replaces the paw coin, e.g. the logo on the home tab. */
  leading?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tab-page title size (Pack Days, Playroom, Pupfile); the default stays compact for Discover's deck. */
  large?: boolean;
}) {
  return (
    <View style={[styles.header, style]}>
      {leading ?? <PawCoin size={large ? 34 : 28} />}
      <Text style={[styles.headerTitle, large && styles.headerTitleLarge]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    backgroundColor: PAPER,
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    shadowColor: INK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 0,
    elevation: 3,
  },
  dot: { position: 'absolute', backgroundColor: INK },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: PAPER,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingTop: 2,
    paddingBottom: 3,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 0,
    elevation: 2,
  },
  tagText: { fontFamily: fonts.black, fontSize: 12.5, color: INK },
  card: {
    backgroundColor: PAPER,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: INK,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 4,
  },
  btnBase: {
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: INK,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 13,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  primary: { backgroundColor: colors.primary, minHeight: 58 },
  primaryEdge: { height: 6, backgroundColor: colors.primaryDark },
  primaryText: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 30,
    color: INK,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  secondary: { backgroundColor: PAPER, paddingBottom: 12 },
  secondaryEdge: { height: 5, backgroundColor: colors.border },
  secondaryText: {
    fontFamily: fonts.black,
    fontSize: 16,
    lineHeight: 22,
    color: INK,
    textAlign: 'center',
  },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  disabled: { opacity: 0.5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PAPER,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 36,
  },
  chipOn: { backgroundColor: INK },
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: INK },
  chipTextOn: { color: PAPER },
  ginghamCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 22,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  ginghamRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: INK,
  },
  headerTitleLarge: { fontSize: 30, lineHeight: 34 },
  headerRight: { marginLeft: 'auto' },
});
