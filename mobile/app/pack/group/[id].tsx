// mobile/app/pack/group/[id].tsx
// A standing Pack Day group: the next meetup, past meetups, members (dogs), and
// host tools. Meetups are ordinary Pack Days (open one for RSVP, map, share,
// report, rules). Joining the group = following it: you get a push when the
// next meetup is posted. All writes go through callables (lib/packGroup.ts).

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts } from '../../../constants/theme';
import { BackHeader, Gingham, Glyph, Heading, Paper, PaperButton, PinkButton, Slip, Tag, type } from '../../../components/pack/kit';
import PackDayCard from '../../../components/PackDayCard';
import { useSession } from '../../../lib/session';
import { cancelPackDay, loadDogCards, loadPackDayAttendees, toLocalDateString, type PackDayAttendee } from '../../../lib/packDay';
import {
  getPackGroup, joinPackGroup, leavePackGroup, listGroupOccurrences, movePackDay, packDayErrorMessage,
  removePackGroupMember, updatePackGroup,
} from '../../../lib/packGroup';
import { getBlockedUserIds } from '../../../lib/blocks';
import { isPast } from '../../../../shared/packDay';
import type { PackDay } from '../../../../shared/packDay';
import {
  PACK_GROUP_FREQUENCY_LABELS, dogMixSummary, packGroupScheduleLabel, type PackGroup, type PackGroupFrequency,
} from '../../../../shared/packGroup';
import type { DogProfile } from '../../../../shared/types';

const MEMBER_PREVIEW = 40;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The next 14 days, for "Moved to...". */
function moveDays(): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1);
    return { value: toLocalDateString(day), label: `${WEEKDAYS[day.getDay()]} ${day.getMonth() + 1}/${day.getDate()}` };
  });
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/pack');
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function PackGroupScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const { user, loading: sessionLoading } = useSession();

  const [group, setGroup] = useState<PackGroup | null>(null);
  const [events, setEvents] = useState<PackDay[]>([]);
  const [members, setMembers] = useState<PackDayAttendee[]>([]);
  const [mix, setMix] = useState('');
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'schedule' | 'move'>('none');
  const [freqDraft, setFreqDraft] = useState<PackGroupFrequency>('weekly');
  const [hourDraft, setHourDraft] = useState(9);

  const reload = useCallback(async () => {
    try {
      const g = await getPackGroup(groupId);
      if (!g) return setLoadState('missing');
      setGroup(g);
      const [occ, memberCards] = await Promise.all([listGroupOccurrences(groupId), loadDogCards(g.memberUids.slice(0, MEMBER_PREVIEW))]);
      setEvents(occ);
      setMembers(memberCards);
      const next = occ.find((e) => e.status === 'open' && !isPast(e, Date.now()));
      if (next) {
        const going = await loadPackDayAttendees(next, []);
        setMix(dogMixSummary(going.map((a) => a.profile as unknown as DogProfile)));
      } else setMix('');
      setLoadState('ready');
    } catch (err) {
      console.warn('Failed to load group:', err);
      setLoadState('error');
    }
  }, [groupId]);

  useEffect(() => {
    if (!user) return;
    void reload();
    getBlockedUserIds(user.uid).then(setBlocked).catch(() => undefined);
  }, [user, reload]);

  async function run(action: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setPanel('none');
      await reload();
    } catch (err) {
      setError(packDayErrorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  const header = <BackHeader title="Group" onBack={goBack} backLabel="Back to Pack Days" />;

  if (sessionLoading || (user && loadState === 'loading')) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        {header}
        <View style={styles.center}><ActivityIndicator color={colors.ink} size="large" /></View>
      </SafeAreaView>
    );
  }
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        {header}
        <View style={styles.center}>
          <Heading size={26} style={styles.centerText}>Sign in to see this group</Heading>
          <PinkButton label="Sign in or sign up" onPress={() => router.replace('/welcome')} style={styles.stretch} />
        </View>
      </SafeAreaView>
    );
  }
  if (loadState !== 'ready' || !group) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        {header}
        <View style={styles.center}>
          <Heading size={24} style={styles.centerText}>
            {loadState === 'error' ? 'We couldn’t load this group' : 'This group isn’t here anymore'}
          </Heading>
          {loadState === 'error' && (
            <PaperButton label="Try again" icon="refresh" style={styles.stretch} onPress={() => { setLoadState('loading'); void reload(); }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const uid = user.uid;
  const isHost = group.hostUid === uid;
  const isMember = group.memberUids.includes(uid);
  const removed = group.removedUids.includes(uid);
  const now = Date.now();
  const upcoming = events.filter((e) => e.status === 'open' && !isPast(e, now));
  const next = upcoming[0] ?? null;
  const past = events.filter((e) => !upcoming.includes(e)).reverse().slice(0, 8);
  const visibleMembers = members.filter((m) => !blocked.has(m.uid));

  function handleCancelNext() {
    if (!next) return;
    Alert.alert('Cancel this meetup?', 'Everyone who signed up is notified. The next one in the schedule is posted automatically.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel meetup', style: 'destructive', onPress: () => void run(() => cancelPackDay(next.id), 'We couldn’t cancel it. Try again.') },
    ]);
  }

  function handleRemove(m: PackDayAttendee) {
    Alert.alert(`Remove ${m.name}?`, 'They leave the group, come off upcoming meetups, and can’t rejoin.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run(() => removePackGroupMember(groupId, m.uid), 'We couldn’t remove them. Try again.') },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Paper tape style={styles.card}>
          <Heading size={28}>{group.name}</Heading>
          <View style={styles.row}><Glyph name="calendar-month" size={18} /><Text style={styles.fact}>{packGroupScheduleLabel(group)}</Text></View>
          <View style={styles.row}><Glyph name="map-marker" size={18} /><Text style={styles.fact}>{group.placeName}, {group.city}</Text></View>
          {group.tags.length > 0 && (
            <View style={styles.tagRow}>{group.tags.map((t) => <Tag key={t} label={t} />)}</View>
          )}
          {group.note ? <Text style={type.body}>{group.note}</Text> : null}
          <Text style={styles.help}>Hosted by {group.hostDogName ? `${group.hostDogName}’s human` : 'the host'} · {group.memberUids.length} following</Text>
        </Paper>

        {group.status === 'paused' && <Slip icon="pause-circle">This group is paused. No new meetups are posted until the host resumes it.</Slip>}
        {error && <Slip tone="error">{error}</Slip>}

        {!isHost && !removed && (
          isMember ? (
            <PaperButton label="Following · tap to leave" icon="check" disabled={busy} onPress={() => void run(() => leavePackGroup(groupId), 'We couldn’t update that. Try again.')} />
          ) : (
            <PinkButton label="Follow this group" icon="paw" disabled={busy} onPress={() => void run(() => joinPackGroup(groupId), 'We couldn’t join. Try again.')} />
          )
        )}
        {!isHost && !isMember && <Text style={styles.help}>Following means a nudge each time the next meetup is posted. You still save a spot for each one yourself.</Text>}

        {/* ── Next meetup ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Heading size={22}>Next meetup</Heading>
          {next ? (
            <>
              <PackDayCard event={next} badge={next.hostUid === uid ? 'hosting' : next.attendeeUids.includes(uid) ? 'going' : undefined} />
              {mix ? <Text style={styles.mix}>{mix}</Text> : null}
              {group.smallDogsOnly && <Text style={styles.help}>Small dogs only.</Text>}
            </>
          ) : (
            <Paper><Text style={type.soft}>{group.status === 'paused' ? 'Paused.' : 'The next one is posted shortly after the last one ends.'}</Text></Paper>
          )}
        </View>

        {/* ── Host tools ───────────────────────────────────────────────── */}
        {isHost && (
          <Paper style={styles.card}>
            <Heading size={22}>Host tools</Heading>
            {next && (
              <>
                <Text style={styles.help}>This week’s meetup. One tap tells everyone who signed up.</Text>
                <View style={styles.actionRow}>
                  <PaperButton small label="Moved" icon="calendar-edit" disabled={busy} onPress={() => setPanel(panel === 'move' ? 'none' : 'move')} style={styles.actionBtn} />
                  <PaperButton small label="Cancelled" icon="close" disabled={busy} onPress={handleCancelNext} style={styles.actionBtn} />
                </View>
                {panel === 'move' && (
                  <>
                    <Text style={styles.label}>Moved to (same start time)</Text>
                    <View style={styles.chipRow}>
                      {moveDays().map((d) => (
                        <Chip key={d.value} label={d.label} active={false} onPress={() => void run(() => movePackDay(next.id, d.value), 'We couldn’t move it. Try again.')} />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
            <View style={styles.actionRow}>
              <PaperButton
                small
                label="Edit schedule"
                icon="pencil"
                disabled={busy}
                onPress={() => {
                  setFreqDraft(group.frequency);
                  setHourDraft(Number(group.localTime.slice(0, 2)));
                  setPanel(panel === 'schedule' ? 'none' : 'schedule');
                }}
                style={styles.actionBtn}
              />
              <PaperButton
                small
                label={group.status === 'active' ? 'Pause group' : 'Resume group'}
                icon={group.status === 'active' ? 'pause' : 'play'}
                disabled={busy}
                onPress={() => void run(() => updatePackGroup(groupId, { status: group.status === 'active' ? 'paused' : 'active' }), 'We couldn’t update the group. Try again.')}
                style={styles.actionBtn}
              />
            </View>
            {panel === 'schedule' && (
              <>
                <Text style={styles.label}>How often</Text>
                <View style={styles.chipRow}>
                  {(Object.keys(PACK_GROUP_FREQUENCY_LABELS) as PackGroupFrequency[]).map((f) => (
                    <Chip key={f} label={PACK_GROUP_FREQUENCY_LABELS[f]} active={freqDraft === f} onPress={() => setFreqDraft(f)} />
                  ))}
                </View>
                <Text style={styles.label}>Start time (on the same minutes)</Text>
                <View style={styles.chipRow}>
                  {Array.from({ length: 16 }, (_, i) => 6 + i).map((h) => (
                    <Chip key={h} label={`${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`} active={hourDraft === h} onPress={() => setHourDraft(h)} />
                  ))}
                </View>
                <Text style={styles.help}>Applies to meetups posted from now on. Ones already posted keep their time.</Text>
                <PinkButton
                  label="Save schedule"
                  disabled={busy}
                  onPress={() => void run(
                    () => updatePackGroup(groupId, { frequency: freqDraft, localTime: `${String(hourDraft).padStart(2, '0')}:${group.localTime.slice(3)}` }),
                    'We couldn’t save the schedule. Try again.',
                  )}
                />
              </>
            )}
          </Paper>
        )}

        {/* ── Members ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Heading size={22}>Members</Heading>
          <View style={styles.grid}>
            {visibleMembers.map((m) => (
              <View key={m.uid} style={styles.member}>
                {m.photo ? (
                  <Image source={{ uri: m.photo }} style={styles.memberPhoto} accessibilityLabel={m.name} />
                ) : (
                  <View style={[styles.memberPhoto, styles.memberFallback]}><Glyph name="paw" size={28} /></View>
                )}
                <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                {isHost && m.uid !== uid && (
                  <Pressable onPress={() => handleRemove(m)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          {group.memberUids.length > MEMBER_PREVIEW && <Text style={styles.help}>and {group.memberUids.length - MEMBER_PREVIEW} more</Text>}
        </View>

        {/* GROUP CHAT: not built yet (per-event chat is packDays/{id}/messages). A standing
            group chat would render here, backed by packGroups/{groupId}/messages. */}

        {/* ── Past meetups ─────────────────────────────────────────────── */}
        {past.length > 0 && (
          <View style={styles.section}>
            <Heading size={22}>Past meetups</Heading>
            {past.map((e) => <PackDayCard key={e.id} event={e} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerText: { textAlign: 'center', marginBottom: 18 },
  stretch: { alignSelf: 'stretch' },
  content: { padding: 16, paddingTop: 8, paddingBottom: 48, gap: 18 },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fact: { flex: 1, fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  help: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  mix: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  label: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  section: { gap: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { flexGrow: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40, justifyContent: 'center', borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream,
    borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  chipTextActive: { color: colors.cream },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  member: { width: '31%', backgroundColor: colors.cream, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, overflow: 'hidden', alignItems: 'center' },
  memberPhoto: { width: '100%', height: 84, backgroundColor: colors.note },
  memberFallback: { alignItems: 'center', justifyContent: 'center' },
  memberName: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, paddingHorizontal: 6, paddingVertical: 5 },
  remove: { fontFamily: fonts.black, fontSize: 12, color: colors.ink, textDecorationLine: 'underline', paddingBottom: 6 },
});
