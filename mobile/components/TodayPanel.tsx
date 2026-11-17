// mobile/components/TodayPanel.tsx
// "Today" — the Discover tab's front door when the deck has nothing to show.
// Mirrors web/components/TodayPanel.tsx.
//
// Every row reads from a real document or a real computed value:
//   • dogs/{uid}/reminders — Cadence, via lib/reminders.ts (its own listener and
//     its own completeReminder; nothing is re-implemented here).
//   • the owner's own dog doc — profile completeness, the Safety declarations,
//     and the server-assigned foundingPackNumber.
// Nothing is inferred, counted across users, or estimated. The other half of
// that rule: when nothing is due and the profile has no gaps, both variants
// render nothing rather than inventing a streak, a stat or an activity feed.

import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { completeReminder, onReminders } from '../lib/reminders';
import { isProfileComplete, type SavedDogProfile } from '../lib/profile';
import { trackEvent } from '../lib/analytics';
import { playdateSafetyUrl } from '../lib/webLinks';
import type { Reminder } from '../../shared/types';
import { reminderDueLabel } from '../../shared/dates';
import { foundingBadgeLabel } from '../../shared/founding';

interface Props {
  dogId: string;
  profile: SavedDogProfile | null;
  /**
   * 'full'  — the deck has nothing to show, so the panel can own the screen.
   * 'strip' — the deck has cards; one line, and only for something already due.
   *           Swiping is the job in that state, so only a date that has
   *           actually arrived earns space above it.
   */
  variant: 'full' | 'strip';
  /** Takes the owner to where the profile (and its Safety section) is edited. */
  onEditProfile: () => void;
  /** Takes the owner to the full reminders list. */
  onOpenReminders: () => void;
}

/** How many due rows the full panel lists before collapsing to a count. */
const MAX_DUE_ROWS = 3;

interface ProfilePrompt {
  title: string;
  body: string;
  cta: string;
  event: string;
}

/**
 * The only two profile gaps worth interrupting the front door for, both read
 * straight off the dog doc. Same rules as web.
 *
 * The Safety test is `undefined`, not "empty": the profile editor writes
 * notGoodWith and behaviorFlags together as arrays on every save, so an empty
 * array is a real answer ("I looked, nothing applies") and is never nagged.
 * Absent fields mean the doc predates the Safety section.
 */
function buildProfilePrompt(profile: SavedDogProfile | null): ProfilePrompt | null {
  if (!profile) return null;

  if (!isProfileComplete(profile)) {
    return {
      title: 'Your profile isn’t finished',
      // Verified, not motivational: fetchDiscoverFeed filters every candidate
      // through isProfileComplete, so an incomplete profile is genuinely
      // absent from everyone else's deck.
      body: 'Until it is, other dogs can’t see you in their deck at all.',
      cta: 'Finish the profile',
      event: 'today_profile_incomplete_click',
    };
  }

  const safetyNeverAnswered =
    profile.notGoodWith === undefined || profile.behaviorFlags === undefined;
  if (safetyNeverAnswered) {
    return {
      title: `Add ${profile.name || 'your dog'}’s safety notes`,
      body: 'Only what you tell us there can warn another owner before a meetup.',
      cta: 'Open the Safety section',
      event: 'today_safety_prompt_click',
    };
  }

  return null;
}

export default function TodayPanel({ dogId, profile, variant, onEditProfile, onOpenReminders }: Props) {
  // null = the first snapshot hasn't landed yet (distinct from "no reminders").
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; streak: number | null } | null>(null);

  useEffect(() => {
    if (!dogId) return;
    setReminders(null);
    return onReminders(dogId, setReminders);
  }, [dogId]);

  // The completion confirmation is the last thing keeping the strip mounted
  // when it was the last due item, so it clears itself rather than lingering.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(timer);
  }, [done]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const loading = reminders === null;
  const now = Date.now();
  // reminderDueLabel counts whole local calendar days — the same rule
  // completeReminder uses to judge on-time — and owns the wording, so a
  // reminder can't describe itself two ways on two tabs.
  const dated = (reminders ?? [])
    .map((reminder) => ({ reminder, due: reminderDueLabel(reminder.dueDate, now) }))
    .sort((a, b) => a.reminder.dueDate - b.reminder.dueDate);

  // Overdue, today, tomorrow. Tomorrow counts because "buy the heartworm pill"
  // is a today action for a tomorrow date.
  const dueSoon = dated.filter((entry) => entry.due.days <= 1);
  const arrived = dueSoon.filter((entry) => entry.due.days <= 0);
  // Shown only when the panel is already up for another reason — a date weeks
  // out is not a reason to occupy the landing tab.
  const nextUp = dated.find((entry) => entry.due.days > 1) ?? null;
  const profilePrompt = buildProfilePrompt(profile);

  async function handleComplete(reminder: Reminder) {
    setBusyId(reminder.id);
    setError(null);
    try {
      const result = await completeReminder(dogId, reminder);
      // completeReminder returns null for one-time reminders (it deletes them)
      // and the freshly computed streak for recurring ones. That returned
      // number is the only streak shown — never a stored count.
      setDone({ label: reminder.label, streak: result?.streak ?? null });
      trackEvent('reminder_completed', { source: `today_${variant}`, type: reminder.type });
    } catch {
      setError('Could not mark that done. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  function handleProfilePress(prompt: ProfilePrompt) {
    trackEvent(prompt.event, { source: 'today_panel' });
    onEditProfile();
  }

  function openSafetyGuide() {
    Linking.openURL(playdateSafetyUrl()).catch(() => {});
  }

  const doneLine = done
    ? done.streak !== null && done.streak >= 2
      // Only a real streak (2+ consecutive on-time completions of THIS
      // reminder) is worth saying out loud.
      ? `${done.label} done · 🔥 ${done.streak} in a row`
      : `${done.label} done.`
    : null;

  // ── Compact strip (deck has cards) ──────────────────────────────────────
  if (variant === 'strip') {
    // Never flash a bar in and out above a live deck while the snapshot loads.
    if (loading) return null;
    if (arrived.length === 0 && !doneLine && !error) return null;

    const first = arrived[0];
    return (
      <View style={styles.strip}>
        <Text style={styles.stripText} numberOfLines={1}>
          {doneLine ?? error ?? (
            <>
              <Text style={styles.stripDue}>{first.due.text}</Text>
              {` · ${first.reminder.label}`}
              {arrived.length > 1 ? ` · +${arrived.length - 1} more` : ''}
            </>
          )}
        </Text>
        {!doneLine && first && (
          <Pressable
            onPress={() => handleComplete(first.reminder)}
            disabled={busyId === first.reminder.id}
            style={[styles.doneBtn, busyId === first.reminder.id && styles.doneBtnBusy]}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${first.reminder.label} done`}
          >
            <Text style={styles.doneBtnText}>{busyId === first.reminder.id ? '…' : 'Done'}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ── Full panel (deck has nothing to show) ───────────────────────────────
  // While the snapshot is still in flight, render only if there's already
  // something true to say from the profile doc; otherwise nothing, so an empty
  // Discover never flashes a panel that resolves to nothing.
  if (loading && !profilePrompt) return null;
  if (!loading && dueSoon.length === 0 && !profilePrompt && !doneLine && !error) return null;

  const visibleDue = dueSoon.slice(0, MAX_DUE_ROWS);
  const hiddenDue = dueSoon.length - visibleDue.length;
  const dogName = profile?.name?.trim();
  const foundingNumber = profile?.foundingPackNumber;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Pressable onPress={onOpenReminders} hitSlop={8} accessibilityRole="button">
          <Text style={styles.headerLink}>All reminders</Text>
        </Pressable>
      </View>

      {loading && (
        <View style={styles.row}>
          <Text style={styles.muted}>Checking reminders…</Text>
        </View>
      )}

      {visibleDue.map(({ reminder, due }) => (
        <View key={reminder.id} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowLabel} numberOfLines={1}>{reminder.label}</Text>
            <Text style={[styles.rowDue, due.days <= 0 && styles.rowDueUrgent]}>
              {due.text}
              {reminder.recurrenceDays ? ' · repeats' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => handleComplete(reminder)}
            disabled={busyId === reminder.id}
            style={[styles.doneBtn, busyId === reminder.id && styles.doneBtnBusy]}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${reminder.label} done`}
          >
            <Text style={styles.doneBtnText}>{busyId === reminder.id ? '…' : 'Done'}</Text>
          </Pressable>
        </View>
      ))}

      {hiddenDue > 0 && (
        <Pressable style={styles.row} onPress={onOpenReminders} accessibilityRole="button">
          <Text style={styles.muted}>+{hiddenDue} more due</Text>
        </Pressable>
      )}

      {nextUp && (dueSoon.length > 0 || profilePrompt) && (
        <View style={styles.row}>
          <Text style={styles.muted}>
            <Text style={styles.nextUpLabel}>Next up:</Text> {nextUp.reminder.label} · {nextUp.due.text}
          </Text>
        </View>
      )}

      {profilePrompt && (
        <View style={[styles.row, styles.promptRow]}>
          <Text style={styles.promptTitle}>{profilePrompt.title}</Text>
          <Text style={styles.promptBody}>{profilePrompt.body}</Text>
          <Pressable onPress={() => handleProfilePress(profilePrompt)} hitSlop={6} accessibilityRole="button">
            <Text style={styles.promptCta}>{profilePrompt.cta}</Text>
          </Pressable>
        </View>
      )}

      {/* Server-assigned (a free spot when the profile was created, or a $39
          purchase) — a real number on a real document, or no row at all. */}
      {typeof foundingNumber === 'number' && (
        <View style={styles.row}>
          <Text style={styles.muted}>
            <Text style={styles.foundingLabel}>{foundingBadgeLabel(foundingNumber)}</Text>
            {dogName ? ` · ${dogName}’s number for good` : ''}
          </Text>
        </View>
      )}

      {doneLine && (
        <View style={styles.row}>
          <Text style={styles.doneLine}>{doneLine}</Text>
        </View>
      )}
      {error && (
        <View style={styles.row}>
          <Text style={styles.errorLine}>{error}</Text>
        </View>
      )}

      <Pressable style={styles.footer} onPress={openSafetyGuide} accessibilityRole="link">
        <Text style={styles.footerLink}>Play or fight? First-meeting safety reference →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full panel — same card language as RemindersSection on the profile tab.
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 14, color: colors.brown },
  headerLink: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 12, color: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 13, color: colors.brown },
  rowDue: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 2 },
  rowDueUrgent: { fontFamily: fonts.semibold, fontWeight: '600', color: '#DC2626' },
  muted: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 17 },
  nextUpLabel: { fontFamily: fonts.semibold, fontWeight: '600', color: colors.brownMid },
  promptRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    backgroundColor: 'rgba(245,183,49,0.10)',
  },
  promptTitle: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 13, color: colors.brown },
  promptBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.brownLight },
  promptCta: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 6,
  },
  foundingLabel: { fontFamily: fonts.bold, fontWeight: '700', color: colors.brown },
  doneLine: { flex: 1, fontFamily: fonts.semibold, fontWeight: '600', fontSize: 12, color: '#1F7A4D' },
  errorLine: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: '#DC2626' },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(245,230,211,0.35)',
  },
  footerLink: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 12,
    color: colors.brownMid,
    textDecorationLine: 'underline',
  },

  // Done button — matches RemindersSection.
  doneBtn: {
    backgroundColor: '#E2F2E9',
    borderWidth: 1,
    borderColor: '#BBE3CC',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  doneBtnBusy: { opacity: 0.5 },
  doneBtnText: { fontFamily: fonts.bold, fontWeight: '700', fontSize: 11, color: '#1F7A4D' },

  // Strip — one line above a live deck.
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(245,183,49,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.25)',
  },
  stripText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.brown },
  stripDue: { fontFamily: fonts.bold, fontWeight: '700' },
});
