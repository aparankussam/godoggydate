// mobile/app/pack/[id].tsx
// One Pack Day, inside the app: details, who's going, RSVP / leave / cancel,
// map, share, and report. Mirrors web/app/app/pack/[id]/page.tsx. Joining and
// leaving go through the rsvpPackDay callable, which enforces capacity and
// blocks atomically. Notification taps and universal links land on /pack/<id>.
//
// Add to calendar: web downloads an .ics file. The app has no file-system
// package to write one, and the public web page offers no .ics download, so
// "Save the date" opens the share sheet with the date, place and event link.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import {
  cancelPackDay,
  getPackDay,
  joinPackDay,
  leavePackDay,
  loadPackDayAttendees,
  packDayErrorMessage,
  packDayUrl,
  type PackDayAttendee,
} from '../../lib/packDay';
import { getBlockedUserIds } from '../../lib/blocks';
import { openReportSheet } from '../../lib/reports';
import { playdateSafetyUrl } from '../../lib/webLinks';
import { trackEvent } from '../../lib/analytics';
import PackDayRules from '../../components/PackDayRules';
import {
  PACK_DAY_FORMATS,
  formatPackDayWhen,
  isPast,
  mapsSearchUrl,
  spotsLeft,
} from '../../../shared/packDay';
import type { PackDay } from '../../../shared/packDay';

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Back to wherever we came from, or to the list when opened from a
 *  notification or link with nothing underneath. */
function goToList() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/pack');
}

function openUrl(url: string, what: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert(`Could not open ${what}`, 'Please try again in a moment.');
  });
}

export default function PackDayScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; new?: string | string[] }>();
  const eventId = firstParam(params.id);
  const justCreated = firstParam(params.new) === '1';
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();

  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<PackDayAttendee[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!eventId) {
      setLoadState('missing');
      return;
    }
    try {
      const result = await getPackDay(eventId);
      if (!result) {
        setLoadState('missing');
        return;
      }
      setEvent(result.event);
      setAttendees(await loadPackDayAttendees(result.event, result.foundingUids));
      setLoadState('ready');
    } catch (err) {
      console.warn('Failed to load Pack Day:', err);
      setLoadState('error');
    }
  }, [eventId]);

  useEffect(() => {
    if (!user) return;
    if (eventId) trackEvent('packday_view', { eventId });
    void reload();
    getBlockedUserIds(user.uid).then(setBlocked).catch(() => undefined);
  }, [user, eventId, reload]);

  async function run(action: () => Promise<void>, success: string, failure: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await reload();
    } catch (err) {
      setError(packDayErrorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  function handleJoin() {
    trackEvent('packday_rsvp', { eventId });
    void run(
      async () => {
        await joinPackDay(eventId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      'You’re in! We’ll remind you before it starts.',
      'We couldn’t save your spot. Try again.',
    );
  }

  function handleLeave() {
    void run(() => leavePackDay(eventId), 'You’ve left this Pack Day.', 'We couldn’t update your RSVP. Try again.');
  }

  function handleCancel() {
    Alert.alert('Cancel this Pack Day?', 'Everyone who signed up will be notified.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel Pack Day',
        style: 'destructive',
        onPress: () => void run(() => cancelPackDay(eventId), 'Pack Day cancelled.', 'We couldn’t cancel it. Try again.'),
      },
    ]);
  }

  async function handleShare() {
    if (!event) return;
    const text = `${event.title}: ${formatPackDayWhen(event)} at ${event.placeName}. Bring your dog!`;
    trackEvent('packday_share', { eventId });
    try {
      await Share.share({ message: `${text} ${packDayUrl(event.id)}` });
    } catch {
      // A dismissed share sheet isn't an error worth showing.
    }
  }

  async function handleSaveTheDate() {
    if (!event) return;
    trackEvent('packday_calendar', { eventId, method: 'share' });
    const lines = [
      `${event.title} (Pack Day)`,
      `${formatPackDayWhen(event)} · ${event.durationMinutes} min`,
      [event.placeName, event.city, event.state].filter(Boolean).join(', '),
      packDayUrl(event.id),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Dismissed.
    }
  }

  function handleReport() {
    if (!user || !event) return;
    openReportSheet(
      { reporterId: user.uid, targetUserId: event.hostUid, source: 'packday', eventId: event.id },
      {
        name: event.hostDogName ? `${event.hostDogName}’s human` : undefined,
        onBlocked: () => router.replace('/(tabs)/pack'),
      },
    );
  }

  const header = (showReport: boolean) => (
    <View style={styles.header}>
      <Pressable style={styles.backBtn} onPress={goToList} accessibilityRole="button" accessibilityLabel="Back to Pack Days">
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Pack Day</Text>
      {showReport && (
        <Pressable
          style={styles.reportBtn}
          onPress={handleReport}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Report or block the host"
        >
          <Text style={styles.reportBtnText}>Report</Text>
        </Pressable>
      )}
    </View>
  );

  if (sessionLoading || (user && loadState === 'loading')) {
    return (
      <SafeAreaView style={styles.container}>
        {header(false)}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        {header(false)}
        <View style={styles.center}>
          <Text style={styles.gateEmoji}>🌳</Text>
          <Text style={styles.gateTitle}>Sign in to see this Pack Day</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/welcome')}>
            <Text style={styles.primaryBtnText}>Sign in or sign up</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'missing' || loadState === 'error' || !event) {
    return (
      <SafeAreaView style={styles.container}>
        {header(false)}
        <View style={styles.center}>
          <Text style={styles.gateEmoji}>🐕</Text>
          <Text style={styles.gateTitle}>
            {loadState === 'error' ? 'We couldn’t load this Pack Day' : 'This Pack Day isn’t here anymore'}
          </Text>
          {loadState === 'error' && (
            <Pressable
              style={[styles.secondaryBtn, styles.gateSecondary]}
              onPress={() => {
                setLoadState('loading');
                void reload();
              }}
            >
              <Text style={styles.secondaryBtnText}>Try again</Text>
            </Pressable>
          )}
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/pack')}>
            <Text style={styles.primaryBtnText}>See Pack Days</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const uid = user.uid;
  const isHost = event.hostUid === uid;
  const going = event.attendeeUids.includes(uid);
  const cancelled = event.status === 'cancelled';
  const over = isPast(event, Date.now());
  const live = !cancelled && !over;
  const left = spotsLeft(event);
  const format = PACK_DAY_FORMATS[event.format] ?? PACK_DAY_FORMATS['pack-walk'];
  const visibleAttendees = attendees.filter((a) => !blocked.has(a.uid));
  const dogName = profile?.name?.trim() || 'my dog';

  return (
    <SafeAreaView style={styles.container}>
      {header(!isHost)}

      <ScrollView contentContainerStyle={styles.content}>
        {justCreated && isHost && live && (
          <View style={[styles.banner, styles.bannerSuccess]}>
            <Text style={styles.bannerSuccessText}>
              Your Pack Day is live. Share the link with neighbors. Six dogs makes a great one. 🎉
            </Text>
          </View>
        )}
        {cancelled && (
          <View style={[styles.banner, styles.bannerDanger]}>
            <Text style={styles.bannerDangerText}>This Pack Day was cancelled.</Text>
          </View>
        )}
        {!cancelled && over && (
          <View style={[styles.banner, styles.bannerMuted]}>
            <Text style={styles.bannerMutedText}>This Pack Day is over.</Text>
          </View>
        )}

        {/* ── Details ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <LinearGradient
            colors={[`${colors.primary}26`, `${colors.gold}26`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardHead}
          >
            <Text style={styles.eyebrow}>
              {event.official ? '⭐ Official · ' : ''}{format.emoji} {format.label}
            </Text>
            <Text style={styles.eventTitle}>{event.title}</Text>
          </LinearGradient>
          <View style={styles.cardBody}>
            <Text style={styles.when}>📅 {formatPackDayWhen(event)} · {event.durationMinutes} min</Text>
            <Text style={styles.where}>
              📍 <Text style={styles.whereName}>{event.placeName}</Text>, {event.city}
              {event.state ? `, ${event.state}` : ''}
            </Text>
            <Pressable
              style={styles.mapBtn}
              onPress={() => {
                trackEvent('packday_map', { eventId });
                openUrl(mapsSearchUrl(event), 'Maps');
              }}
              accessibilityRole="link"
            >
              <Text style={styles.mapBtnText}>Open in Maps ↗</Text>
            </Pressable>
            <Text style={styles.blurb}>{format.blurb}</Text>
            {!!event.note && <Text style={styles.note}>“{event.note}”</Text>}
            <Text style={styles.host}>Hosted by {event.hostDogName || 'a neighbor'}’s human</Text>
          </View>
        </View>

        {/* ── Who's going ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {event.attendeeUids.length} of {event.capacity} dogs going
            {left === 0 ? ' · Full' : live ? ` · ${left} spot${left === 1 ? '' : 's'} left` : ''}
          </Text>
          <View style={styles.attendeeGrid}>
            {visibleAttendees.map((a) => (
              <View key={a.uid} style={styles.attendee}>
                {a.photo ? (
                  <Image source={{ uri: a.photo }} style={styles.attendeePhoto} accessibilityLabel={a.name} />
                ) : (
                  <View style={[styles.attendeePhoto, styles.attendeeFallback]}>
                    <Text style={styles.attendeeEmoji}>🐕</Text>
                  </View>
                )}
                <Text style={styles.attendeeName} numberOfLines={1}>
                  {a.founding ? '⭐ ' : ''}{a.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        {message && (
          <View style={[styles.banner, styles.bannerOk]} accessibilityLiveRegion="polite">
            <Text style={styles.bannerOkText}>{message}</Text>
          </View>
        )}
        {error && (
          <View style={[styles.banner, styles.bannerDanger]} accessibilityRole="alert">
            <Text style={styles.bannerDangerText}>{error}</Text>
          </View>
        )}

        {live && !going && (
          !profileComplete ? (
            <View style={styles.joinBox}>
              <Text style={styles.joinText}>Add your dog’s profile to save a spot.</Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/profile')}>
                <Text style={styles.primaryBtnText}>Set up my dog</Text>
              </Pressable>
            </View>
          ) : left === 0 ? (
            <View style={styles.joinBox}>
              <Text style={styles.joinFull}>This Pack Day is full.</Text>
            </View>
          ) : (
            <PackDayRules
              accepted={accepted}
              onChange={setAccepted}
              agreeLabel="I’ll follow these rules."
              footer={
                <Text style={styles.smallPrint}>
                  GoDoggyDate doesn’t verify dogs or owners. Read the{' '}
                  <Text style={styles.smallPrintLink} onPress={() => openUrl(playdateSafetyUrl(), 'the guide')}>
                    first-meeting guide
                  </Text>
                  .
                </Text>
              }
            >
              <Pressable
                style={[styles.primaryBtn, (busy || !accepted) && styles.disabled]}
                onPress={handleJoin}
                disabled={busy || !accepted}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy || !accepted }}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Saving…' : `I’m in, ${dogName} too 🐾`}</Text>
              </Pressable>
            </PackDayRules>
          )
        )}

        <View style={styles.actionRow}>
          {live && (
            <Pressable style={styles.secondaryBtn} onPress={() => void handleShare()}>
              <Text style={styles.secondaryBtnText}>Share 🔗</Text>
            </Pressable>
          )}
          {live && going && (
            <Pressable style={styles.secondaryBtn} onPress={() => void handleSaveTheDate()}>
              <Text style={styles.secondaryBtnText}>Save the date 📅</Text>
            </Pressable>
          )}
          {live && going && !isHost && (
            <Pressable style={[styles.secondaryBtn, busy && styles.disabled]} onPress={handleLeave} disabled={busy}>
              <Text style={styles.secondaryBtnText}>Can’t make it</Text>
            </Pressable>
          )}
          {live && isHost && (
            <Pressable style={[styles.dangerBtn, busy && styles.disabled]} onPress={handleCancel} disabled={busy}>
              <Text style={styles.dangerBtnText}>Cancel Pack Day</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  gateEmoji: { fontSize: 56, marginBottom: 12 },
  gateTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, marginBottom: 16, textAlign: 'center' },
  gateSecondary: { marginBottom: 10 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', backgroundColor: colors.cream,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: colors.brownLight, marginTop: -2 },
  headerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.brown, marginLeft: 4 },
  reportBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  reportBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownLight },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  banner: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  bannerSuccess: { backgroundColor: `${colors.primary}1A` },
  bannerSuccessText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.brown },
  bannerDanger: { backgroundColor: '#FEF2F2' },
  bannerDangerText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: '#B91C1C' },
  bannerMuted: { backgroundColor: colors.creamDark },
  bannerMutedText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  bannerOk: { backgroundColor: '#F0FDF4' },
  bannerOkText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: '#166534' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardHead: { paddingHorizontal: 18, paddingVertical: 16 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  eventTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.brown, marginTop: 4 },
  cardBody: { paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  when: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  where: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.brown },
  whereName: { fontFamily: fonts.semibold },
  mapBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: -2,
  },
  mapBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  blurb: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brown, fontStyle: 'italic' },
  host: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  section: { gap: 10 },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  attendeeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attendee: {
    width: '31%',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  attendeePhoto: { width: '100%', height: 96, backgroundColor: colors.creamDark },
  attendeeFallback: { alignItems: 'center', justifyContent: 'center' },
  attendeeEmoji: { fontSize: 36 },
  attendeeName: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brown,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  joinBox: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  joinText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  joinFull: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownMid },
  smallPrint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.brownLight },
  smallPrintLink: { textDecorationLine: 'underline', color: colors.brownMid },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown },
  dangerBtn: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dangerBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: '#B91C1C' },
  disabled: { opacity: 0.6 },
});
