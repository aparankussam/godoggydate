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
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, Heading, Paper, PaperButton, PinkButton, Slip, type } from '../../components/pack/kit';
import { FlyerFacts, GoingTokens, RulesSlip } from '../../components/pack/flyer';
import { useSession } from '../../lib/session';
import {
  cancelPackDay,
  checkInToPackDay,
  getPackDay,
  listCheckins,
  joinPackDay,
  leavePackDay,
  loadPackDayAttendees,
  packDayErrorMessage,
  packDayUrl,
  type PackDayAttendee,
} from '../../lib/packDay';
import { discoverFromPackDay } from '../../lib/dogtypeDiscovery';
import { getFirebase } from '../../lib/firebase';
import { getBlockedUserIds } from '../../lib/blocks';
import { openReportSheet } from '../../lib/reports';
import { playdateSafetyUrl } from '../../lib/webLinks';
import { trackEvent } from '../../lib/analytics';
import { requestApproxLocation } from '../../lib/location';
import * as Location from 'expo-location';
import { webUrl } from '../../lib/webLinks';
import PackDayRules from '../../components/PackDayRules';
import {
  checkedInDogCount,
  formatPackDayWhen,
  isCheckinOpen,
  isPast,
  mapsSearchUrl,
  sameCity,
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
  const params = useLocalSearchParams<{ id?: string | string[]; new?: string | string[]; checkin?: string | string[] }>();
  const eventId = firstParam(params.id);
  const justCreated = firstParam(params.new) === '1';
  // The host's QR code opens this screen (or the web page) with ?checkin=1.
  const fromQr = firstParam(params.checkin) === '1';
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();

  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<PackDayAttendee[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [checkins, setCheckins] = useState<Array<{ uid: string; dogId: string }>>([]);
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
      setCheckins(await listCheckins(eventId).catch(() => []));
      const loaded = await loadPackDayAttendees(result.event, result.foundingUids);
      setAttendees(loaded);
      // A finished Pack Day you went to: the dogs there count as met (their Dogtypes join your collection).
      const me = getFirebase().auth.currentUser?.uid;
      if (me && isPast(result.event, Date.now()) && result.event.status !== 'cancelled' && result.event.attendeeUids.includes(me)) {
        void discoverFromPackDay(
          me,
          loaded
            .filter((a) => a.uid !== me && a.dogtypeCode)
            .map((a) => ({ code: a.dogtypeCode as string, dogId: a.uid, dogName: a.name, at: result.event.startsAtMs })),
        );
      }
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

  // QR link: the host's code is the proof. Otherwise the phone must be in the event's city
  // (location is kept by city, so that is the whole check; we never store coordinates).
  function handleCheckIn(me: string, city: string) {
    void run(
      async () => {
        let method: 'qr' | 'location' = 'qr';
        if (!fromQr) {
          method = 'location';
          const { status, coords } = await requestApproxLocation();
          if (status !== 'granted' || !coords) {
            throw new Error('Allow location to check in, or scan the host’s QR code.');
          }
          const [place] = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng });
          if (!sameCity(place?.city, city)) {
            throw new Error('You don’t look to be at the Pack Day yet. Scan the host’s QR code instead.');
          }
        }
        await checkInToPackDay(eventId, me, me, method);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      'You’re checked in!',
      'We couldn’t check you in. Try again.',
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
    <BackHeader
      title="Pack Day"
      onBack={goToList}
      backLabel="Back to Pack Days"
      right={
        showReport ? (
          <Pressable
            style={styles.reportBtn}
            onPress={handleReport}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Report or block the host"
          >
            <Glyph name="flag" size={18} />
            <Text style={styles.reportBtnText}>Report</Text>
          </Pressable>
        ) : undefined
      }
    />
  );

  if (sessionLoading || (user && loadState === 'loading')) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        {header(false)}
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        {header(false)}
        <View style={styles.center}>
          <View style={styles.gateIcon}><Glyph name="tree" size={40} /></View>
          <Heading size={26} style={styles.gateTitle}>Sign in to see this Pack Day</Heading>
          <PinkButton label="Sign in or sign up" onPress={() => router.replace('/welcome')} style={styles.gateBtn} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'missing' || loadState === 'error' || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        {header(false)}
        <View style={styles.center}>
          <View style={styles.gateIcon}><Glyph name={loadState === 'error' ? 'wifi-off' : 'tree'} size={40} /></View>
          <Heading size={24} style={styles.gateTitle}>
            {loadState === 'error' ? 'We couldn’t load this Pack Day' : 'This Pack Day isn’t here anymore'}
          </Heading>
          {loadState === 'error' && (
            <PaperButton
              label="Try again"
              icon="refresh"
              style={[styles.gateBtn, styles.gateSecondary]}
              onPress={() => {
                setLoadState('loading');
                void reload();
              }}
            />
          )}
          <PinkButton label="See Pack Days" onPress={() => router.replace('/(tabs)/pack')} style={styles.gateBtn} />
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
  const visibleAttendees = attendees.filter((a) => !blocked.has(a.uid));
  const dogName = profile?.name?.trim() || 'my dog';
  const canJoin = live && !going;
  const checkedIn = checkins.some((c) => c.uid === uid);
  const checkinOpen = going && isCheckinOpen(event, Date.now());

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      {header(!isHost)}

      <ScrollView contentContainerStyle={styles.content}>
        {justCreated && isHost && live && (
          <Slip tone="ok" icon="party-popper">
            Your Pack Day is live. Share the link with neighbors. Six dogs makes a great one.
          </Slip>
        )}
        {cancelled && <Slip icon="calendar-remove">This Pack Day was cancelled.</Slip>}
        {!cancelled && over && <Slip icon="calendar-check">This Pack Day is over.</Slip>}

        {/* ── The flyer ─────────────────────────────────────────────────── */}
        <Paper tape style={styles.flyer}>
          <FlyerFacts
            event={event}
            onMap={() => {
              trackEvent('packday_map', { eventId });
              openUrl(mapsSearchUrl(event), 'Maps');
            }}
          />
          <GoingTokens capacity={event.capacity} count={event.attendeeUids.length} status={event.status} />
          {!canJoin && <View style={styles.flyerRules}><RulesSlip /></View>}
        </Paper>

        {event.foundingHost && !cancelled && (
          <Slip icon="star">Founding Host: this is their first Pack Day.</Slip>
        )}

        {/* ── Check-in ─────────────────────────────────────────────────── */}
        {!cancelled && checkins.length > 0 && (
          <Text style={type.strong}>{checkedInDogCount(checkins)} checked in</Text>
        )}
        {going && checkedIn && <Slip tone="ok" icon="check-bold">You’re checked in.</Slip>}
        {checkinOpen && !checkedIn && (
          <PinkButton label={busy ? 'Checking in…' : 'I’m here'} icon="map-marker-check" onPress={() => handleCheckIn(uid, event.city)} disabled={busy} />
        )}
        {isHost && checkinOpen && (
          <Paper style={styles.joinBox}>
            <Text style={type.strong}>Check-in code</Text>
            <Text style={type.soft}>Neighbors scan this with their camera when they arrive.</Text>
            <Image
              source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(webUrl(`/app/pack/${event.id}?checkin=1`))}` }}
              style={styles.qr}
              accessibilityLabel="QR code for checking in to this Pack Day"
            />
          </Paper>
        )}

        {/* ── Who's going (members only; a cancelled event shows no head count) ── */}
        {!cancelled && visibleAttendees.length > 0 && (
          <View style={styles.section}>
            <Heading size={22}>Who’s going</Heading>
            <View style={styles.attendeeGrid}>
              {visibleAttendees.map((a) => (
                <View key={a.uid} style={styles.attendee}>
                  {a.photo ? (
                    <Image source={{ uri: a.photo }} style={styles.attendeePhoto} accessibilityLabel={a.name} />
                  ) : (
                    <View style={[styles.attendeePhoto, styles.attendeeFallback]}>
                      <Glyph name="paw" size={32} />
                    </View>
                  )}
                  <View style={styles.attendeeNameRow}>
                    {a.founding && <Glyph name="star" size={13} />}
                    <Text style={styles.attendeeName} numberOfLines={1}>{a.name}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        {message && <Slip tone="ok" live>{message}</Slip>}
        {error && <Slip tone="error">{error}</Slip>}

        {canJoin && (
          !profileComplete ? (
            <Paper style={styles.joinBox}>
              <Text style={type.body}>Add your dog’s profile to save a spot.</Text>
              <PinkButton label="Set up my dog" onPress={() => router.push('/(tabs)/profile')} />
            </Paper>
          ) : spotsLeft(event) === 0 ? (
            <Paper style={styles.joinBox}>
              <Text style={type.strong}>This Pack Day is full.</Text>
            </Paper>
          ) : (
            <Paper style={styles.joinBox}>
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
                <PinkButton
                  label={busy ? 'Saving…' : `I’m in, ${dogName} too`}
                  icon="paw"
                  onPress={handleJoin}
                  disabled={busy || !accepted}
                />
              </PackDayRules>
            </Paper>
          )
        )}

        {live && (
          <View style={styles.actionRow}>
            <PaperButton small label="Share" icon="export-variant" onPress={() => void handleShare()} style={styles.actionBtn} />
            {going && (
              <PaperButton small label="Save the date" icon="calendar-month" onPress={() => void handleSaveTheDate()} style={styles.actionBtn} />
            )}
            {going && !isHost && (
              <PaperButton small label="Can’t make it" onPress={handleLeave} disabled={busy} style={styles.actionBtn} />
            )}
            {isHost && (
              <PaperButton small label="Cancel Pack Day" icon="close" onPress={handleCancel} disabled={busy} style={styles.actionBtn} />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
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
  gateSecondary: { marginBottom: 12 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 6 },
  reportBtnText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
  content: { padding: 16, paddingTop: 8, paddingBottom: 48, gap: 18 },
  flyer: { paddingHorizontal: 20, paddingBottom: 22 },
  flyerRules: { marginTop: 18 },
  section: { gap: 12 },
  attendeeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  attendee: {
    width: '31%',
    backgroundColor: colors.cream,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: 'hidden',
  },
  attendeePhoto: { width: '100%', height: 96, backgroundColor: colors.note },
  attendeeFallback: { alignItems: 'center', justifyContent: 'center' },
  attendeeNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 6 },
  attendeeName: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, flexShrink: 1 },
  joinBox: { gap: 12 },
  qr: { width: 200, height: 200, alignSelf: 'center', backgroundColor: '#fff' },
  smallPrint: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  smallPrintLink: { fontFamily: fonts.black, color: colors.ink, textDecorationLine: 'underline' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { flexGrow: 1 },
});
