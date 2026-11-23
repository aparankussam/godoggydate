// mobile/app/pack/new.tsx
// Host a Pack Day. Mirrors web/app/app/pack/new/page.tsx. The server
// (createPackDay) re-validates everything; the checks here are only so
// mistakes show up before the round trip.
//
// Date and time are chips rather than a native picker: no date-picker package
// is installed, and adding one means a new native build. Days run from today
// to the 30-day limit; times cover 6 AM to 9:45 PM in 15-minute steps, which
// is when public parks are open. The chosen wall-clock date and time are sent
// as localDate/localTime beside startsAtMs, exactly as web sends them.

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, Heading, Paper, PinkButton, Slip, type GlyphName } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import {
  createPackDay,
  packDayErrorMessage,
  packDayStartMs,
  toLocalDateString,
  toLocalTimeString,
} from '../../lib/packDay';
import { trackEvent } from '../../lib/analytics';
import PackDayRules from '../../components/PackDayRules';
import {
  PACK_DAY_FORMATS,
  PACK_DAY_FORMAT_KEYS,
  PACK_DAY_LIMITS,
  formatPackDayWhen,
} from '../../../shared/packDay';
import type { PackDayFormat } from '../../../shared/packDay';
import { CONTENT_FILTER_MESSAGE, checkContentFields } from '../../../shared/contentFilter';

const CAPACITIES = Array.from(
  { length: PACK_DAY_LIMITS.maxCapacity - PACK_DAY_LIMITS.minCapacity + 1 },
  (_, i) => PACK_DAY_LIMITS.minCapacity + i,
);

const HOURS = Array.from({ length: 16 }, (_, i) => 6 + i); // 6 AM – 9 PM
const MINUTES = [0, 15, 30, 45];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Today through the last day the server accepts, in the device's calendar. */
function upcomingDays(): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: PACK_DAY_LIMITS.maxLeadDays + 1 }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label =
      i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${WEEKDAYS[day.getDay()]} ${day.getMonth() + 1}/${day.getDate()}`;
    return { value: toLocalDateString(day), label };
  });
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/pack');
}

function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: GlyphName }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {icon && <Glyph name={icon} size={16} color={active ? colors.cream : colors.ink} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function NewPackDayScreen() {
  const { user, profile, profileComplete, loading: sessionLoading } = useSession();
  const days = useMemo(upcomingDays, []);

  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<PackDayFormat>('pack-walk');
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

  async function handleSubmit() {
    if (busy) return;
    setError(null);

    if (!title.trim() || !placeName.trim()) {
      setError('Add a title and a place.');
      return;
    }
    const startsAtMs = date ? packDayStartMs(date, time) : null;
    if (!date || !time || startsAtMs === null) {
      setError('Pick a date and time.');
      return;
    }
    if (startsAtMs < Date.now() + PACK_DAY_LIMITS.minLeadMinutes * 60_000) {
      setError('Start time must be at least an hour from now, so people have notice.');
      return;
    }
    if (startsAtMs > Date.now() + PACK_DAY_LIMITS.maxLeadDays * DAY_MS) {
      setError(`You can schedule up to ${PACK_DAY_LIMITS.maxLeadDays} days ahead.`);
      return;
    }
    if (!accepted) {
      setError('Please agree to the Pack Day rules.');
      return;
    }
    if (!checkContentFields([title, placeName, note]).ok) {
      setError(CONTENT_FILTER_MESSAGE);
      return;
    }

    setBusy(true);
    try {
      const eventId = await createPackDay({
        title: title.trim(),
        format,
        startsAtMs,
        durationMinutes: duration,
        localDate: date,
        localTime: time,
        placeName: placeName.trim(),
        note: note.trim(),
        capacity,
        acceptedRules: true,
      });
      trackEvent('packday_created', { format, capacity });
      // Replace, so Back from the new event returns to the list, not the form.
      router.replace({ pathname: '/pack/[id]', params: { id: eventId, new: '1' } });
    } catch (err) {
      setError(packDayErrorMessage(err, 'We couldn’t create your Pack Day. Try again.'));
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
        <Heading size={26} style={styles.gateTitle}>{user ? 'Add your dog first' : 'Sign in to host a Pack Day'}</Heading>
        <PinkButton
          label={user ? 'Set up my dog' : 'Sign in or sign up'}
          onPress={() => (user ? router.replace('/(tabs)/profile') : router.replace('/welcome'))}
          style={styles.gateBtn}
        />
      </SafeAreaView>
    );
  }

  const selectedFormat = PACK_DAY_FORMATS[format];

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Host a Pack Day" onBack={goBack} backLabel="Back to Pack Days" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Pick a public place and a time. Neighbors with dogs can see it and save a spot.
          </Text>

          <Paper tape style={styles.card}>
            <Heading size={22}>What</Heading>
            <View style={styles.field}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                maxLength={PACK_DAY_LIMITS.maxTitleLength}
                placeholder="Saturday morning loop"
                placeholderTextColor={colors.brownLight}
                returnKeyType="done"
                accessibilityLabel="Title"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Format</Text>
              <View style={styles.chipRow}>
                {PACK_DAY_FORMAT_KEYS.map((key) => (
                  <Chip
                    key={key}
                    label={PACK_DAY_FORMATS[key].label}
                    icon="tree"
                    active={format === key}
                    onPress={() => setFormat(key)}
                  />
                ))}
              </View>
              <Text style={styles.help}>{selectedFormat.blurb}</Text>
            </View>
          </Paper>

          <Paper style={styles.card}>
            <Heading size={22}>When</Heading>
            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayRow}
              >
                {days.map((d) => (
                  <Chip key={d.value} label={d.label} active={date === d.value} onPress={() => setDate(d.value)} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Start time</Text>
              <View style={styles.chipRow}>
                {HOURS.map((h) => (
                  <Chip key={h} label={hourLabel(h)} active={hour === h} onPress={() => setHour(h)} />
                ))}
              </View>
              <View style={[styles.chipRow, styles.minuteRow]}>
                {MINUTES.map((m) => (
                  <Chip key={m} label={`:${String(m).padStart(2, '0')}`} active={minute === m} onPress={() => setMinute(m)} />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>How long</Text>
              <View style={styles.chipRow}>
                {PACK_DAY_LIMITS.durationOptions.map((m) => (
                  <Chip key={m} label={`${m} min`} active={duration === m} onPress={() => setDuration(m)} />
                ))}
              </View>
            </View>

            <View style={styles.whenPreview}>
              <Glyph name="calendar-month" size={22} />
              <Text style={styles.whenPreviewText}>
                {date
                  ? `${formatPackDayWhen({ localDate: date, localTime: time })} · ${duration} min`
                  : 'Pick a day above'}
              </Text>
            </View>
          </Paper>

          <Paper style={styles.card}>
            <Heading size={22}>Where and how many</Heading>
            <View style={styles.field}>
              <Text style={styles.label}>Max dogs</Text>
              <View style={styles.chipRow}>
                {CAPACITIES.map((n) => (
                  <Chip key={n} label={String(n)} active={capacity === n} onPress={() => setCapacity(n)} />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Where</Text>
              <TextInput
                style={styles.input}
                value={placeName}
                onChangeText={setPlaceName}
                maxLength={PACK_DAY_LIMITS.maxPlaceLength}
                placeholder="Cedar Park, main entrance"
                placeholderTextColor={colors.brownLight}
                returnKeyType="done"
                accessibilityLabel="Where"
              />
              <Text style={styles.help}>
                A park, trail or other public spot. Never your home address. Meets in {profile?.city || 'your city'}.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Note <Text style={styles.labelOptional}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={note}
                onChangeText={setNote}
                maxLength={PACK_DAY_LIMITS.maxNoteLength}
                placeholder="Where to park, which gate, bring water…"
                placeholderTextColor={colors.brownLight}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Note, optional"
              />
              <Text style={styles.help}>No links or phone numbers. Members who match after you meet can message each other in the app.</Text>
            </View>
          </Paper>

          <Paper style={styles.card}>
            <PackDayRules
              accepted={accepted}
              onChange={setAccepted}
              agreeLabel="I’ll follow these rules and remind people who join."
              footer={
                <Text style={styles.smallPrint}>
                  GoDoggyDate doesn’t verify dogs or owners, and the host isn’t responsible for other people’s dogs.
                </Text>
              }
            />
          </Paper>

          {error && <Slip tone="error">{error}</Slip>}

          <PinkButton
            label={busy ? 'Creating…' : 'Create Pack Day'}
            icon="tree"
            onPress={() => void handleSubmit()}
            disabled={busy}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  center: { flex: 1, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center', padding: 32 },
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
  content: { padding: 16, paddingTop: 4, paddingBottom: 48, gap: 20 },
  intro: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink },
  card: { gap: 16 },
  field: { gap: 8 },
  label: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  labelOptional: { fontFamily: fonts.bold, color: colors.brownMid },
  input: {
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  inputMultiline: { minHeight: 92 },
  help: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  minuteRow: { marginTop: 2 },
  dayRow: { gap: 8, paddingRight: 18, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  chipTextActive: { color: colors.cream },
  whenPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.creamDark,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  whenPreviewText: { flex: 1, fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  smallPrint: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
});
