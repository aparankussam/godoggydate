// mobile/app/(tabs)/pack.tsx
// Pack Days — open group playdates at a public place. Mirrors
// web/app/app/pack/page.tsx: your events first, then what's coming up in your
// city, then other cities. A swipe deck needs a crowd; one meetup needs about
// six dogs, so this is how a small community gets its first real playdates.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { listUpcomingPackDays } from '../../lib/packDay';
import { getBlockedUserIds } from '../../lib/blocks';
import { trackEvent } from '../../lib/analytics';
import PackDayCard from '../../components/PackDayCard';
import type { PackDay } from '../../../shared/packDay';

export default function PackDaysTab() {
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();
  const [events, setEvents] = useState<PackDay[] | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (user) trackEvent('packday_list_open', {});
    }, [user]),
  );

  // Reload on every focus (and pull to refresh), so an event you just hosted,
  // joined or left shows up correctly when you come back from it.
  useFocusEffect(
    useCallback(() => {
      if (!user) return undefined;
      let active = true;
      setError(null);
      Promise.all([listUpcomingPackDays(), getBlockedUserIds(user.uid)])
        .then(([list, blockedIds]) => {
          if (!active) return;
          setEvents(list);
          setBlocked(blockedIds);
        })
        .catch((err) => {
          console.warn('Failed to load Pack Days:', err);
          if (active) setError('We couldn’t load Pack Days. Check your connection and try again.');
        })
        .finally(() => {
          if (active) setRefreshing(false);
        });
      return () => {
        active = false;
      };
    }, [user, reloadToken]),
  );

  const { mine, nearby, elsewhere } = useMemo(() => {
    const uid = user?.uid ?? '';
    const visible = (events ?? []).filter((e) => !blocked.has(e.hostUid));
    const city = profile?.city?.trim().toLowerCase();
    const isMine = (e: PackDay) => e.hostUid === uid || e.attendeeUids.includes(uid);
    return {
      mine: visible.filter(isMine),
      nearby: visible.filter((e) => !isMine(e) && (!city || e.city.trim().toLowerCase() === city)),
      elsewhere: visible.filter((e) => !isMine(e) && !!city && e.city.trim().toLowerCase() !== city),
    };
  }, [events, blocked, user, profile]);

  function handleRefresh() {
    setRefreshing(true);
    setReloadToken((t) => t + 1);
  }

  function handleHost() {
    router.push('/pack/new');
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.gateEmoji}>🌳</Text>
        <Text style={styles.gateTitle}>Sign in to find a Pack Day</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace('/welcome')}>
          <Text style={styles.primaryBtnText}>Sign in or sign up</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const canHost = profileComplete;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>🌳 Pack Days</Text>
          {canHost && (
            <Pressable
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
              onPress={handleHost}
              accessibilityRole="button"
            >
              <Text style={styles.headerBtnText}>Start a Pack Day</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.subtitle}>
          Open group playdates at a public place. Show up with your dog, meet the neighbors, and find the
          dogs yours actually clicks with. Free to join.
        </Text>

        {!canHost && events && (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Add your dog to join in</Text>
            <Text style={styles.setupBody}>Finish your dog’s profile to RSVP or host a Pack Day.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/profile')}>
              <Text style={styles.primaryBtnText}>Set up my dog</Text>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => setReloadToken((t) => t + 1)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!events && !error && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {mine.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Yours</Text>
            {mine.map((e) => (
              <PackDayCard key={e.id} event={e} badge={e.hostUid === user.uid ? 'hosting' : 'going'} />
            ))}
          </View>
        )}

        {events && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {profile?.city ? `Coming up in ${profile.city}` : 'Coming up'}
            </Text>
            {nearby.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🦮</Text>
                <Text style={styles.emptyTitle}>Nothing on the calendar yet</Text>
                <Text style={styles.emptyBody}>
                  Pick your usual park and a Saturday morning, and host the first one. Six dogs is a great
                  Pack Day.
                </Text>
                {canHost && (
                  <Pressable style={[styles.primaryBtn, styles.emptyBtn]} onPress={handleHost}>
                    <Text style={styles.primaryBtnText}>Host a Pack Day</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              nearby.map((e) => <PackDayCard key={e.id} event={e} />)
            )}
          </View>
        )}

        {elsewhere.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Other cities</Text>
            {elsewhere.map((e) => <PackDayCard key={e.id} event={e} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  center: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.brown, flexShrink: 1 },
  headerBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  pressed: { opacity: 0.75 },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownMid,
    marginTop: 6,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  setupCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 18,
  },
  setupTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.brown, textAlign: 'center' },
  setupBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownMid,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 18,
    alignItems: 'flex-start',
    gap: 10,
  },
  errorText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#B91C1C' },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  retryBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  loadingBox: { paddingVertical: 64, alignItems: 'center' },
  section: { marginBottom: 18 },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.brown, marginTop: 8, textAlign: 'center' },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownMid,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyBtn: { marginTop: 16 },
  gateEmoji: { fontSize: 56, marginBottom: 12 },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
});
