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
import { colors, fonts, radius, shadow } from '../../constants/theme';
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
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
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!user || !profileComplete) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.gateEmoji}>🐶</Text>
        <Text style={styles.gateTitle}>{user ? 'Add your dog first' : 'Sign in to host a Pack Day'}</Text>
        <Pressable
          style={styles.submitBtn}
          onPress={() => (user ? router.replace('/(tabs)/profile') : router.replace('/welcome'))}
        >
          <Text style={styles.submitText}>{user ? 'Set up my dog' : 'Sign in or sign up'}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const selectedFormat = PACK_DAY_FORMATS[format];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={goBack} accessibilityRole="button" accessibilityLabel="Back to Pack Days">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Host a Pack Day</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Format</Text>
            <View style={styles.chipRow}>
              {PACK_DAY_FORMAT_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={`${PACK_DAY_FORMATS[key].emoji} ${PACK_DAY_FORMATS[key].label}`}
                  active={format === key}
                  onPress={() => setFormat(key)}
                />
              ))}
            </View>
            <Text style={styles.help}>{selectedFormat.blurb}</Text>
          </View>

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
            <Text style={styles.whenPreviewText}>
              {date
                ? `📅 ${formatPackDayWhen({ localDate: date, localTime: time })} · ${duration} min`
                : '📅 Pick a day above'}
            </Text>
          </View>

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
            />
            <Text style={styles.help}>No links or phone numbers. Members who match after you meet can message each other in the app.</Text>
          </View>

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

          {error && (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.submitBtn, styles.submitFull, busy && styles.disabled]}
            onPress={() => void handleSubmit()}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>{busy ? 'Creating…' : 'Create Pack Day'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: 32 },
  gateEmoji: { fontSize: 56, marginBottom: 12 },
  gateTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.brown, marginBottom: 16, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', backgroundColor: colors.cream,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: colors.brownLight, marginTop: -2 },
  headerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.brown, marginLeft: 4 },
  content: { padding: 18, paddingBottom: 48, gap: 20 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  labelOptional: { fontFamily: fonts.body, color: colors.brownLight },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brown,
  },
  inputMultiline: { minHeight: 88 },
  help: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.brownLight },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  minuteRow: { marginTop: 2 },
  dayRow: { gap: 6, paddingRight: 18 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown },
  chipTextActive: { color: colors.white },
  whenPreview: {
    backgroundColor: colors.creamDark,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  whenPreviewText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown },
  smallPrint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.brownLight },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#B91C1C' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  submitFull: { alignSelf: 'stretch', paddingVertical: 16 },
  submitText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  disabled: { opacity: 0.6 },
});
