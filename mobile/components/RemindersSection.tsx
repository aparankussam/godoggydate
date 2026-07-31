// mobile/components/RemindersSection.tsx
// Mirrors web/components/RemindersSection.tsx — Cadence. Uses quick-pick
// interval chips instead of a native date picker: no
// @react-native-community/datetimepicker dependency exists in this project
// yet, and adding one needs a native rebuild that can't be verified in this
// pass, so due dates are set via relative intervals (works for every preset
// except a truly arbitrary date, which falls back to typed month/day/year).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { REMINDER_PRESETS, completeReminder, createReminder, deleteReminder } from '../lib/reminders';
import type { Reminder, ReminderType } from '../../shared/types';

interface Props {
  dogId: string;
  reminders: Reminder[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const QUICK_PICKS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '1 year', days: 365 },
];

function dueLabel(dueDate: number): { text: string; urgent: boolean } {
  const days = Math.round((dueDate - Date.now()) / DAY_MS);
  if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, urgent: true };
  if (days === 0) return { text: 'Due today', urgent: true };
  if (days === 1) return { text: 'Due tomorrow', urgent: true };
  if (days <= 7) return { text: `Due in ${days} days`, urgent: false };
  return { text: `Due ${new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, urgent: false };
}

export default function RemindersSection({ dogId, reminders }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [presetType, setPresetType] = useState<ReminderType>('heartworm');
  const [customLabel, setCustomLabel] = useState('');
  const [dueDateMs, setDueDateMs] = useState(Date.now() + 30 * DAY_MS);
  const [customMonth, setCustomMonth] = useState('');
  const [customDay, setCustomDay] = useState('');
  const [customYear, setCustomYear] = useState('');
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [repeats, setRepeats] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const celebrateOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!celebrateId) return;
    celebrateOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(celebrateOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(celebrateOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setCelebrateId(null));
  }, [celebrateId, celebrateOpacity]);

  const preset = useMemo(() => REMINDER_PRESETS.find((p) => p.type === presetType) ?? REMINDER_PRESETS[0], [presetType]);
  const sorted = useMemo(() => [...reminders].sort((a, b) => a.dueDate - b.dueDate), [reminders]);

  async function handleAdd() {
    const label = presetType === 'custom' ? customLabel.trim() : preset.defaultLabel;
    if (!label) {
      setError('Give it a name');
      return;
    }

    let dueDate = dueDateMs;
    if (useCustomDate) {
      const m = parseInt(customMonth, 10);
      const d = parseInt(customDay, 10);
      const y = parseInt(customYear, 10);
      if (!m || !d || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 2020) {
        setError('Enter a valid month, day, and year');
        return;
      }
      // Range checks alone accept impossible dates: JS silently rolls them
      // over, so "02/30/2026" became March 2 without telling the user. Confirm
      // the constructed date reads back as the one they typed.
      const candidate = new Date(y, m - 1, d, 12);
      if (
        candidate.getFullYear() !== y ||
        candidate.getMonth() !== m - 1 ||
        candidate.getDate() !== d
      ) {
        setError(`There's no such date as ${m}/${d}/${y}`);
        return;
      }
      dueDate = candidate.getTime();
    }

    setSaving(true);
    setError(null);
    try {
      await createReminder(dogId, {
        label,
        type: presetType,
        dueDate,
        recurrenceDays: repeats ? preset.recurrenceDays : undefined,
      });
      setShowAdd(false);
      setCustomLabel('');
      setUseCustomDate(false);
    } catch {
      setError('Could not save — try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(reminder: Reminder) {
    setBusyId(reminder.id);
    try {
      const result = await completeReminder(dogId, reminder);
      // Only celebrate a REAL streak (2+ on-time completions in a row) —
      // a single completion isn't a streak yet, and a reset-to-0 (late
      // completion) shouldn't look like a win.
      if (result && result.streak >= 2) {
        setCelebrateId(reminder.id);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(reminder: Reminder) {
    setBusyId(reminder.id);
    try {
      await deleteReminder(dogId, reminder.id);
    } catch {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Reminders</Text>
          <Text style={styles.subtitle}>The dates nobody holds in their head</Text>
        </View>
        <Pressable onPress={() => setShowAdd((v) => !v)}>
          <Text style={styles.addLink}>{showAdd ? 'Cancel' : '+ Add'}</Text>
        </Pressable>
      </View>

      {showAdd && (
        <View style={styles.addForm}>
          <View style={styles.chipRow}>
            {REMINDER_PRESETS.map((p) => (
              <Pressable
                key={p.type}
                onPress={() => setPresetType(p.type)}
                style={[styles.presetChip, presetType === p.type && styles.presetChipActive]}
              >
                <Text style={[styles.presetChipText, presetType === p.type && styles.presetChipTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {presetType === 'custom' && (
            <TextInput
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder="e.g. Refill anxiety meds"
              placeholderTextColor={colors.brownLight}
              style={styles.input}
            />
          )}

          <Text style={styles.helpText}>{preset.helpText}</Text>

          {!useCustomDate ? (
            <>
              <View style={styles.chipRow}>
                {QUICK_PICKS.map((q) => {
                  const active = !useCustomDate && Math.abs(dueDateMs - (Date.now() + q.days * DAY_MS)) < DAY_MS;
                  return (
                    <Pressable
                      key={q.label}
                      onPress={() => setDueDateMs(Date.now() + q.days * DAY_MS)}
                      style={[styles.presetChip, active && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>In {q.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => setUseCustomDate(true)}>
                <Text style={styles.customDateLink}>Pick an exact date instead</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.dateRow}>
                <TextInput
                  value={customMonth}
                  onChangeText={setCustomMonth}
                  placeholder="MM"
                  placeholderTextColor={colors.brownLight}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[styles.input, styles.dateInput]}
                />
                <TextInput
                  value={customDay}
                  onChangeText={setCustomDay}
                  placeholder="DD"
                  placeholderTextColor={colors.brownLight}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[styles.input, styles.dateInput]}
                />
                <TextInput
                  value={customYear}
                  onChangeText={setCustomYear}
                  placeholder="YYYY"
                  placeholderTextColor={colors.brownLight}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={[styles.input, styles.dateInputYear]}
                />
              </View>
              <Pressable onPress={() => setUseCustomDate(false)}>
                <Text style={styles.customDateLink}>Use a quick pick instead</Text>
              </Pressable>
            </>
          )}

          {preset.recurrenceDays && (
            <Pressable style={styles.repeatsRow} onPress={() => setRepeats((v) => !v)}>
              <View style={[styles.checkbox, repeats && styles.checkboxChecked]}>
                {repeats && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.repeatsText}>Repeats</Text>
            </Pressable>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleAdd} disabled={saving}>
            <Text style={styles.submitText}>{saving ? 'Saving…' : 'Add reminder'}</Text>
          </Pressable>
        </View>
      )}

      {sorted.length === 0 && !showAdd && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing due yet — add your first reminder.</Text>
        </View>
      )}

      {sorted.map((r) => {
        const due = dueLabel(r.dueDate);
        const busy = busyId === r.id;
        const hasStreak = !!r.recurrenceDays && (r.currentStreak ?? 0) >= 2;
        return (
          <View key={r.id} style={styles.row}>
            {/* Streak celebration — a real, honest count (consecutive
                on-time completions of THIS recurring reminder, tracked
                forward from when currentStreak shipped), not a vanity
                number. Only fires on the completion that reaches 2+. */}
            {celebrateId === r.id && (
              <Animated.View
                style={[styles.celebrateOverlay, { opacity: celebrateOpacity }]}
                pointerEvents="none"
              >
                <Text style={styles.celebrateText}>🔥 🐾 🔥</Text>
              </Animated.View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={[styles.rowDue, due.urgent && styles.rowDueUrgent]}>
                {due.text}{r.recurrenceDays ? ' · repeats' : ''}
                {hasStreak && <Text style={styles.streakText}>  🔥 {r.currentStreak} in a row</Text>}
              </Text>
            </View>
            <Pressable
              onPress={() => handleComplete(r)}
              disabled={busy}
              style={[styles.doneBtn, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
            <Pressable onPress={() => handleDelete(r)} disabled={busy} hitSlop={8} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>×</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  subtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 2 },
  addLink: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  addForm: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.creamDark,
    gap: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  presetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetChipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brown },
  presetChipTextActive: { color: colors.white },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
  },
  helpText: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: { width: 56, textAlign: 'center' },
  dateInputYear: { width: 76, textAlign: 'center' },
  customDateLink: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryDark, textDecorationLine: 'underline' },
  repeatsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },
  repeatsText: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: '#DC2626' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 11, alignItems: 'center' },
  submitText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  empty: { padding: 20, alignItems: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    position: 'relative', overflow: 'hidden',
  },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown },
  rowDue: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 2 },
  rowDueUrgent: { color: '#DC2626', fontFamily: fonts.semibold },
  streakText: { fontFamily: fonts.bold, color: '#B45309' },
  celebrateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,251,235,0.92)', zIndex: 10,
  },
  celebrateText: { fontSize: 20 },
  doneBtn: {
    backgroundColor: '#E2F2E9', borderWidth: 1, borderColor: '#BBE3CC',
    borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7,
  },
  doneBtnText: { fontFamily: fonts.bold, fontSize: 11, color: '#1F7A4D' },
  deleteBtn: { paddingHorizontal: 4 },
  deleteBtnText: { fontSize: 18, color: colors.brownLight },
});
