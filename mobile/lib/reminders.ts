// mobile/lib/reminders.ts
// Mirrors web/lib/reminders.ts — Cadence, the one genuinely recurring
// feature identified in this week's strategy research. Reminders live at
// dogs/{dogId}/reminders/{reminderId}, owner-only (see firestore.rules).

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
import { getFirebase } from './firebase';
import type { Reminder, ReminderType } from '../../shared/types';

export interface ReminderPreset {
  type: ReminderType;
  label: string;
  defaultLabel: string;
  recurrenceDays?: number;
  helpText: string;
}

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
  dueDate: number;
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

  // On-time (at or before the original due date) extends the streak;
  // completing it late resets it — no credit for catching up.
  const wasOnTime = now <= reminder.dueDate;
  const nextStreak = wasOnTime ? (reminder.currentStreak ?? 0) + 1 : 0;

  await updateDoc(ref, {
    dueDate: Timestamp.fromMillis(nextDue),
    lastCompletedAt: serverTimestamp(),
    notifiedAt: null,
    currentStreak: nextStreak,
  });

  return { streak: nextStreak };
}
