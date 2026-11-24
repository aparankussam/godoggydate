// firebase/functions/src/packGroups.ts
// Recurring Pack Day groups. A group is a standing doc (packGroups/{id}); its
// meetups are ordinary packDays/ docs with a `groupId`, generated ahead of time,
// so RSVP, capacity, map, share, report and rules run through the existing Pack
// Day code unchanged. Joining a group = following it: members get a push when a
// new meetup is posted. Every write goes through here (firestore.rules is
// read-only for clients).
//
// Limits mirror PACK_GROUP_LIMITS in shared/packGroup.ts (this package can't
// import shared/). Schedule math lives in ./packGroupSchedule.ts and is tested
// from shared/packGroup.test.ts.
//
// GROUP CHAT: out of scope here. Per-event chat is packDays/{eventId}/messages
// (another feature); a standing group chat would be packGroups/{groupId}/messages
// beside the member list. See the matching comment in firestore.rules.

import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { cleanText, validatePackDayInput, type PackDayDeps } from './packDay';
import {
  PACK_GROUP_FREQUENCIES,
  isRealDate,
  isValidTimeZone,
  nextOccurrenceDate,
  ordinalOf,
  wallClockToUtcMs,
  weekdayOf,
  whenLabel,
  type PackGroupFrequency,
} from './packGroupSchedule';
import { isStartTimeAllowed, START_WINDOW_MESSAGE } from './packDayWindow';

const MAX_TAGS = 3;
const MAX_TAG = 24;
const MAX_MEMBERS = 200;
const MAX_GROUPS_PER_HOST = 3;
const MIN_LEAD_MS = 60 * 60 * 1000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;
const SITE = 'https://godoggydate.com';

const HttpsError = functions.https.HttpsError;

function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    throw new HttpsError('invalid-argument', `Use up to ${MAX_TAGS} tags.`);
  }
  const tags = value.map((t) => cleanText(t, 'Tag', MAX_TAG, true));
  return tags.filter((t, i) => tags.findIndex((o) => o.toLowerCase() === t.toLowerCase()) === i);
}

export function makePackGroupFunctions({ db, sendPushToUser, isBlockedEitherWay }: PackDayDeps) {
  // The one place group pushes leave from. When the shared notification-limit
  // helper lands (firebase/functions/src/notifyLimit.ts), route it through here.
  async function pushToMember(uid: string, title: string, body: string, eventId: string): Promise<void> {
    await sendPushToUser(uid, {
      title,
      body,
      data: { type: 'packday', eventId, link: `${SITE}/app/pack/${eventId}` },
    }).catch((error) => console.warn('packGroups: push failed', { eventId, error }));
  }

  function requireUid(context: functions.https.CallableContext, action: string): string {
    const uid = context.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', `Sign in to ${action}.`);
    return uid;
  }

  function groupIdOf(data: unknown): string {
    const id = typeof (data as { groupId?: unknown })?.groupId === 'string' ? (data as { groupId: string }).groupId : '';
    if (!id || id.length > 64 || id.includes('/')) throw new HttpsError('invalid-argument', 'Invalid request.');
    return id;
  }

  async function loadHostedGroup(groupId: string, uid: string) {
    const ref = db.doc(`packGroups/${groupId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'That group no longer exists.');
    if (snap.data()!.hostUid !== uid) throw new HttpsError('permission-denied', 'Only the host can do that.');
    return { ref, group: snap.data()! };
  }

  async function isFounding(uid: string): Promise<boolean> {
    try {
      const snap = await db.doc(`users/${uid}/private/entitlements`).get();
      return snap.exists && snap.data()?.lifetimeChatUnlocks === true;
    } catch {
      return false;
    }
  }

  /** Writes one meetup for a group. Deterministic id, so a retried or doubled
   *  run can't post the same meetup twice. Returns false if it already existed. */
  async function createOccurrence(
    groupId: string,
    group: FirebaseFirestore.DocumentData,
    localDate: string,
  ): Promise<{ created: boolean; eventId: string; startsAtMs: number }> {
    const eventId = `${groupId}_${localDate}`;
    const startsAtMs = wallClockToUtcMs(localDate, group.localTime as string, group.timeZone as string);
    const host = group.hostUid as string;
    const founding = await isFounding(host);
    try {
      await db.doc(`packDays/${eventId}`).create({
        hostUid: host,
        hostDogName: group.hostDogName,
        title: group.name,
        format: group.format,
        startsAtMs,
        durationMinutes: group.durationMinutes,
        localDate,
        localTime: group.localTime,
        placeName: group.placeName,
        city: group.city,
        state: group.state,
        note: group.note,
        capacity: group.capacity,
        attendeeUids: [host],
        foundingUids: founding ? [host] : [],
        status: 'open',
        official: false,
        reminderSent: false,
        createdAtMs: Date.now(),
        groupId,
        scheduledLocalDate: localDate,
        smallDogsOnly: group.smallDogsOnly === true,
      });
      return { created: true, eventId, startsAtMs };
    } catch (error) {
      if ((error as { code?: number }).code === 6) return { created: false, eventId, startsAtMs };
      throw error;
    }
  }

  const createPackGroup = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'start a group');
    const now = Date.now();
    const input = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

    const frequency = input.frequency;
    if (typeof frequency !== 'string' || !PACK_GROUP_FREQUENCIES.includes(frequency as PackGroupFrequency)) {
      throw new HttpsError('invalid-argument', 'Choose how often it meets.');
    }
    const timeZone = input.timeZone;
    if (!isValidTimeZone(timeZone)) throw new HttpsError('invalid-argument', 'We couldn’t read your time zone.');
    const firstLocalDate = input.firstLocalDate;
    if (typeof firstLocalDate !== 'string' || !isRealDate(firstLocalDate)) {
      throw new HttpsError('invalid-argument', 'Pick the first date.');
    }
    const localTime = input.localTime;
    if (typeof localTime !== 'string' || !isStartTimeAllowed(localTime)) {
      throw new HttpsError('invalid-argument', START_WINDOW_MESSAGE);
    }
    const startsAtMs = wallClockToUtcMs(firstLocalDate, localTime, timeZone);
    if (startsAtMs < now + MIN_LEAD_MS) {
      throw new HttpsError('invalid-argument', 'The first meetup must be at least an hour from now, so people have notice.');
    }
    if (startsAtMs > now + MAX_LEAD_MS) throw new HttpsError('invalid-argument', 'The first meetup can be up to 30 days ahead.');

    const smallDogsOnly = input.smallDogsOnly === true;
    // Reuses every Pack Day check (name as title, place, note, format, capacity, duration, rules).
    const base = validatePackDayInput(
      {
        title: input.name, format: smallDogsOnly ? 'small-dog' : input.format, startsAtMs, durationMinutes: input.durationMinutes,
        localDate: firstLocalDate, localTime, placeName: input.placeName, note: input.note,
        capacity: input.capacity, acceptedRules: input.acceptedRules,
      },
      now,
    );
    const tags = cleanTags(input.tags);

    const dogSnap = await db.doc(`dogs/${uid}`).get();
    const dog = dogSnap.exists ? dogSnap.data() : undefined;
    const hostDogName = (dog?.name as string | undefined)?.trim();
    if (!hostDogName) throw new HttpsError('failed-precondition', 'Create your dog profile first.');
    const city = ((dog?.city as string | undefined) ?? '').trim();
    const state = ((dog?.state as string | undefined) ?? '').trim();
    if (!city) {
      throw new HttpsError('failed-precondition', "Add your city to your dog's profile so neighbors can find the group.");
    }

    const mine = await db.collection('packGroups').where('hostUid', '==', uid).get();
    if (mine.size >= MAX_GROUPS_PER_HOST) {
      throw new HttpsError('resource-exhausted', `You can run ${MAX_GROUPS_PER_HOST} groups at a time.`);
    }

    const groupId = newGroupId();
    const group = {
      name: base.title,
      hostUid: uid,
      hostDogName,
      city,
      state,
      placeName: base.placeName,
      note: base.note,
      format: base.format,
      tags,
      smallDogsOnly,
      capacity: base.capacity,
      durationMinutes: base.durationMinutes,
      frequency,
      weekday: weekdayOf(firstLocalDate),
      localTime,
      timeZone,
      status: 'active',
      lastLocalDate: firstLocalDate,
      memberUids: [uid],
      removedUids: [],
      createdAtMs: now,
    };
    await db.doc(`packGroups/${groupId}`).set(group);
    const first = await createOccurrence(groupId, group, firstLocalDate);
    return { groupId, eventId: first.eventId };
  });

  const joinPackGroup = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'join a group');
    const groupId = groupIdOf(data);
    const dogSnap = await db.doc(`dogs/${uid}`).get();
    if (!dogSnap.exists || !(dogSnap.data()?.name as string | undefined)?.trim()) {
      throw new HttpsError('failed-precondition', 'Create your dog profile first.');
    }
    const ref = db.doc(`packGroups/${groupId}`);
    const preview = await ref.get();
    if (!preview.exists) throw new HttpsError('not-found', 'That group no longer exists.');
    if (await isBlockedEitherWay(uid, preview.data()!.hostUid as string)) {
      throw new HttpsError('permission-denied', "You can't join this group.");
    }
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'That group no longer exists.');
      const g = snap.data()!;
      const members = (g.memberUids as string[] | undefined) ?? [];
      if (((g.removedUids as string[] | undefined) ?? []).includes(uid)) {
        throw new HttpsError('permission-denied', "You can't join this group.");
      }
      if (members.includes(uid)) return;
      if (members.length >= MAX_MEMBERS) throw new HttpsError('resource-exhausted', 'This group is full.');
      tx.update(ref, { memberUids: FieldValue.arrayUnion(uid) });
    });
    return { joined: true };
  });

  const leavePackGroup = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'leave a group');
    const ref = db.doc(`packGroups/${groupIdOf(data)}`);
    const snap = await ref.get();
    if (!snap.exists) return { joined: false };
    if (snap.data()!.hostUid === uid) {
      throw new HttpsError('failed-precondition', "You're hosting this group. Pause it instead of leaving.");
    }
    await ref.update({ memberUids: FieldValue.arrayRemove(uid) });
    return { joined: false };
  });

  // Host tools: edit what the NEXT generated meetups look like, pause or resume.
  // Meetups already posted keep their details (people have RSVPed to them).
  const updatePackGroup = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'edit a group');
    const { ref } = await loadHostedGroup(groupIdOf(data), uid);
    const patch = ((data as { patch?: unknown })?.patch ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    if ('name' in patch) out.name = cleanText(patch.name, 'Name', 60, true);
    if ('placeName' in patch) out.placeName = cleanText(patch.placeName, 'Place', 80, true);
    if ('note' in patch) out.note = cleanText(patch.note, 'Note', 280, false);
    if ('tags' in patch) out.tags = cleanTags(patch.tags);
    if ('capacity' in patch) {
      if (!Number.isInteger(patch.capacity) || (patch.capacity as number) < 4 || (patch.capacity as number) > 12) {
        throw new HttpsError('invalid-argument', 'Capacity must be between 4 and 12 dogs.');
      }
      out.capacity = patch.capacity;
    }
    if ('durationMinutes' in patch) {
      if (![45, 60, 90, 120].includes(patch.durationMinutes as number)) {
        throw new HttpsError('invalid-argument', 'Choose how long it runs.');
      }
      out.durationMinutes = patch.durationMinutes;
    }
    if ('frequency' in patch) {
      if (!PACK_GROUP_FREQUENCIES.includes(patch.frequency as PackGroupFrequency)) {
        throw new HttpsError('invalid-argument', 'Choose how often it meets.');
      }
      out.frequency = patch.frequency;
    }
    if ('localTime' in patch) {
      if (typeof patch.localTime !== 'string' || !isStartTimeAllowed(patch.localTime)) {
        throw new HttpsError('invalid-argument', START_WINDOW_MESSAGE);
      }
      out.localTime = patch.localTime;
    }
    if ('smallDogsOnly' in patch) {
      out.smallDogsOnly = patch.smallDogsOnly === true;
      out.format = out.smallDogsOnly ? 'small-dog' : 'pack-walk';
    }
    if ('status' in patch) {
      if (patch.status !== 'active' && patch.status !== 'paused') throw new HttpsError('invalid-argument', 'Invalid request.');
      out.status = patch.status;
    }
    if (Object.keys(out).length === 0) throw new HttpsError('invalid-argument', 'Nothing to change.');
    await ref.update(out);
    return { updated: true };
  });

  const removePackGroupMember = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'remove a member');
    const groupId = groupIdOf(data);
    const target = typeof (data as { uid?: unknown })?.uid === 'string' ? (data as { uid: string }).uid : '';
    const { ref } = await loadHostedGroup(groupId, uid);
    if (!target || target === uid || target.length > 128 || target.includes('/')) {
      throw new HttpsError('invalid-argument', 'Invalid request.');
    }
    await ref.update({ memberUids: FieldValue.arrayRemove(target), removedUids: FieldValue.arrayUnion(target) });
    // Also take them off meetups that haven't happened yet.
    const now = Date.now();
    const events = await db.collection('packDays').where('groupId', '==', groupId).get();
    await Promise.all(events.docs
      .filter((d) => (d.data().startsAtMs as number) > now && (d.data().attendeeUids as string[]).includes(target))
      .map((d) => d.ref.update({ attendeeUids: FieldValue.arrayRemove(target), foundingUids: FieldValue.arrayRemove(target) })));
    return { removed: true };
  });

  // "Moved": new date, same time of day, RSVPs told. ("Cancelled" is the
  // existing cancelPackDay; onPackDayCancelled tells the RSVPs.)
  const movePackDay = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context, 'move a Pack Day');
    const eventId = typeof data?.eventId === 'string' ? data.eventId : '';
    const localDate = data?.localDate;
    if (!eventId || eventId.length > 128 || eventId.includes('/') || typeof localDate !== 'string' || !isRealDate(localDate)) {
      throw new HttpsError('invalid-argument', 'Pick a new date.');
    }
    const ref = db.doc(`packDays/${eventId}`);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'That Pack Day no longer exists.');
      const event = snap.data()!;
      if (event.hostUid !== uid) throw new HttpsError('permission-denied', 'Only the host can move it.');
      if (typeof event.groupId !== 'string') throw new HttpsError('failed-precondition', 'Only group meetups can be moved.');
      if (event.status !== 'open') throw new HttpsError('failed-precondition', 'This Pack Day was cancelled.');
      const groupSnap = await tx.get(db.doc(`packGroups/${event.groupId}`));
      const timeZone = groupSnap.data()?.timeZone;
      if (!isValidTimeZone(timeZone)) throw new HttpsError('failed-precondition', 'This group has no time zone.');
      const now = Date.now();
      if (now >= (event.startsAtMs as number) + (event.durationMinutes as number) * 60_000) {
        throw new HttpsError('failed-precondition', 'This Pack Day is over.');
      }
      const startsAtMs = wallClockToUtcMs(localDate, event.localTime as string, timeZone);
      if (startsAtMs < now + MIN_LEAD_MS) throw new HttpsError('invalid-argument', 'Pick a date at least an hour from now.');
      if (startsAtMs > now + MAX_LEAD_MS) throw new HttpsError('invalid-argument', 'You can move it up to 30 days ahead.');
      tx.update(ref, { localDate, startsAtMs, reminderSent: false, movedAtMs: now });
      return { event, localDate, localTime: event.localTime as string };
    });
    const when = whenLabel(result.localDate, result.localTime);
    const recipients = ((result.event.attendeeUids as string[] | undefined) ?? []).filter((u) => u !== uid);
    await Promise.all(recipients.map((r) =>
      pushToMember(r, 'Pack Day moved', `${result.event.title as string} moved to ${when}.`, eventId)));
    return { moved: true };
  });

  // Keeps one upcoming meetup posted for every active group. Safe to run any
  // number of times: the id is derived from the date (see createOccurrence).
  // Shortcut: loads each active group's meetups to see if one is upcoming; fine
  // for hundreds of groups, move to a `nextEventAtMs` field on the group beyond that.
  const generatePackGroupOccurrences = functions.pubsub
    .schedule('every 6 hours')
    .onRun(async () => {
      const now = Date.now();
      const groups = await db.collection('packGroups').where('status', '==', 'active').get();
      for (const doc of groups.docs) {
        try {
          const group = doc.data();
          const events = await db.collection('packDays').where('groupId', '==', doc.id).get();
          const hasUpcoming = events.docs.some((e) => e.data().status === 'open' && (e.data().startsAtMs as number) > now);
          if (hasUpcoming) continue;

          const ordinal = ordinalOf(group.lastLocalDate as string);
          let date = nextOccurrenceDate(group.frequency, group.lastLocalDate as string, ordinal);
          // A paused group that was resumed skips the dates it missed.
          for (let i = 0; i < 60 && wallClockToUtcMs(date, group.localTime, group.timeZone) < now + MIN_LEAD_MS; i += 1) {
            date = nextOccurrenceDate(group.frequency, date, ordinal);
          }
          const made = await createOccurrence(doc.id, group, date);
          await doc.ref.update({ lastLocalDate: date });
          if (!made.created) continue;
          const members = ((group.memberUids as string[] | undefined) ?? []).filter((u) => u !== group.hostUid);
          await Promise.all(members.map((m) =>
            pushToMember(m, `${group.name as string} · new meetup`, `${whenLabel(date, group.localTime as string)} at ${group.placeName as string}. Tap to save a spot.`, made.eventId)));
        } catch (error) {
          console.error('packGroups: could not generate the next meetup', { groupId: doc.id, error });
        }
      }
    });

  /** Called by deleteAccount, after cleanupPackDaysForUser: drop their groups
   *  and remove them from groups they follow. */
  async function cleanupPackGroupsForUser(uid: string): Promise<void> {
    const hosted = await db.collection('packGroups').where('hostUid', '==', uid).get();
    for (const doc of hosted.docs) await doc.ref.delete();
    const joined = await db.collection('packGroups').where('memberUids', 'array-contains', uid).get();
    for (const doc of joined.docs) await doc.ref.update({ memberUids: FieldValue.arrayRemove(uid) });
  }

  return {
    createPackGroup,
    joinPackGroup,
    leavePackGroup,
    updatePackGroup,
    removePackGroupMember,
    movePackDay,
    generatePackGroupOccurrences,
    cleanupPackGroupsForUser,
  };
}
