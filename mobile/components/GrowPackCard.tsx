// mobile/components/GrowPackCard.tsx
// "Grow Kaju's pack": under a short Matches list, the next real steps to more
// matches. Every line is built from real data (dogs not yet seen, the next
// Pack Day in town) or a real action (invite, Dogtype collection); a line with
// nothing true to say is left out. Mirrors web/components/GrowPackCard.tsx.

import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../constants/theme';
import { fetchDiscoverFeed, loadDiscoverRadius } from '../lib/discover';
import { listUpcomingPackDays } from '../lib/packDay';
import { formatPackDayWhen, type PackDay } from '../../shared/packDay';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';

/** Below this many matches the card shows; past it the list is busy enough. */
export const GROW_PACK_BELOW = 5;

interface Row {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}

export default function GrowPackCard({ uid, profile }: { uid: string; profile: SavedDogProfile | null }) {
  const name = profile?.name?.trim() || 'your dog';
  const city = profile?.city?.trim() || '';
  const [feed, setFeed] = useState<{ unseen: number; beyond: number; radius: number } | null>(null);
  const [packDay, setPackDay] = useState<PackDay | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const radiusMiles = await loadDiscoverRadius();
        const result = await fetchDiscoverFeed(uid, { radiusMiles });
        if (active) setFeed({ unseen: result.dogs.length, beyond: result.radiusApplied ? result.beyondRadiusCount : 0, radius: radiusMiles });
      } catch {
        if (active) setFeed(null); // the swipe line just stays out
      }
    })();
    listUpcomingPackDays()
      .then((list) => {
        if (!active) return;
        const here = city.toLowerCase();
        setPackDay(list.find((e) => !here || e.city.trim().toLowerCase() === here) ?? null);
      })
      .catch(() => { if (active) setPackDay(null); });
    return () => { active = false; };
  }, [uid, city]);

  const go = (target: string, href: string) => () => {
    trackEvent('grow_pack_click', { target });
    router.push(href as never);
  };

  const rows: Row[] = [];
  if (feed && feed.unseen > 0) {
    rows.push({
      key: 'swipe', icon: 'paw', title: 'Keep swiping',
      body: `${feed.unseen} ${feed.unseen === 1 ? 'dog' : 'dogs'} near you that you haven’t seen yet.`,
      onPress: go('swipe', '/(tabs)/discover'),
    });
  } else if (feed && feed.beyond > 0) {
    rows.push({
      key: 'widen', icon: 'compass', title: 'Look a little farther',
      body: `You’ve seen everyone within ${feed.radius} mi. ${feed.beyond} more ${feed.beyond === 1 ? 'dog is' : 'dogs are'} just past that.`,
      onPress: go('widen', '/(tabs)/discover'),
    });
  }
  rows.push({
    key: 'invite', icon: 'export-variant', title: 'Invite a friend',
    body: `Know a dog ${name} gets along with? Invite their human.`,
    onPress: () => {
      trackEvent('grow_pack_click', { target: 'invite' });
      Share.share({ message: `${name} is on GoDoggyDate, playdates for dogs nearby. Come find us: https://godoggydate.com` }).catch(() => {});
    },
  });
  if (packDay) {
    rows.push({
      key: 'packday', icon: 'tree', title: 'Meet dogs at a Pack Day',
      body: `${packDay.title} · ${formatPackDayWhen(packDay)}`,
      onPress: go('packday', `/pack/${packDay.id}`),
    });
  } else if (packDay === null) {
    rows.push({
      key: 'host', icon: 'tree', title: 'Meet dogs at a Pack Day',
      body: city ? `Host the first one in ${city}. Six dogs is plenty.` : 'Host one at your usual park. Six dogs is plenty.',
      onPress: go('host', '/(tabs)/pack'),
    });
  }
  rows.push({
    key: 'dogtypes', icon: 'creation', title: 'Collect Dogtypes',
    body: 'Every match reveals their Dogtype. See how many you’ve found.',
    onPress: go('dogtypes', '/(tabs)/profile'),
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">Grow {name}&apos;s pack</Text>
      {rows.map((row) => (
        <Pressable
          key={row.key}
          onPress={row.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.icon}><MaterialCommunityIcons name={row.icon} size={22} color={colors.ink} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={styles.rowBody}>{row.body}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.ink} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 16,
    gap: 4,
    marginTop: 8,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.note, alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  rowBody: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
});
