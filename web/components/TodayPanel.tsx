'use client';
// web/components/TodayPanel.tsx
// "Today" — the Discover tab's front door when the deck has nothing to show.
//
// Every row here reads from a real document or a real computed value:
//   • dogs/{uid}/reminders — Cadence, via lib/reminders.ts (its own queries,
//     its own completeReminder; nothing is re-implemented here).
//   • the owner's own dog doc — profile completeness, the Safety declarations,
//     and the server-assigned foundingPackNumber.
// Nothing is inferred, counted across users, or estimated. That is deliberate:
// at ~4 real dogs anything social would be a lie, and the one thing that IS
// real and recurring (Cadence) was buried on the profile tab.
//
// The other half of that rule is the collapse: when nothing is due and the
// profile has no gaps, this renders null rather than inventing a streak, a
// stat or an activity feed. Discover gets the whole screen back.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { completeReminder, onReminders } from '../lib/reminders';
import { isProfileComplete } from '../lib/auth';
import type { SavedDogProfile } from '../lib/auth';
import { trackEvent } from '../lib/analytics';
import type { Reminder } from '../../shared/types';

interface Props {
  dogId: string;
  savedProfile: SavedDogProfile | null;
  /**
   * 'full'  — the deck has nothing to show, so the panel can own the screen.
   * 'strip' — the deck has cards; one line, and only for something already due.
   *           Swiping is the job in that state, so only a date that has
   *           actually arrived earns space above it.
   */
  variant: 'full' | 'strip';
  /** Opens the host's profile form overlay. */
  onEditProfile: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many due rows the full panel lists before collapsing to a count. */
const MAX_DUE_ROWS = 3;

/**
 * Start of the local calendar day containing `ms`. Same rule completeReminder()
 * uses to judge on-time: "due today" is a wall-clock idea in the owner's own
 * timezone, so the two surfaces must not disagree about which day it is.
 */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole local calendar days from today to the due date. 0 = today, -1 = yesterday. */
function daysUntilDue(dueDate: number, now: number): number {
  return Math.round((startOfLocalDay(dueDate) - startOfLocalDay(now)) / DAY_MS);
}

// Wording matches RemindersSection so the same reminder doesn't describe itself
// two different ways on two tabs.
function dueText(days: number, dueDate: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

interface ProfilePrompt {
  title: string;
  body: string;
  cta: string;
  event: string;
}

/**
 * The only two profile gaps worth interrupting the front door for, both read
 * straight off the dog doc.
 *
 * The Safety test is `undefined`, not "empty": DogProfileForm writes
 * notGoodWith and behaviorFlags together as arrays on every save, so an empty
 * array is a real answer ("I looked, nothing applies") and must never be
 * nagged. Absent fields mean the doc predates the Safety section — this owner
 * was genuinely never asked.
 */
function buildProfilePrompt(profile: SavedDogProfile | null): ProfilePrompt | null {
  if (!profile) return null;

  if (!isProfileComplete(profile)) {
    return {
      title: 'Your profile isn’t finished',
      // Verified, not motivational: getRealCandidateDogs() in lib/discover.ts
      // filters every candidate through isProfileComplete, so an incomplete
      // profile is genuinely absent from everyone else's deck.
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

export default function TodayPanel({ dogId, savedProfile, variant, onEditProfile }: Props) {
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

  // The completion confirmation is the last thing keeping the panel mounted
  // when it was the last due item, so it clears itself rather than lingering.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(timer);
  }, [done]);

  // The strip has one line to work with, so a failed write would otherwise sit
  // on top of what's actually due until the next attempt.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const loading = reminders === null;
  const now = Date.now();
  const dated = (reminders ?? [])
    .map((reminder) => ({ reminder, days: daysUntilDue(reminder.dueDate, now) }))
    .sort((a, b) => a.reminder.dueDate - b.reminder.dueDate);

  // Overdue, today, tomorrow. Tomorrow counts because "buy the heartworm pill"
  // is a today action for a tomorrow date.
  const dueSoon = dated.filter((entry) => entry.days <= 1);
  const arrived = dueSoon.filter((entry) => entry.days <= 0);
  // Shown only when the panel is already up for another reason — a date three
  // weeks out is not a reason to occupy the landing tab.
  const nextUp = dated.find((entry) => entry.days > 1) ?? null;
  const profilePrompt = buildProfilePrompt(savedProfile);

  async function handleComplete(reminder: Reminder) {
    setBusyId(reminder.id);
    setError(null);
    try {
      const result = await completeReminder(dogId, reminder);
      // completeReminder returns null for one-time reminders (it deletes them)
      // and the freshly computed streak for recurring ones. That returned
      // number is the only streak we display — never a stored count.
      setDone({ label: reminder.label, streak: result?.streak ?? null });
      trackEvent('reminder_completed', { source: `today_${variant}`, type: reminder.type });
    } catch {
      setError('Could not mark that done. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  function handleProfileClick(prompt: ProfilePrompt) {
    trackEvent(prompt.event, { source: 'today_panel' });
    onEditProfile();
  }

  const doneLine = done
    ? done.streak !== null && done.streak >= 2
      // Only a real streak (2+ consecutive on-time completions of THIS
      // reminder) is worth saying out loud — one completion isn't a streak,
      // and a late completion resets to 0.
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
      <div className="mx-auto mb-2 flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-left text-xs text-brown">
          {doneLine ?? error ?? (
            <>
              <span className="font-bold">{dueText(first.days, first.reminder.dueDate)}</span>
              {` · ${first.reminder.label}`}
              {arrived.length > 1 && ` · +${arrived.length - 1} more`}
            </>
          )}
        </p>
        {!doneLine && first && (
          <button
            type="button"
            onClick={() => handleComplete(first.reminder)}
            disabled={busyId === first.reminder.id}
            className="shrink-0 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700 disabled:opacity-50"
          >
            {busyId === first.reminder.id ? '…' : 'Done'}
          </button>
        )}
      </div>
    );
  }

  // ── Full panel (deck has nothing to show) ───────────────────────────────
  // While the snapshot is still in flight we only render if there's already
  // something true to say from the profile doc; otherwise nothing, so an
  // empty Discover never flashes a skeleton that resolves to nothing.
  if (loading && !profilePrompt) return null;
  if (!loading && dueSoon.length === 0 && !profilePrompt && !doneLine && !error) return null;

  const visibleDue = dueSoon.slice(0, MAX_DUE_ROWS);
  const hiddenDue = dueSoon.length - visibleDue.length;
  const dogName = savedProfile?.name?.trim();

  return (
    <section className="card mx-auto mb-4 w-full max-w-sm overflow-hidden rounded-[1.5rem] text-left">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-bold text-brown">Today</p>
        <Link
          href="/app/profile"
          className="text-xs font-bold text-primary transition-colors hover:text-primary/80"
        >
          All reminders
        </Link>
      </div>

      <div className="divide-y divide-border">
        {loading && (
          <p className="px-4 py-3 text-xs text-brown-light">Checking reminders…</p>
        )}

        {visibleDue.map(({ reminder, days }) => (
          <div key={reminder.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brown">{reminder.label}</p>
              <p className={`text-xs ${days <= 0 ? 'font-semibold text-red-600' : 'text-brown-light'}`}>
                {dueText(days, reminder.dueDate)}
                {reminder.recurrenceDays ? ' · repeats' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleComplete(reminder)}
              disabled={busyId === reminder.id}
              className="shrink-0 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 disabled:opacity-50"
            >
              {busyId === reminder.id ? '…' : 'Done'}
            </button>
          </div>
        ))}

        {hiddenDue > 0 && (
          <Link href="/app/profile" className="block px-4 py-2.5 text-xs text-brown-light">
            +{hiddenDue} more due
          </Link>
        )}

        {nextUp && (dueSoon.length > 0 || profilePrompt) && (
          <p className="px-4 py-2.5 text-xs text-brown-light">
            <span className="font-semibold text-brown-mid">Next up:</span>{' '}
            {nextUp.reminder.label} · {dueText(nextUp.days, nextUp.reminder.dueDate)}
          </p>
        )}

        {profilePrompt && (
          <div className="bg-amber-50/60 px-4 py-3">
            <p className="text-sm font-semibold text-brown">{profilePrompt.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-brown-light">{profilePrompt.body}</p>
            <button
              type="button"
              onClick={() => handleProfileClick(profilePrompt)}
              className="mt-2 text-xs font-bold text-primary underline underline-offset-2"
            >
              {profilePrompt.cta}
            </button>
          </div>
        )}

        {/* Server-assigned by the onDogProfileCreated trigger — a real number
            on a real document, or no row at all. */}
        {typeof savedProfile?.foundingPackNumber === 'number' && (
          <p className="px-4 py-2.5 text-xs text-brown-light">
            <span className="font-bold text-brown">
              🏅 Founding Pack #{savedProfile.foundingPackNumber}
            </span>
            {dogName ? ` · assigned when ${dogName}’s profile was created` : ''}
          </p>
        )}

        {doneLine && <p className="px-4 py-2.5 text-xs font-semibold text-green-700">{doneLine}</p>}
        {error && <p className="px-4 py-2.5 text-xs text-red-600">{error}</p>}
      </div>

      <div className="border-t border-border bg-cream-dark/30 px-4 py-3">
        <Link
          href="/playdate-safety"
          className="text-xs font-semibold text-brown-mid underline underline-offset-2 transition-colors hover:text-brown"
        >
          Play or fight? First-meeting safety reference →
        </Link>
      </div>
    </section>
  );
}
