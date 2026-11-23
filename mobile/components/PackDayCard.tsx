// mobile/components/PackDayCard.tsx
// One Pack Day in a list: what it is, when, where, and how full it is.
// Mirrors web/components/PackDayCard.tsx: a paper card with the format tag,
// a Chewy title, and going-count tokens (how many, never who).

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { formatPackDayWhen } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';
import { FormatTag, GoingTokens } from './pack/flyer';
import { Glyph, card, ink, paper, softInk } from './pack/kit';

interface Props {
  event: PackDay;
  /** The signed-in member is hosting or already signed up. */
  badge?: 'hosting' | 'going';
}

export default function PackDayCard({ event, badge }: Props) {
  const when = formatPackDayWhen(event);
  const cancelled = event.status === 'cancelled';
  const going = event.attendeeUids.length;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push({ pathname: '/pack/[id]', params: { id: event.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${when}, ${event.placeName}. ${cancelled ? 'Cancelled' : `${going} of ${event.capacity} dogs going`}.`}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <FormatTag format={event.format} official={event.official} />
        </View>
        {cancelled ? (
          <View style={[styles.badge, styles.badgeMuted]}>
            <Text style={[styles.badgeText, styles.badgeTextMuted]}>Cancelled</Text>
          </View>
        ) : badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge === 'hosting' ? 'Hosting' : 'You’re going'}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.title, cancelled && styles.titleCancelled]}>{event.title}</Text>
      <View style={styles.row}>
        <Glyph name="calendar-month" size={18} />
        <Text style={styles.when}>{when}</Text>
      </View>
      <View style={styles.row}>
        <Glyph name="map-marker" size={18} />
        <Text style={styles.place} numberOfLines={1}>
          {event.placeName} · {event.city}
        </Text>
      </View>
      <GoingTokens size="sm" capacity={event.capacity} count={going} status={event.status} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...card.paper,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
  },
  cardPressed: { transform: [{ translateY: 1 }], opacity: 0.94 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 29, color: ink, marginTop: 10, marginBottom: 6 },
  titleCancelled: { color: softInk, textDecorationLine: 'line-through' },
  badge: {
    backgroundColor: ink,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeMuted: { backgroundColor: colors.creamDark },
  badgeText: { fontFamily: fonts.black, fontSize: 12, color: paper },
  badgeTextMuted: { color: ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  when: { fontFamily: fonts.black, fontSize: 16, color: ink, flexShrink: 1 },
  place: { fontFamily: fonts.bold, fontSize: 15, color: softInk, flexShrink: 1 },
});
