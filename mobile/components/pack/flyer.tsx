// mobile/components/pack/flyer.tsx
// Presentational pieces of the Pack Day flyer, mirroring
// web/components/PackDayFlyer.tsx: the format tag, the when / where / host
// rows with filled icons, the going-count tokens (filled paw = taken, open
// ring = free) and the calm house-rules slip. The tokens show HOW MANY dogs
// are going, never who.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { PACK_DAY_FORMATS, PACK_DAY_RULES, formatPackDayWhen, goingSummary } from '../../../shared/packDay';
import type { PackDay } from '../../../shared/packDay';
import { Glyph, Tag, ink, paper, softInk } from './kit';

export function FormatTag({ format, official, cancelled }: { format: PackDay['format']; official?: boolean; cancelled?: boolean }) {
  const f = PACK_DAY_FORMATS[format] ?? PACK_DAY_FORMATS['pack-walk'];
  return (
    <View style={styles.tagRow}>
      <Tag icon="tree" label={f.label} />
      {official && <Tag kraft label="Official Pack Day" />}
      {cancelled && <Tag label="Cancelled" style={{ backgroundColor: colors.creamDark, shadowOpacity: 0 }} />}
    </View>
  );
}

type FlyerFactsEvent = Pick<
  PackDay,
  'format' | 'official' | 'title' | 'localDate' | 'localTime' | 'durationMinutes' | 'placeName' | 'city' | 'state' | 'note' | 'hostDogName' | 'status'
>;

/** Tag, Chewy title, blurb, note, then when / where (+ Map) / host rows. */
export function FlyerFacts({ event, onMap }: { event: FlyerFactsEvent; onMap?: () => void }) {
  const cancelled = event.status === 'cancelled';
  const format = PACK_DAY_FORMATS[event.format] ?? PACK_DAY_FORMATS['pack-walk'];
  return (
    <View>
      <FormatTag format={event.format} official={event.official} cancelled={cancelled} />
      <Text accessibilityRole="header" style={[styles.title, cancelled && styles.titleCancelled]}>{event.title}</Text>
      <Text style={styles.blurb}>{format.blurb}</Text>
      {!!event.note && <Text style={styles.note}>“{event.note}”</Text>}

      <View style={styles.facts}>
        <View style={styles.factRow} accessible accessibilityLabel={`When: ${formatPackDayWhen(event)}, ${event.durationMinutes} minutes`}>
          <Glyph name="calendar-month" size={24} />
          <Text style={styles.factText}>{formatPackDayWhen(event)} · {event.durationMinutes} min</Text>
        </View>
        <View style={styles.factRow}>
          <Glyph name="map-marker" size={24} />
          <Text style={[styles.factText, styles.factFlex]} accessibilityLabel={`Where: ${event.placeName}, ${event.city}`}>
            {event.placeName}, {event.city}{event.state ? `, ${event.state}` : ''}
          </Text>
          {onMap && (
            <Pressable onPress={onMap} accessibilityRole="link" accessibilityLabel="Open in Maps" style={styles.mapLink} hitSlop={4}>
              <Text style={styles.mapText}>Map</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.factRow}>
          <View style={styles.hostDot}>
            <Glyph name="paw" size={20} />
          </View>
          <Text style={[styles.hostText, styles.factFlex]}>Hosted by {event.hostDogName || 'a neighbor'}’s human</Text>
        </View>
      </View>
    </View>
  );
}

/** "5 of 8 dogs going" plus one token per spot. size 'sm' is the list-card version. */
export function GoingTokens({ capacity, count, status, size = 'lg' }: { capacity: number; count: number; status: PackDay['status']; size?: 'sm' | 'lg' }) {
  if (status === 'cancelled') {
    return <Text style={size === 'lg' ? styles.goingLg : styles.goingSm}>Cancelled</Text>;
  }
  const total = Math.max(0, capacity);
  const filled = Math.min(count, total);
  const d = size === 'lg' ? 30 : 16;
  return (
    <View style={size === 'lg' ? styles.goingWrapLg : styles.goingWrapSm}>
      {size === 'lg' && <Text style={styles.goingLg}>{goingSummary({ capacity, status, attendeeCount: count })}</Text>}
      <View style={[styles.tokens, size === 'sm' && styles.tokensSm]} accessible={false} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.token, { width: d, height: d, borderRadius: d / 2 }, i < filled ? styles.tokenOn : styles.tokenOff]}
          >
            {i < filled && size === 'lg' && <Glyph name="paw" size={15} color={paper} />}
          </View>
        ))}
      </View>
      {size === 'sm' && <Text style={styles.goingSm}>{goingSummary({ capacity, status, attendeeCount: count })}</Text>}
    </View>
  );
}

/** The calm house-rules slip. */
export function RulesSlip() {
  return (
    <View style={styles.rules} accessibilityLabel="House rules">
      <Text style={styles.rulesHeading}>House rules</Text>
      {PACK_DAY_RULES.map((rule) => (
        <View key={rule} style={styles.ruleRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.ruleText}>{rule}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: ink, marginTop: 12 },
  titleCancelled: { color: softInk, textDecorationLine: 'line-through' },
  blurb: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: softInk, marginTop: 6 },
  note: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: ink, marginTop: 8 },
  facts: { marginTop: 18, gap: 14 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factText: { fontFamily: fonts.black, fontSize: 16, lineHeight: 22, color: ink, flexShrink: 1 },
  factFlex: { flex: 1 },
  mapLink: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', marginVertical: -10 },
  mapText: { fontFamily: fonts.black, fontSize: 16, color: ink, textDecorationLine: 'underline' },
  hostDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: ink,
    backgroundColor: colors.note,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    marginRight: -4,
  },
  hostText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: ink },
  goingWrapLg: { marginTop: 18 },
  goingWrapSm: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  goingLg: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: ink },
  goingSm: { fontFamily: fonts.black, fontSize: 14, color: ink },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  tokensSm: { gap: 4, marginTop: 0 },
  token: { borderWidth: 2, borderColor: ink, alignItems: 'center', justifyContent: 'center' },
  tokenOn: { backgroundColor: ink },
  tokenOff: { backgroundColor: paper },
  rules: {
    backgroundColor: colors.creamDark,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  rulesHeading: { fontFamily: fonts.black, fontSize: 14, color: softInk, marginBottom: 2 },
  ruleRow: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: fonts.black, fontSize: 15, lineHeight: 21, color: ink },
  ruleText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: ink },
});
