// firebase/functions/src/packDay.ts
// Pack Day — open group playdates at a public place. Every write goes through
// here (firestore.rules gives clients read-only access to packDays/), so the
// limits below can't be bypassed from a browser console and joining is atomic.
//
// The constants mirror PACK_DAY_LIMITS in shared/packDay.ts. This package is a
// separate deployable and can't import from shared/, so keep the two in sync.
//
// index.ts owns the helpers these functions need (push, block check) and passes
// them in, rather than this file importing index.ts and creating a cycle.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { checkContent, CONTENT_FILTER_MESSAGE } from './contentFilter';

const MIN_CAPACITY = 4;
const MAX_CAPACITY = 12;
const MIN_LEAD_MS = 60 * 60 * 1000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;
const DURATIONS = [45, 60, 90, 120];
const FORMATS = ['pack-walk', 'small-dog', 'slow-walk'];
const MAX_OPEN_PER_HOST = 2;
const MAX_ACTIVE_RSVPS = 5;
const MAX_TITLE = 60;
const MAX_PLACE = 80;
const MAX_NOTE = 280;
const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;
const SITE = 'https://godoggydate.com';

export interface PackDayPush {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PackDayDeps {
  db: FirebaseFirestore.Firestore;
  sendPushToUser: (uid: string, payload: PackDayPush) => Promise<void>;
  isBlockedEitherWay: (uidA: string, uidB: string) => Promise<boolean>;
}

export interface ValidatedPackDay {
  title: string;
  format: string;
  startsAtMs: number;
  durationMinutes: number;
  localDate: string;
  localTime: string;
  placeName: string;
  note: string;
  capacity: number;
}

const HttpsError = functions.https.HttpsError;

// Contact details and links are the usual way a public listing gets used for
// spam or to move someone off-platform, so reject them in free text.
const CONTACT_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|app)\b|@|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/i;

function cleanText(value: unknown, label: string, max: number, required: boolean): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpsError('invalid-argument', `${label} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${label} must be text.`);
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !text) throw new HttpsError('invalid-argument', `${label} is required.`);
  if (text.length > max) throw new HttpsError('invalid-argument', `${label} must be ${max} characters or fewer.`);
  if (CONTACT_PATTERN.test(text)) {
    throw new HttpsError('invalid-argument', `Leave links and contact details out of the ${label.toLowerCase()}. Members message each other in the app.`);
  }
  // Slurs, sexual solicitation and threats (Apple guideline 1.2). The apps
  // check first; this catches a client that skipped it.
  if (!checkContent(text).ok) {
    throw new HttpsError('invalid-argument', CONTENT_FILTER_MESSAGE);
  }
  return text;
}

/** Pure — exported so it can be tested without Firestore. Throws HttpsError. */
export function validatePackDayInput(data: unknown, nowMs: number): ValidatedPackDay {
  const input = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  if (input.acceptedRules !== true) {
    throw new HttpsError('failed-precondition', 'Please agree to the Pack Day rules to host.');
  }

  const title = cleanText(input.title, 'Title', MAX_TITLE, true);
  const placeName = cleanText(input.placeName, 'Place', MAX_PLACE, true);
  const note = cleanText(input.note, 'Note', MAX_NOTE, false);

  const format = input.format;
  if (typeof format !== 'string' || !FORMATS.includes(format)) {
    throw new HttpsError('invalid-argument', 'Choose a format.');
  }

  const capacity = input.capacity;
  if (!Number.isInteger(capacity) || (capacity as number) < MIN_CAPACITY || (capacity as number) > MAX_CAPACITY) {
    throw new HttpsError('invalid-argument', `Capacity must be between ${MIN_CAPACITY} and ${MAX_CAPACITY} dogs.`);
  }

  const durationMinutes = input.durationMinutes;
  if (!Number.isInteger(durationMinutes) || !DURATIONS.includes(durationMinutes as number)) {
    throw new HttpsError('invalid-argument', 'Choose how long it runs.');
  }

  const startsAtMs = input.startsAtMs;
  if (typeof startsAtMs !== 'number' || !Number.isFinite(startsAtMs)) {
    throw new HttpsError('invalid-argument', 'Pick a date and time.');
  }
  if (startsAtMs < nowMs + MIN_LEAD_MS) {
    throw new HttpsError('invalid-argument', 'Start time must be at least an hour from now, so people have notice.');
  }
  if (startsAtMs > nowMs + MAX_LEAD_MS) {
    throw new HttpsError('invalid-argument', 'You can schedule up to 30 days ahead.');
  }

  const localDate = input.localDate;
  const localTime = input.localTime;
  const dateMatch = typeof localDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate) : null;
  if (!dateMatch || typeof localTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    throw new HttpsError('invalid-argument', 'Pick a date and time.');
  }
  // The wall-clock date is for display only, but it must agree with the real
  // start time to within a day (timezones), or the listing would show one time
  // while reminders fire at another.
  const localMidnightUtc = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
  if (Math.abs(localMidnightUtc - startsAtMs) > 36 * 60 * 60 * 1000) {
    throw new HttpsError('invalid-argument', 'Pick a date and time.');
  }

  return {
    title,
    format,
    startsAtMs,
    durationMinutes: durationMinutes as number,
    localDate: localDate as string,
    localTime,
    placeName,
    note,
    capacity: capacity as number,
  };
}

export function makePackDayFunctions({ db, sendPushToUser, isBlockedEitherWay }: PackDayDeps) {
  async function dogName(uid: string): Promise<string> {
    try {
      const snap = await db.doc(`dogs/${uid}`).get();
      const name = snap.exists ? (snap.data()?.name as string | undefined)?.trim() : undefined;
      return name || 'A dog';
    } catch {
      return 'A dog';
    }
  }

  async function isFounding(uid: string): Promise<boolean> {
    try {
      const snap = await db.doc(`users/${uid}/private/entitlements`).get();
      return snap.exists && snap.data()?.lifetimeChatUnlocks === true;
    } catch {
      return false;
    }
  }

  function requireUid(context: functions.https.CallableContext, action: string): string {
    const uid = context.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', `Sign in to ${action}.`);
    return uid;
  }

  const createPackDay = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'host a Pack Day');
    const now = Date.now();
    const input = validatePackDayInput(data, now);

    const dogSnap = await db.doc(`dogs/${uid}`).get();
    const dog = dogSnap.exists ? dogSnap.data() : undefined;
    const hostDogName = (dog?.name as string | undefined)?.trim();
    if (!hostDogName) throw new HttpsError('failed-precondition', 'Create your dog profile first.');
    const city = ((dog?.city as string | undefined) ?? '').trim();
    const state = ((dog?.state as string | undefined) ?? '').trim();
    if (!city) {
      throw new HttpsError('failed-precondition', "Add your city to your dog's profile so neighbors can find the event.");
    }

    const hosted = await db.collection('packDays').where('hostUid', '==', uid).get();
    const open = hosted.docs.filter((d) => d.data().status === 'open' && (d.data().startsAtMs as number) > now);
    if (open.length >= MAX_OPEN_PER_HOST) {
      throw new HttpsError('resource-exhausted', `You can have ${MAX_OPEN_PER_HOST} upcoming Pack Days at a time. Cancel one or wait until it's over.`);
    }

    const founding = await isFounding(uid);
    const ref = db.collection('packDays').doc();
    await ref.set({
      hostUid: uid,
      hostDogName,
      title: input.title,
      format: input.format,
      startsAtMs: input.startsAtMs,
      durationMinutes: input.durationMinutes,
      localDate: input.localDate,
      localTime: input.localTime,
      placeName: input.placeName,
      city,
      state,
      note: input.note,
      capacity: input.capacity,
      // The host's own dog takes a spot.
      attendeeUids: [uid],
      foundingUids: founding ? [uid] : [],
      status: 'open',
      // Founder-hosted flag: only ever set by hand through the Admin SDK.
      official: false,
      reminderSent: false,
      createdAtMs: now,
    });

    return { eventId: ref.id };
  });

  const rsvpPackDay = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'join a Pack Day');
    const eventId = typeof data?.eventId === 'string' ? data.eventId : '';
    const action = data?.action;
    if (!eventId || eventId.length > 64 || eventId.includes('/') || (action !== 'join' && action !== 'leave')) {
      throw new HttpsError('invalid-argument', 'Invalid request.');
    }
    const ref = db.doc(`packDays/${eventId}`);

    if (action === 'leave') {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'That Pack Day no longer exists.');
        const event = snap.data()!;
        if (event.hostUid === uid) {
          throw new HttpsError('failed-precondition', "You're hosting this one. Cancel it instead of leaving.");
        }
        tx.update(ref, {
          attendeeUids: admin.firestore.FieldValue.arrayRemove(uid),
          foundingUids: admin.firestore.FieldValue.arrayRemove(uid),
        });
      });
      return { joined: false };
    }

    if (data?.acceptedRules !== true) {
      throw new HttpsError('failed-precondition', 'Please agree to the Pack Day rules to join.');
    }
    const dogSnap = await db.doc(`dogs/${uid}`).get();
    if (!dogSnap.exists || !(dogSnap.data()?.name as string | undefined)?.trim()) {
      throw new HttpsError('failed-precondition', 'Create your dog profile first.');
    }

    const preview = await ref.get();
    if (!preview.exists) throw new HttpsError('not-found', 'That Pack Day no longer exists.');
    const hostUid = preview.data()!.hostUid as string;
    if (await isBlockedEitherWay(uid, hostUid)) {
      throw new HttpsError('permission-denied', "You can't join this Pack Day.");
    }

    const now = Date.now();
    const mine = await db.collection('packDays').where('attendeeUids', 'array-contains', uid).get();
    const active = mine.docs.filter((d) => d.id !== eventId && d.data().status === 'open' && (d.data().startsAtMs as number) > now);
    if (active.length >= MAX_ACTIVE_RSVPS) {
      throw new HttpsError('resource-exhausted', `You can be signed up for ${MAX_ACTIVE_RSVPS} Pack Days at a time.`);
    }

    const founding = await isFounding(uid);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'That Pack Day no longer exists.');
      const event = snap.data()!;
      const attendees = (event.attendeeUids as string[] | undefined) ?? [];
      if (event.status !== 'open') throw new HttpsError('failed-precondition', 'This Pack Day was cancelled.');
      if (now >= (event.startsAtMs as number) + (event.durationMinutes as number) * 60_000) {
        throw new HttpsError('failed-precondition', 'This Pack Day is over.');
      }
      if (attendees.includes(uid)) return { alreadyJoined: true, title: event.title as string, hostUid };
      if (attendees.length >= (event.capacity as number)) {
        throw new HttpsError('resource-exhausted', 'This Pack Day is full.');
      }
      tx.update(ref, {
        attendeeUids: admin.firestore.FieldValue.arrayUnion(uid),
        ...(founding ? { foundingUids: admin.firestore.FieldValue.arrayUnion(uid) } : {}),
      });
      return { alreadyJoined: false, title: event.title as string, hostUid };
    });

    if (!result.alreadyJoined) {
      const name = await dogName(uid);
      await sendPushToUser(result.hostUid, {
        title: `${name} is coming 🐾`,
        body: `${name} signed up for ${result.title}.`,
        data: { type: 'packday', eventId, link: `${SITE}/app/pack/${eventId}` },
      }).catch((error) => console.warn('packDay: host push failed', { eventId, error }));
    }
    return { joined: true };
  });

  const cancelPackDay = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'cancel a Pack Day');
    const eventId = typeof data?.eventId === 'string' ? data.eventId : '';
    if (!eventId || eventId.length > 64 || eventId.includes('/')) {
      throw new HttpsError('invalid-argument', 'Invalid request.');
    }
    const ref = db.doc(`packDays/${eventId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'That Pack Day no longer exists.');
    const event = snap.data()!;
    if (event.hostUid !== uid) throw new HttpsError('permission-denied', 'Only the host can cancel.');
    if (event.status === 'cancelled') return { cancelled: true };

    await ref.update({ status: 'cancelled', cancelledAtMs: Date.now() });
    await notifyAttendees(eventId, event, {
      title: 'Pack Day cancelled',
      body: `${event.title as string} was cancelled by the host.`,
    });
    return { cancelled: true };
  });

  async function notifyAttendees(
    eventId: string,
    event: FirebaseFirestore.DocumentData,
    message: { title: string; body: string },
  ) {
    const recipients = ((event.attendeeUids as string[] | undefined) ?? []).filter((u) => u !== event.hostUid);
    await Promise.all(recipients.map((recipient) =>
      sendPushToUser(recipient, {
        ...message,
        data: { type: 'packday', eventId, link: `${SITE}/app/pack/${eventId}` },
      }).catch((error) => console.warn('packDay: attendee push failed', { eventId, error })),
    ));
  }

  // One heads-up when an event is within two hours. Queries on startsAtMs
  // alone (a single-field index) and filters the rest, so no composite index.
  const sendPackDayReminders = functions.pubsub
    .schedule('every 30 minutes')
    .onRun(async () => {
      const now = Date.now();
      const snap = await db.collection('packDays')
        .where('startsAtMs', '>', now)
        .where('startsAtMs', '<=', now + REMINDER_LEAD_MS)
        .get();

      for (const doc of snap.docs) {
        const event = doc.data();
        if (event.status !== 'open' || event.reminderSent === true) continue;
        // Created inside the reminder window: attendees just heard about it.
        if ((event.createdAtMs as number) > (event.startsAtMs as number) - REMINDER_LEAD_MS) {
          await doc.ref.update({ reminderSent: true });
          continue;
        }
        await doc.ref.update({ reminderSent: true });
        const attendees = (event.attendeeUids as string[] | undefined) ?? [];
        await Promise.all(attendees.map((recipient) =>
          sendPushToUser(recipient, {
            title: 'Pack Day soon 🐕',
            body: `${event.title as string} at ${event.placeName as string} starts in about two hours.`,
            data: { type: 'packday', eventId: doc.id, link: `${SITE}/app/pack/${doc.id}` },
          }).catch((error) => console.warn('packDay: reminder push failed', { eventId: doc.id, error })),
        ));
      }
    });

  /** Called by deleteAccount: drop the user from everything they joined and
   *  cancel (and tell people about) what they hosted. */
  async function cleanupPackDaysForUser(uid: string): Promise<void> {
    const hosted = await db.collection('packDays').where('hostUid', '==', uid).get();
    for (const doc of hosted.docs) {
      const event = doc.data();
      if (event.status === 'open' && (event.startsAtMs as number) > Date.now()) {
        await notifyAttendees(doc.id, event, {
          title: 'Pack Day cancelled',
          body: `${event.title as string} was cancelled because the host left GoDoggyDate.`,
        });
      }
      await doc.ref.delete();
    }
    const joined = await db.collection('packDays').where('attendeeUids', 'array-contains', uid).get();
    for (const doc of joined.docs) {
      await doc.ref.update({
        attendeeUids: admin.firestore.FieldValue.arrayRemove(uid),
        foundingUids: admin.firestore.FieldValue.arrayRemove(uid),
      });
    }
  }

  return { createPackDay, rsvpPackDay, cancelPackDay, sendPackDayReminders, cleanupPackDaysForUser };
}
