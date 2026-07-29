'use client';
// web/components/RemindersSection.tsx
// Cadence — a calendar for the dog-care dates nobody holds in their head.
// The one feature this week's strategy research identified as genuinely
// recurring (everything else proposed was a one-shot document generator in
// a subscription costume). Free for now — see reminders.ts for the data
// layer and firestore.rules for the owner-only guard.

import { useMemo, useState } from 'react';
import { REMINDER_PRESETS, completeReminder, createReminder, deleteReminder } from '../lib/reminders';
import type { Reminder, ReminderType } from '../shared/types';

interface Props {
  dogId: string;
  reminders: Reminder[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dueLabel(dueDate: number): { text: string; urgent: boolean } {
  const days = Math.round((dueDate - Date.now()) / DAY_MS);
  if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, urgent: true };
  if (days === 0) return { text: 'Due today', urgent: true };
  if (days === 1) return { text: 'Due tomorrow', urgent: true };
  if (days <= 7) return { text: `Due in ${days} days`, urgent: false };
  return { text: `Due ${new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, urgent: false };
}

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const tzOffsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(ms - tzOffsetMs).toISOString().slice(0, 10);
}

export default function RemindersSection({ dogId, reminders }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [presetType, setPresetType] = useState<ReminderType>('heartworm');
  const [customLabel, setCustomLabel] = useState('');
  const [dueDateInput, setDueDateInput] = useState(toDateInputValue(Date.now() + 30 * DAY_MS));
  const [repeats, setRepeats] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const preset = useMemo(() => REMINDER_PRESETS.find((p) => p.type === presetType) ?? REMINDER_PRESETS[0], [presetType]);

  const sorted = useMemo(() => [...reminders].sort((a, b) => a.dueDate - b.dueDate), [reminders]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const label = presetType === 'custom' ? customLabel.trim() : preset.defaultLabel;
    if (!label) {
      setError('Give it a name');
      return;
    }
    const dueDate = new Date(`${dueDateInput}T12:00:00`).getTime();
    if (!Number.isFinite(dueDate)) {
      setError('Pick a valid date');
      return;
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
    } catch {
      setError('Could not save — try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(reminder: Reminder) {
    setBusyId(reminder.id);
    try {
      await completeReminder(dogId, reminder);
    } catch {
      // Non-critical — the reminder just stays as-is, user can retry.
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
    <div className="card rounded-[1.8rem] overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-brown">Reminders</p>
          <p className="text-xs text-brown-light">The dates nobody holds in their head</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 border-b border-border bg-cream-dark/40 flex flex-col gap-2.5">
          <select
            value={presetType}
            onChange={(e) => setPresetType(e.target.value as ReminderType)}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-brown"
          >
            {REMINDER_PRESETS.map((p) => (
              <option key={p.type} value={p.type}>{p.label}</option>
            ))}
          </select>
          {presetType === 'custom' && (
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Refill anxiety meds"
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-brown"
            />
          )}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dueDateInput}
              onChange={(e) => setDueDateInput(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-brown flex-1"
            />
            {preset.recurrenceDays && (
              <label className="flex items-center gap-1.5 text-xs text-brown-light whitespace-nowrap">
                <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
                Repeats
              </label>
            )}
          </div>
          <p className="text-[11px] text-brown-light">{preset.helpText}</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="btn-primary py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add reminder'}
          </button>
        </form>
      )}

      {sorted.length === 0 && !showAdd && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-brown-light">Nothing due yet — add your first reminder.</p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="divide-y divide-border">
          {sorted.map((r) => {
            const due = dueLabel(r.dueDate);
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brown truncate">{r.label}</p>
                  <p className={`text-xs ${due.urgent ? 'text-red-600 font-semibold' : 'text-brown-light'}`}>
                    {due.text}{r.recurrenceDays ? ' · repeats' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleComplete(r)}
                    disabled={busy}
                    className="rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 disabled:opacity-50"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    disabled={busy}
                    aria-label="Delete reminder"
                    className="text-brown-light hover:text-red-600 transition-colors disabled:opacity-50 px-1"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
