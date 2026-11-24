// mobile/app/pack/group/new.tsx
// Start a standing Pack Day group: a Pack Day that repeats weekly, every two
// weeks or monthly, with a name and optional breed/interest tags. Creating it
// posts the first meetup right away; a scheduled function posts the rest ahead
// of time and tells the members. createPackGroup re-validates everything; the
// checks here are only so mistakes show up before the round trip. Date and time
// are chips, like mobile/app/pack/new.tsx (no date-picker package installed).

import { useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../../../constants/theme';
import { BackHeader, Gingham, Glyph, Heading, Paper, PaperButton, PinkButton, Slip } from '../../../components/pack/kit';
import { useSession } from '../../../lib/session';
import { packDayStartMs, toLocalDateString, toLocalTimeString } from '../../../lib/packDay';
import { createPackGroup, packDayErrorMessage } from '../../../lib/packGroup';
import { trackEvent } from '../../../lib/analytics';
import PackDayRules from '../../../components/PackDayRules';
import { PACK_DAY_LIMITS, formatPackDayWhen } from '../../../../shared/packDay';
import {
  PACK_GROUP_FREQUENCY_LABELS,
  PACK_GROUP_LIMITS,
  PACK_GROUP_TAG_SUGGESTIONS,
  type PackGroupFrequency,
} from '../../../../shared/packGroup';
import { CONTENT_FILTER_MESSAGE, checkContentFields } from '../../../../shared/contentFilter';

const HOURS = Array.from({ length: 16 }, (_, i) => 6 + i);
const MINUTES = [0, 15, 30, 45];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAPACITIES = Array.from(
  { length: PACK_DAY_LIMITS.maxCapacity - PACK_DAY_LIMITS.minCapacity + 1 },
  (_, i) => PACK_DAY_LIMITS.minCapacity + i,
);

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

function upcomingDays(): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: PACK_DAY_LIMITS.maxLeadDays + 1 }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${WEEKDAYS[day.getDay()]} ${day.getMonth() + 1}/${day.getDate()}`;
    return { value: toLocalDateString(day), label };
  });
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/pack');
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function NewPackGroupScreen() {
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();
  const days = useMemo(upcomingDays, []);

  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [frequency, setFrequency] = useState<PackGroupFrequency>('weekly');
  const [date, setDate] = useState('');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [duration, setDuration] = useState<number>(PACK_DAY_LIMITS.defaultDurationMinutes);
  const [placeName, setPlaceName] = useState('');
  const [note, setNote] = useState('');
  const [capacity, setCapacity] = useState<number>(PACK_DAY_LIMITS.defaultCapacity);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const time = toLocalTimeString(hour, minute);
  // The "Small dogs only" tag is the switch: it makes every meetup small-dogs-only.
  const smallDogsOnly = tags.includes('Small dogs only');

  function toggleTag(tag: string) {
    setTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : cur.length < PACK_GROUP_LIMITS.maxTags ? [...cur, tag] : cur,
    );
  }

  function addCustomTag() {
    const tag = customTag.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()) && tags.length < PACK_GROUP_LIMITS.maxTags) {
      setTags([...tags, tag]);
    }
    setCustomTag('');
  }

  async function handleSubmit() {
    if (busy) return;
    setError(null);
    if (!name.trim() || !placeName.trim()) {
      setError('Add a group name and a place.');
      return;
    }
    const startsAtMs = date ? packDayStartMs(date, time) : null;
    if (!date || startsAtMs === null) {
      setError('Pick the first date.');
      return;
    }
    if (startsAtMs < Date.now() + PACK_DAY_LIMITS.minLeadMinutes * 60_000) {
      setError('The first meetup must be at least an hour from now, so people have notice.');
      return;
    }
    if (!accepted) {
      setError('Please agree to the Pack Day rules.');
      return;
    }
    if (!checkContentFields([name, placeName, note, ...tags]).ok) {
      setError(CONTENT_FILTER_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const { groupId } = await createPackGroup({
        name: name.trim(),
        tags,
        smallDogsOnly,
        frequency,
        firstLocalDate: date,
        localTime: time,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        durationMinutes: duration,
        placeName: placeName.trim(),
        note: note.trim(),
        capacity,
        acceptedRules: true,
      });
      trackEvent('packgroup_created', { frequency, smallDogsOnly });
      router.replace({ pathname: '/pack/group/[id]', params: { id: groupId } });
    } catch (err) {
      setError(packDayErrorMessage(err, 'We couldn’t create your group. Try again.'));
      setBusy(false);
    }
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <Gingham />
        <ActivityIndicator color={colors.ink} size="large" />
      </SafeAreaView>
    );
  }

  if (!user || !profileComplete) {
    return (
      <SafeAreaView style={styles.center}>
        <Gingham />
        <View style={styles.gateIcon}><Glyph name="paw" size={40} /></View>
        <Heading size={26} style={styles.gateTitle}>{user ? 'Add your dog first' : 'Sign in to start a group'}</Heading>
        <PinkButton
          label={user ? 'Set up my dog' : 'Sign in or sign up'}
          onPress={() => (user ? router.replace('/(tabs)/profile') : router.replace('/welcome'))}
          style={styles.gateBtn}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Start a group" onBack={goBack} backLabel="Back to Pack Days" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            A Pack Day that repeats. Neighbors join the group and get a nudge each time the next one is posted.
          </Text>

          <Paper tape style={styles.card}>
            <Heading size={22}>What</Heading>
            <View style={styles.field}>
              <Text style={styles.label}>Group name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={60}
                placeholder="Riverside Sunday Pack"
                placeholderTextColor={colors.brownLight}
                accessibilityLabel="Group name"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Tags <Text style={styles.optional}>(up to {PACK_GROUP_LIMITS.maxTags})</Text></Text>
              <View style={styles.chipRow}>
                {PACK_GROUP_TAG_SUGGESTIONS.map((t) => (
                  <Chip key={t} label={t} active={tags.includes(t)} onPress={() => toggleTag(t)} />
                ))}
                {tags.filter((t) => !(PACK_GROUP_TAG_SUGGESTIONS as readonly string[]).includes(t)).map((t) => (
                  <Chip key={t} label={t} active onPress={() => toggleTag(t)} />
                ))}
              </View>
              <View style={styles.tagRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={customTag}
                  onChangeText={setCustomTag}
                  maxLength={PACK_GROUP_LIMITS.maxTagLength}
                  placeholder="Your own, like Corgis"
                  placeholderTextColor={colors.brownLight}
                  onSubmitEditing={addCustomTag}
                  returnKeyType="done"
                  accessibilityLabel="Add your own tag"
                />
                <PaperButton small label="Add" onPress={addCustomTag} />
              </View>
              {smallDogsOnly && <Text style={styles.help}>Only small dogs will be able to save a spot.</Text>}
            </View>
          </Paper>

          <Paper style={styles.card}>
            <Heading size={22}>When</Heading>
            <View style={styles.field}>
              <Text style={styles.label}>How often</Text>
              <View style={styles.chipRow}>
                {(Object.keys(PACK_GROUP_FREQUENCY_LABELS) as PackGroupFrequency[]).map((f) => (
                  <Chip key={f} label={PACK_GROUP_FREQUENCY_LABELS[f]} active={frequency === f} onPress={() => setFrequency(f)} />
                ))}
              </View>
              <Text style={styles.help}>
                It repeats on the same weekday as your first date{frequency === 'monthly' ? ', in the same week of the month' : ''}.
              </Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>First meetup</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
                {days.map((d) => <Chip key={d.value} label={d.label} active={date === d.value} onPress={() => setDate(d.value)} />)}
              </ScrollView>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Start time</Text>
              <View style={styles.chipRow}>
                {HOURS.map((h) => <Chip key={h} label={hourLabel(h)} active={hour === h} onPress={() => setHour(h)} />)}
              </View>
              <View style={styles.chipRow}>
                {MINUTES.map((m) => <Chip key={m} label={`:${String(m).padStart(2, '0')}`} active={minute === m} onPress={() => setMinute(m)} />)}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>How long</Text>
              <View style={styles.chipRow}>
                {PACK_DAY_LIMITS.durationOptions.map((m) => <Chip key={m} label={`${m} min`} active={duration === m} onPress={() => setDuration(m)} />)}
              </View>
            </View>
            <View style={styles.whenPreview}>
              <Glyph name="calendar-month" size={22} />
              <Text style={styles.whenPreviewText}>
                {date ? `${formatPackDayWhen({ localDate: date, localTime: time })} · ${duration} min` : 'Pick a day above'}
              </Text>
            </View>
          </Paper>

          <Paper style={styles.card}>
            <Heading size={22}>Where and how many</Heading>
            <View style={styles.field}>
              <Text style={styles.label}>Max dogs</Text>
              <View style={styles.chipRow}>
                {CAPACITIES.map((n) => <Chip key={n} label={String(n)} active={capacity === n} onPress={() => setCapacity(n)} />)}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Where</Text>
              <TextInput
                style={styles.input}
                value={placeName}
                onChangeText={setPlaceName}
                maxLength={PACK_DAY_LIMITS.maxPlaceLength}
                placeholder="Riverside Park, main entrance"
                placeholderTextColor={colors.brownLight}
                accessibilityLabel="Where"
              />
              <Text style={styles.help}>A public spot, never your home. Meets in {profile?.city || 'your city'}.</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Note <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={[styles.input, { minHeight: 92 }]}
                value={note}
                onChangeText={setNote}
                maxLength={PACK_DAY_LIMITS.maxNoteLength}
                placeholder="Where to park, which gate, bring water…"
                placeholderTextColor={colors.brownLight}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Note, optional"
              />
              <Text style={styles.help}>No links or phone numbers.</Text>
            </View>
          </Paper>

          <Paper style={styles.card}>
            <PackDayRules
              accepted={accepted}
              onChange={setAccepted}
              agreeLabel="I’ll follow these rules and remind people who join."
              footer={<Text style={styles.help}>GoDoggyDate doesn’t verify dogs or owners, and the host isn’t responsible for other people’s dogs.</Text>}
            />
          </Paper>

          {error && <Slip tone="error">{error}</Slip>}
          <PinkButton label={busy ? 'Creating…' : 'Start the group'} icon="tree" onPress={() => void handleSubmit()} disabled={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  center: { flex: 1, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center', padding: 32 },
  gateIcon: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  gateTitle: { textAlign: 'center', marginBottom: 18 },
  gateBtn: { alignSelf: 'stretch' },
  content: { padding: 16, paddingTop: 4, paddingBottom: 48, gap: 20 },
  intro: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink },
  card: { gap: 16 },
  field: { gap: 8 },
  label: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  optional: { fontFamily: fonts.bold, color: colors.brownMid },
  input: {
    borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.bold, fontSize: 16, color: colors.ink,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  help: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayRow: { gap: 8, paddingRight: 18, paddingVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', minHeight: 40, borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.cream, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  chipTextActive: { color: colors.cream },
  whenPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.creamDark, borderRadius: 14,
    borderLeftWidth: 4, borderLeftColor: colors.ink, paddingHorizontal: 14, paddingVertical: 12,
  },
  whenPreviewText: { flex: 1, fontFamily: fonts.black, fontSize: 15, color: colors.ink },
});
