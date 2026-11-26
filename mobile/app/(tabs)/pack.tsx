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
import { colors, fonts } from '../../constants/theme';
import { Gingham, Glyph, type GlyphName, Heading, Paper, PaperButton, PinkButton, Slip, type } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { listUpcomingPackDays } from '../../lib/packDay';
import { listPackGroups } from '../../lib/packGroup';
import { getBlockedUserIds } from '../../lib/blocks';
import { trackEvent } from '../../lib/analytics';
import PackDayCard from '../../components/PackDayCard';
import CityFeed from '../../components/CityFeed';
import WhereWeGoSection from '../../components/WhereWeGoSection';
import type { PackDay } from '../../../shared/packDay';
import { packGroupScheduleLabel, type PackGroup } from '../../../shared/packGroup';
import LostDogButton from '../../components/LostDogButton';

const VIEWS: { id: 'days' | 'feed' | 'spots'; label: string; blurb: string }[] = [
  { id: 'days', label: 'Pack Days', blurb: 'Open group playdates at a public place. Show up with your dog, meet the neighbors, and find the dogs yours actually clicks with. Free to join.' },
  { id: 'feed', label: 'Neighbarkhood', blurb: 'Barks from dog people nearby: ask the Pack, give something away, find a walk buddy.' },
  { id: 'spots', label: 'Sniff Spots', blurb: 'The vets, groomers and parks your Pack uses. Tag yours; no reviews, just a count.' },
];

// Why hosting is worth the one tap — under the empty "Host the first one" card.
const HOST_BENEFITS: { icon: GlyphName; text: string }[] = [
  { icon: 'check-circle-outline', text: 'Free to host' },
  { icon: 'calendar-outline', text: 'Pick a park and a time' },
  { icon: 'bell-outline', text: 'We tell nearby dog owners for you' },
];

// While Pack Days is quiet, two ways in to the other tabs on this screen.
const nudgeRows = (city?: string): { icon: GlyphName; title: string; view: 'feed' | 'spots' }[] => [
  { icon: 'chat-outline', title: 'Say hi in the Neighbarkhood', view: 'feed' },
  { icon: 'map-marker-outline', title: city ? `See where other dogs in ${city} go` : 'See where other dogs go', view: 'spots' },
];

export default function PackDaysTab() {
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();
  const [events, setEvents] = useState<PackDay[] | null>(null);
  const [groups, setGroups] = useState<{ mine: PackGroup[]; discover: PackGroup[] }>({ mine: [], discover: [] });
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [view, setView] = useState<'days' | 'feed' | 'spots'>('days');

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
      Promise.all([
        listUpcomingPackDays(),
        getBlockedUserIds(user.uid),
        // Groups are a bonus on this screen: if they can't load, the list still shows.
        listPackGroups(user.uid).catch(() => ({ mine: [], discover: [] })),
      ])
        .then(([list, blockedIds, loadedGroups]) => {
          if (!active) return;
          setEvents(list);
          setBlocked(blockedIds);
          setGroups(loadedGroups);
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

  const city = profile?.city?.trim().toLowerCase();
  const nearbyGroups = groups.discover.filter((g) => !blocked.has(g.hostUid) && (!city || g.city.trim().toLowerCase() === city));

  function openGroup(id: string) {
    router.push({ pathname: '/pack/group/[id]', params: { id } });
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
            <Text style={styles.title} accessibilityRole="header">{VIEWS.find((v) => v.id === view)?.label}</Text>
          </View>
          {canHost && anyEvents && (
            <PaperButton small label="Host one" icon="plus" onPress={handleHost} accessibilityLabel="Host a Pack Day" />
          )}
        </View>
        <Text style={styles.subtitle}>{VIEWS.find((v) => v.id === view)?.blurb}</Text>

        <View style={styles.switchRow}>
          {VIEWS.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => setView(v.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v.id }}
              accessibilityLabel={v.label}
              style={[styles.chip, view === v.id && styles.chipOn]}
            >
              <Text style={[styles.chipText, view === v.id && { color: colors.cream }]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>

        {view === 'feed' && (
          <>
            <LostDogButton uid={user.uid} dogName={profile?.name?.trim() || 'Your dog'} />
            <CityFeed uid={user.uid} city={profile?.city?.trim()} canPost={canHost} blocked={blocked} reloadToken={reloadToken} />
          </>
        )}

        {view === 'spots' && <WhereWeGoSection uid={user.uid} city={profile?.city} />}

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
                  {profile?.city ? `Host ${profile.city}’s first Pack Day` : 'Nothing on the calendar yet'}
                </Heading>
                <Text style={[type.soft, styles.centerText]}>
                  Pick your usual park and a Saturday morning, and host the first one. Six dogs is plenty.{elsewhere.length > 0 ? ' Pack Days in nearby cities are below.' : ''}
                </Text>
                <View style={styles.benefitList}>
                  {HOST_BENEFITS.map((b) => (
                    <View key={b.text} style={styles.benefitRow}>
                      <Glyph name={b.icon} size={16} />
                      <Text style={styles.benefitText}>{b.text}</Text>
                    </View>
                  ))}
                </View>
                {canHost && <PinkButton label="Host a Pack Day" icon="tree" onPress={handleHost} style={styles.emptyBtn} />}
              </Paper>
            ) : (
              nearby.map((e) => <PackDayCard key={e.id} event={e} />)
            )}

            {nearby.length === 0 && (
              <View style={styles.nudgeList}>
                {nudgeRows(profile?.city?.trim()).map((n) => (
                  <Pressable
                    key={n.view}
                    onPress={() => setView(n.view)}
                    accessibilityRole="button"
                    style={styles.nudgeRow}
                  >
                    <View style={styles.nudgeIcon}><Glyph name={n.icon} size={18} /></View>
                    <Text style={styles.nudgeTitle}>{n.title}</Text>
                    <Glyph name="chevron-right" size={18} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {events && (groups.mine.length > 0 || nearbyGroups.length > 0 || canHost) && (
          <View style={styles.section}>
            <Heading size={22} style={styles.sectionLabel}>Standing groups</Heading>
            {[...groups.mine, ...nearbyGroups].map((g) => (
              <Pressable
                key={g.id}
                onPress={() => openGroup(g.id)}
                style={({ pressed }) => [styles.groupCard, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${packGroupScheduleLabel(g)}`}
              >
                <Text style={styles.groupName}>{g.name}</Text>
                <Text style={styles.groupMeta}>
                  {packGroupScheduleLabel(g)}{g.tags.length ? ` · ${g.tags.join(', ')}` : ''}{g.status === 'paused' ? ' · Paused' : ''}
                </Text>
                <Text style={styles.groupMeta}>{g.memberUids.length} following{g.hostUid === user.uid ? ' · You host' : g.memberUids.includes(user.uid) ? ' · Following' : ''}</Text>
              </Pressable>
            ))}
            {canHost && (
              <PaperButton small label="Start a repeating group" icon="plus" onPress={() => router.push('/pack/group/new')} />
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
  // One bordered track holding all three, so it reads as "pick one of these"
  // rather than three separate buttons.
  switchRow: {
    flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, marginBottom: 16,
    borderWidth: 2, borderColor: colors.ink, borderRadius: 999, backgroundColor: colors.cream,
  },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  loadingBox: { paddingVertical: 64, alignItems: 'center' },
  section: { marginBottom: 14 },
  sectionLabel: { marginBottom: 12 },
  groupCard: {
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 16,
    padding: 14,
    gap: 3,
    marginBottom: 10,
  },
  groupName: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  groupMeta: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  emptyCard: { alignItems: 'center', gap: 6 },
  emptyTitle: { marginTop: 4 },
  emptyBtn: { marginTop: 12, alignSelf: 'stretch' },
  benefitList: { alignSelf: 'stretch', gap: 6, marginTop: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  nudgeList: { marginTop: 10, gap: 8 },
  nudgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14,
    borderWidth: 2, borderColor: colors.ink, borderRadius: 16, backgroundColor: colors.cream,
  },
  nudgeIcon: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.note, alignItems: 'center', justifyContent: 'center',
  },
  nudgeTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
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
