// web/lib/reminders.ts
// Cadence — the one genuinely recurring reason to pay, per this week's
// strategy research: a calendar for the dog-care dates nobody holds in
// their head. Reminders live at dogs/{dogId}/reminders/{reminderId},
// owner-only (see firestore.rules). A scheduled Cloud Function
// (sendReminderNotifications) pushes a notification once per due date.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import type { Reminder, ReminderType } from '../../shared/types';

export interface ReminderPreset {
  type: ReminderType;
  label: string;
  defaultLabel: string;
  recurrenceDays?: number;
  helpText: string;
}

// Ordered as they'd realistically come up. Insurance is the "nobody else
// tracks this" item the research kept singling out.
export const REMINDER_PRESETS: ReminderPreset[] = [
  { type: 'heartworm',   label: 'Heartworm prevention', defaultLabel: 'Heartworm prevention',    recurrenceDays: 30,  helpText: 'Monthly' },
  { type: 'flea_tick',   label: 'Flea & tick',          defaultLabel: 'Flea & tick prevention',  recurrenceDays: 30,  helpText: 'Monthly' },
  { type: 'rabies',      label: 'Rabies booster',       defaultLabel: 'Rabies booster',          recurrenceDays: 365, helpText: 'Set to your vet-given expiry' },
  { type: 'booster',     label: 'Other booster',        defaultLabel: 'Booster shot',            recurrenceDays: 365, helpText: 'Annual' },
  { type: 'license',     label: 'License renewal',      defaultLabel: 'Dog license renewal',     recurrenceDays: 365, helpText: 'Annual' },
  { type: 'grooming',    label: 'Grooming',              defaultLabel: 'Grooming appointment',    recurrenceDays: 42,  helpText: 'Every 6 weeks' },
  { type: 'vet_visit',   label: 'Annual vet visit',      defaultLabel: 'Annual checkup',          recurrenceDays: 365, helpText: 'Annual' },
  { type: 'insurance_claim', label: 'Insurance claim window', defaultLabel: 'File insurance claim', helpText: 'One-time — set to your filing deadline' },
  { type: 'custom',      label: 'Something else',       defaultLabel: '',                        helpText: 'One-time or repeating' },
];

function toReminder(id: string, data: Record<string, unknown>): Reminder {
  const toMillis = (v: unknown): number | undefined => {
    if (v instanceof Timestamp) return v.toMillis();
    if (typeof v === 'number') return v;
    return undefined;
  };
  return {
    id,
    label: (data.label as string) ?? '',
    type: (data.type as ReminderType) ?? 'custom',
    dueDate: toMillis(data.dueDate) ?? Date.now(),
    recurrenceDays: typeof data.recurrenceDays === 'number' ? data.recurrenceDays : undefined,
    lastCompletedAt: toMillis(data.lastCompletedAt),
    notifiedAt: toMillis(data.notifiedAt),
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    currentStreak: typeof data.currentStreak === 'number' ? data.currentStreak : undefined,
  };
}

export function onReminders(dogId: string, callback: (reminders: Reminder[]) => void): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, 'dogs', dogId, 'reminders'), orderBy('dueDate', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => toReminder(d.id, d.data()))),
    () => callback([]),
  );
}

export interface CreateReminderInput {
  label: string;
  type: ReminderType;
  dueDate: number; // unix ms
  recurrenceDays?: number;
}

export async function createReminder(dogId: string, input: CreateReminderInput): Promise<void> {
  const { db } = getFirebase();
  await addDoc(collection(db, 'dogs', dogId, 'reminders'), {
    label: input.label.trim().slice(0, 80),
    type: input.type,
    dueDate: Timestamp.fromMillis(input.dueDate),
    ...(input.recurrenceDays ? { recurrenceDays: input.recurrenceDays } : {}),
    createdAt: serverTimestamp(),
  });
}

export async function deleteReminder(dogId: string, reminderId: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, 'dogs', dogId, 'reminders', reminderId));
}

// ── What currentStreak means (one definition, three writers) ────────────────
// currentStreak is the number of CONSECUTIVE occurrences of a recurring
// reminder that were completed on or before their due date, where "on or
// before" is judged by LOCAL CALENDAR DAY. Nothing else counts toward it and
// there is no retroactive history. Note the counts already in Firestore predate
// this rule: mobile wrote them with a raw-millisecond compare and nothing reset
// them on a lapse, so an existing number can read higher than it should until
// the next lapse or late completion overwrites it. We don't backfill, so don't
// read a stored count as proof the rule above held for every occurrence in it.
//
// Exactly three code paths write it, and they must agree or the number the UI
// shows is a lie:
//   1. completeReminder() below — on-time completion increments, late
//      completion resets to 0.
//   2. mobile/lib/reminders.ts completeReminder() — a deliberate mirror of
//      this file; keep the two in sync.
//   3. sendReminderNotifications() in firebase/functions/src/index.ts — when
//      it rolls a NEVER-COMPLETED occurrence forward to the next due date it
//      writes currentStreak: 0. Rolling forward means the user let that
//      occurrence lapse, and a lapse breaks the streak. Leaving the old value
//      there (what it used to do) let both clients keep displaying a streak
//      the user hadn't actually earned.
// One-time reminders never carry a streak — they're deleted on completion.

/**
 * Start of the local calendar day containing `ms`.
 *
 * Uses the local getters (getFullYear/getMonth/getDate), NOT the UTC ones:
 * "due today" is a wall-clock idea in the user's own timezone. Comparing in
 * UTC would move the boundary — for a US user, anything after ~5-8pm local
 * is already tomorrow in UTC, so an evening completion of a task due today
 * would be scored as late.
 */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Marks a reminder done. Recurring reminders advance from their ORIGINAL due
 * date (not from "now") so a late completion doesn't push every future
 * occurrence later — due June 1, completed June 3 still comes due July 1.
 * Advances past today if completed very late, so it can't re-fire tomorrow.
 */
export async function completeReminder(dogId: string, reminder: Reminder): Promise<{ streak: number } | null> {
  const { db } = getFirebase();
  const ref = doc(db, 'dogs', dogId, 'reminders', reminder.id);
  const now = Date.now();

  if (!reminder.recurrenceDays) {
    await deleteDoc(ref);
    return null;
  }

  const intervalMs = reminder.recurrenceDays * 24 * 60 * 60 * 1000;
  let nextDue = reminder.dueDate + intervalMs;
  while (nextDue <= now) nextDue += intervalMs;

  // On-time (on or before the due DAY) extends the streak; completing it late
  // resets it — no credit for catching up. Compared by calendar day, not by
  // instant: a reminder due today is done on time whether it's ticked off at
  // 9am or at 11pm, and a millisecond comparison against the stored dueDate
  // (which carries whatever time-of-day it was created with) would call the
  // evening one late.
  const wasOnTime = startOfLocalDay(now) <= startOfLocalDay(reminder.dueDate);
  const nextStreak = wasOnTime ? (reminder.currentStreak ?? 0) + 1 : 0;

  await updateDoc(ref, {
    dueDate: Timestamp.fromMillis(nextDue),
    lastCompletedAt: serverTimestamp(),
    notifiedAt: null,
    currentStreak: nextStreak,
  });

  return { streak: nextStreak };
}
