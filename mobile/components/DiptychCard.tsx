// mobile/components/DiptychCard.tsx
// The DAY 1 vs DAY N diptych — a "then vs now" share card for National Dog Day.
// Mirrors web/components/DiptychCard.tsx. Two REAL photos from the owner's own
// profile sit side by side (earliest on the left, latest on the right) with a
// big, honest day-count between them. Works at N=1: it reads nothing but the
// owner's own photos and a date they confirm.
//
// HONEST by construction: the number is labelled "days since your earliest
// photo" — it is (today − the earliest date the owner entered), never a birth,
// age, or "days alive" claim. Wrapped in forwardRef<View> so
// react-native-view-shot can capture it as a PNG (same path as DogtypeCard /
// PetTwinCard), with the brand + godoggydate.com URL baked INSIDE the captured
// region so a reposted screenshot still carries the back-link.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../constants/theme';

interface Props {
  dogName: string;
  /** Earliest ("Day 1") photo URL. */
  earliestUrl?: string;
  /** Latest ("Day N") photo URL. */
  latestUrl?: string;
  /** Whole days since the earliest photo — the honest count shown in the middle. */
  days: number;
  /** Human-readable earliest date, e.g. "Mar 2022" — printed under Day 1. */
  earliestLabel?: string;
}

function Panel({ url, label, sub }: { url?: string; label: string; sub?: string }) {
  return (
    <View style={styles.panel}>
      <View style={styles.frame}>
        {/* Emoji sits underneath the photo so a remote image that hasn't
            decoded at capture time still shows a meaningful avatar. */}
        <Text style={styles.frameEmoji}>🐶</Text>
        {url ? <Image source={{ uri: url }} style={[StyleSheet.absoluteFill, styles.framePhoto]} /> : null}
      </View>
      <Text style={styles.panelLabel}>{label}</Text>
      {sub ? <Text style={styles.panelSub}>{sub}</Text> : null}
    </View>
  );
}

const DiptychCard = forwardRef<View, Props>(function DiptychCard(
  { dogName, earliestUrl, latestUrl, days, earliestLabel },
  ref,
) {
  const safeDays = Math.max(0, Math.floor(days));
  const dayN = safeDays.toLocaleString();

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={[colors.cream, '#F7EADB', '#F1DFC9']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Text style={styles.eyebrow}>National Dog Day 🐾</Text>
      <Text style={styles.title}>Day 1 → Day {dayN}</Text>

      {/* The two real photos, then vs now. */}
      <View style={styles.row}>
        <Panel url={earliestUrl} label="Day 1" sub={earliestLabel} />
        <Text style={styles.arrow}>→</Text>
        <Panel url={latestUrl} label={`Day ${dayN}`} sub="today" />
      </View>

      {/* The honest count. */}
      <View style={styles.countBlock}>
        <Text style={styles.countNumber}>{dayN}</Text>
        <Text style={styles.countLabel}>days you&apos;ve known this face</Text>
        <Text style={styles.countSub}>since your earliest photo of {dogName}</Text>
      </View>

      {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
      <View style={styles.brandRow}>
        <Text style={styles.brandName}>GoDoggyDate</Text>
        <Text style={styles.brandUrl}>godoggydate.com</Text>
      </View>
    </View>
  );
});

DiptychCard.displayName = 'DiptychCard';
export default DiptychCard;

const CARD_WIDTH = 340;
const PANEL = 132;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    textAlign: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    marginTop: 4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  panel: { width: PANEL, alignItems: 'center' },
  frame: {
    width: PANEL,
    height: PANEL,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: '#E7D3BE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameEmoji: { fontSize: 56, lineHeight: 60 },
  framePhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  panelLabel: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 8 },
  panelSub: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 1 },
  arrow: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brownLight,
    marginTop: 48,
  },
  countBlock: { alignItems: 'center', marginTop: 18, width: '100%' },
  countNumber: { fontFamily: fonts.display, fontSize: 60, color: colors.primary, lineHeight: 64 },
  countLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brown,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginTop: 4,
    textAlign: 'center',
  },
  countSub: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 3, textAlign: 'center' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  brandName: { fontFamily: fonts.display, fontSize: 13, color: colors.brown },
  brandUrl: { fontFamily: fonts.body, fontSize: 10, color: colors.brownMid },
});
