// mobile/lib/medAlarms.ts
// Daily medicine needs a ping at the dose time, not whenever the server's
// once-a-day reminder job happens to run. So each "medication" reminder gets a
// repeating local notification on this phone at its time of day. Kept in step
// with Firestore every time the reminders list changes: new ones scheduled,
// deleted ones cancelled. A household member's phone does the same when they
// open the household screen.

import * as Notifications from 'expo-notifications';
import type { Reminder } from '../../shared/types';

const idFor = (dogId: string, reminderId: string) => `med:${dogId}:${reminderId}`;

/** Asks for notification permission if it hasn't been decided yet. Call before saving a medicine. */
export async function askForMedAlarms(): Promise<void> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    /* the reminder still works in the app without the ping */
  }
}

export async function syncMedAlarms(dogId: string, reminders: Reminder[]): Promise<void> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const prefix = `med:${dogId}:`;
    const want = new Map(reminders.filter((r) => r.type === 'medication').map((r) => [idFor(dogId, r.id), r]));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const n of scheduled) {
      if (n.identifier.startsWith(prefix) && !want.has(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    for (const [identifier, r] of want) {
      const due = new Date(r.dueDate);
      const at = `${due.getHours()}:${due.getMinutes()}`;
      const existing = scheduled.find((n) => n.identifier === identifier);
      if (existing && existing.content.data?.at === at && existing.content.title?.includes(r.label)) continue;
      // Same identifier replaces the earlier schedule.
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: `💊 Time for ${r.label}`,
          body: 'Tap Given in GoDoggyDate once it’s done to keep the streak going.',
          data: { type: 'reminder', dogId, at },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: due.getHours(), minute: due.getMinutes() },
      });
    }
  } catch {
    /* alarms are a bonus; the list in the app is the record */
  }
}
