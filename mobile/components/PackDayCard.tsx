// mobile/components/PackDayCard.tsx
// One Pack Day in a list: what it is, when, where, and how full it is.
// Mirrors web/components/PackDayCard.tsx.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, radius } from '../constants/theme';
import { PACK_DAY_FORMATS, formatPackDayWhen, spotsLeft } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';

interface Props {
  event: PackDay;
  /** The signed-in member is hosting or already signed up. */
  badge?: 'hosting' | 'going';
}

export default function PackDayCard({ event, badge }: Props) {
  const format = PACK_DAY_FORMATS[event.format] ?? PACK_DAY_FORMATS['pack-walk'];
  const left = spotsLeft(event);
  const when = formatPackDayWhen(event);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push({ pathname: '/pack/[id]', params: { id: event.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${when}, ${event.placeName}. ${event.attendeeUids.length} of ${event.capacity} dogs going.`}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>
            {event.official ? '⭐ Official · ' : ''}{format.emoji} {format.label}
          </Text>
          <Text style={styles.title}>{event.title}</Text>
        </View>
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge === 'hosting' ? 'Hosting' : 'You’re going'}</Text>
          </View>
        )}
      </View>
      <Text style={styles.when}>{when}</Text>
      <Text style={styles.place} numberOfLines={1}>
        {event.placeName} · {event.city}
      </Text>
      <Text style={[styles.count, left === 0 && styles.countFull]}>
        {event.attendeeUids.length} of {event.capacity} dogs going{left === 0 ? ' · Full' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: { opacity: 0.75 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleWrap: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, color: colors.brown, marginTop: 2 },
  badge: {
    backgroundColor: `${colors.primary}1A`, // ~10% opacity
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primary },
  when: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown, marginTop: 8 },
  place: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, marginTop: 1 },
  count: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brownMid, marginTop: 8 },
  countFull: { color: colors.brownLight },
});
