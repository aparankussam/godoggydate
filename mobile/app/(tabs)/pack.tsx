// mobile/app/(tabs)/pack.tsx
// Pack Days — open group playdates at a public place. Mirrors
// web/app/app/pack/page.tsx: your events first, then what's coming up in your
// city, then other cities. A swipe deck needs a crowd; one meetup needs about
// six dogs, so this is how a small community gets its first real playdates.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { Gingham, Glyph, Heading, Paper, PaperButton, PinkButton, Slip, type } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { listUpcomingPackDays } from '../../lib/packDay';
import { getBlockedUserIds } from '../../lib/blocks';
import { trackEvent } from '../../lib/analytics';
import PackDayCard from '../../components/PackDayCard';
import CityFeed from '../../components/CityFeed';
import type { PackDay } from '../../../shared/packDay';

export default function PackDaysTab() {
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();
  const [events, setEvents] = useState<PackDay[] | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [view, setView] = useState<'feed' | 'days'>('feed');

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
        <Gingham />
        <ActivityIndicator color={colors.ink} size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center}>
        <Gingham />
        <View style={styles.gateIcon}><Glyph name="tree" size={40} /></View>
        <Heading size={26} style={styles.gateTitle}>Sign in to find a Pack Day</Heading>
        <PinkButton label="Sign in or sign up" onPress={() => router.replace('/welcome')} style={styles.gateBtn} />
      </SafeAreaView>
    );
  }

  const canHost = profileComplete;
  const anyEvents = mine.length + nearby.length + elsewhere.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ink} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={styles.titleBadge}><Glyph name="tree" size={18} /></View>
            <Text style={styles.title} accessibilityRole="header">{view === 'feed' ? 'City feed' : 'Pack Days'}</Text>
          </View>
          {canHost && anyEvents && (
            <PaperButton small label="Host one" icon="plus" onPress={handleHost} accessibilityLabel="Host a Pack Day" />
          )}
        </View>
        <Text style={styles.subtitle}>
          Open group playdates at a public place. Show up with your dog, meet the neighbors, and find the
          dogs yours actually clicks with. Free to join.
        </Text>

        <View style={styles.switchRow}>
          <PaperButton small label="City feed" icon="home-group" onPress={() => setView('feed')} accessibilityLabel="Show the city feed" />
          <PaperButton small label="Pack Days" icon="tree" onPress={() => setView('days')} accessibilityLabel="Show Pack Days" />
        </View>

        {view === 'feed' && (
          <CityFeed uid={user.uid} city={profile?.city?.trim()} canPost={canHost} blocked={blocked} reloadToken={reloadToken} />
        )}

        {view === 'days' && !canHost && events && (
          <Paper style={styles.setupCard}>
            <Heading size={24} style={styles.centerText}>Add your dog to join in</Heading>
            <Text style={[type.soft, styles.centerText, styles.setupBody]}>Finish your dog’s profile to RSVP or host a Pack Day.</Text>
            <PinkButton label="Set up my dog" onPress={() => router.push('/(tabs)/profile')} />
          </Paper>
        )}

        {view === 'days' && (<>
        {error && (
          <Slip tone="error" style={styles.block}>
            <Text style={type.body}>{error}</Text>
            <PaperButton small label="Retry" icon="refresh" onPress={() => setReloadToken((t) => t + 1)} style={styles.retryBtn} />
          </Slip>
        )}

        {!events && !error && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.ink} size="large" />
          </View>
        )}

        {mine.length > 0 && (
          <View style={styles.section}>
            <Heading size={22} style={styles.sectionLabel}>Yours</Heading>
            {mine.map((e) => (
              <PackDayCard key={e.id} event={e} badge={e.hostUid === user.uid ? 'hosting' : 'going'} />
            ))}
          </View>
        )}

        {events && (
          <View style={styles.section}>
            <Heading size={22} style={styles.sectionLabel}>
              {profile?.city ? `Coming up in ${profile.city}` : 'Coming up'}
            </Heading>
            {nearby.length === 0 ? (
              <Paper style={styles.emptyCard}>
                <Glyph name="tree" size={40} />
                <Heading size={24} style={[styles.centerText, styles.emptyTitle]}>
                  {profile?.city ? `Be the first to host a Pack Day in ${profile.city}` : 'Nothing on the calendar yet'}
                </Heading>
                <Text style={[type.soft, styles.centerText]}>
                  Pick your usual park and a Saturday morning, and host the first one. Six dogs is a great
                  Pack Day.{elsewhere.length > 0 ? ' Pack Days in nearby cities are below.' : ''}
                </Text>
                {canHost && <PinkButton label="Host a Pack Day" icon="tree" onPress={handleHost} style={styles.emptyBtn} />}
              </Paper>
            ) : (
              nearby.map((e) => <PackDayCard key={e.id} event={e} />)
            )}
          </View>
        )}

        {elsewhere.length > 0 && (
          <View style={styles.section}>
            <Heading size={22} style={styles.sectionLabel}>{nearby.length === 0 ? 'Upcoming in nearby cities' : 'Other cities'}</Heading>
            {elsewhere.map((e) => <PackDayCard key={e.id} event={e} />)}
          </View>
        )}
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  center: {
    flex: 1,
    backgroundColor: colors.sky,
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
    minHeight: 52,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  titleBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.ink, flexShrink: 1 },
  subtitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
    marginTop: 6,
    marginBottom: 20,
  },
  centerText: { textAlign: 'center' },
  setupCard: { alignItems: 'stretch', marginBottom: 22, gap: 4 },
  setupBody: { marginBottom: 12 },
  block: { marginBottom: 20 },
  retryBtn: { alignSelf: 'flex-start', marginTop: 10 },
  switchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  loadingBox: { paddingVertical: 64, alignItems: 'center' },
  section: { marginBottom: 14 },
  sectionLabel: { marginBottom: 12 },
  emptyCard: { alignItems: 'center', gap: 6 },
  emptyTitle: { marginTop: 4 },
  emptyBtn: { marginTop: 12, alignSelf: 'stretch' },
  gateIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  gateTitle: { textAlign: 'center', marginBottom: 18 },
  gateBtn: { alignSelf: 'stretch' },
});
