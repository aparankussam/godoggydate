// firebase/functions/src/packDayChat.ts
// Pack Day group chat, server side. Messages live at packDays/{eventId}/messages
// (firestore.rules lets members write them, and ends writes 48 hours after the
// event). This file adds what rules can't:
//   - onPackDayMessageCreated: the same content filter the 1:1 chat has, run on
//     every message (a modified client can skip the app's own check).
//   - packDayChatHost: the host's tools. Pin, mute and remove go through here
//     because chatControl/state and attendeeUids are closed to clients.
//   - postPackDayHeadsUps: the morning-of "Still on?" message, once per event.
// index.ts passes in the ops alert and its secret, as it does for ./playdates.ts.

import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { checkContent } from './contentFilter';
import { MODERATED_MESSAGE_TEXT } from './moderation';
import { headsUpPostAtMs, headsUpText, chatPhase } from './packDayChatRules';

export interface PackDayChatDeps {
  db: FirebaseFirestore.Firestore;
  sendOpsAlert: (text: string) => Promise<void>;
  /** Secrets sendOpsAlert reads, so the moderation trigger can be given them. */
  secrets: Array<string | ReturnType<typeof import('firebase-functions/params').defineSecret>>;
}

const HttpsError = functions.https.HttpsError;
const HOST_ACTIONS = ['pin', 'unpin', 'mute', 'unmute', 'remove'] as const;
type HostAction = (typeof HOST_ACTIONS)[number];
const SYSTEM_UID = 'system';

function clock12(localTime: string): string {
  const [h, m] = localTime.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function safeId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/') && value !== '.' && value !== '..'
    ? value
    : '';
}

export function makePackDayChatFunctions({ db, sendOpsAlert, secrets }: PackDayChatDeps) {
  const onPackDayMessageCreated = functions
    .runWith({ secrets })
    .firestore.document('packDays/{eventId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
      const { eventId, messageId } = context.params as { eventId: string; messageId: string };
      const message = snap.data();
      const text = typeof message.text === 'string' ? message.text : '';
      // Quick buttons draw canned labels from `kind`; their stored text is never shown.
      const verdict = checkContent(text);
      if (verdict.ok) return;

      const logRef = db.doc(`moderationLog/packdaymessage_${eventId}_${messageId}`);
      const done = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        if (!fresh.exists || fresh.data()?.moderated === true) return false;
        tx.update(snap.ref, {
          text: MODERATED_MESSAGE_TEXT,
          moderated: true,
          moderationReason: verdict.reason,
          kind: 'text',
          photoUrl: FieldValue.delete(),
        });
        tx.set(logRef, {
          kind: 'packday_message',
          uid: message.fromUserId ?? null,
          eventId,
          messageId,
          reason: verdict.reason,
          original: { text },
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!done) return;
      await sendOpsAlert(
        `GoDoggyDate content filter removed a Pack Day chat message (${verdict.reason}): ` +
        `sender ${message.fromUserId ?? 'unknown'}, event ${eventId}, message ${messageId}. Original in ${logRef.path}.`,
      );
    });

  const packDayChatHost = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage the chat.');
    const eventId = safeId(data?.eventId);
    const action = data?.action as HostAction;
    if (!eventId || !HOST_ACTIONS.includes(action)) throw new HttpsError('invalid-argument', 'Invalid request.');

    const eventRef = db.doc(`packDays/${eventId}`);
    const controlRef = db.doc(`packDays/${eventId}/chatControl/state`);

    await db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) throw new HttpsError('not-found', 'That Pack Day no longer exists.');
      const event = eventSnap.data()!;
      if (event.hostUid !== uid) throw new HttpsError('permission-denied', 'Only the host can do that.');

      if (action === 'pin' || action === 'unpin') {
        if (action === 'unpin') {
          tx.set(controlRef, { pinned: null }, { merge: true });
          return;
        }
        const messageId = safeId(data?.messageId);
        if (!messageId) throw new HttpsError('invalid-argument', 'Invalid request.');
        const msgSnap = await tx.get(db.doc(`packDays/${eventId}/messages/${messageId}`));
        const msg = msgSnap.data();
        if (!msgSnap.exists || !msg || msg.moderated === true || msg.kind === 'photo') {
          throw new HttpsError('failed-precondition', 'That message can’t be pinned.');
        }
        const text = msg.kind === 'here' || msg.kind === 'late' ? '' : String(msg.text ?? '').slice(0, 500);
        tx.set(controlRef, { pinned: { messageId, text, kind: msg.kind, fromUserId: msg.fromUserId } }, { merge: true });
        return;
      }

      const target = safeId(data?.targetUid);
      if (!target || target === uid) throw new HttpsError('invalid-argument', 'Pick someone else.');
      if (action === 'unmute') {
        tx.set(controlRef, { mutedUids: FieldValue.arrayRemove(target) }, { merge: true });
      } else if (action === 'mute') {
        tx.set(controlRef, { mutedUids: FieldValue.arrayUnion(target) }, { merge: true });
      } else {
        // Remove: off the RSVP list (so no more reading or writing), and barred
        // from rejoining (rsvpPackDay checks removedUids).
        tx.update(eventRef, {
          attendeeUids: FieldValue.arrayRemove(target),
          foundingUids: FieldValue.arrayRemove(target),
        });
        tx.set(controlRef, {
          removedUids: FieldValue.arrayUnion(target),
          mutedUids: FieldValue.arrayRemove(target),
        }, { merge: true });
      }
    });
    return { ok: true };
  });

  // Every 15 minutes: events whose host-local 7:00 AM (or an hour before an
  // early start) has passed and haven't started. One query on startsAtMs (a
  // single-field index); the rest is filtered here. headsUpPosted makes it once.
  const postPackDayHeadsUps = functions.pubsub
    .schedule('every 15 minutes')
    .onRun(async () => {
      const now = Date.now();
      const snap = await db.collection('packDays')
        .where('startsAtMs', '>', now)
        .where('startsAtMs', '<=', now + 36 * 60 * 60 * 1000)
        .get();
      for (const doc of snap.docs) {
        const event = doc.data();
        if (event.status !== 'open' || event.headsUpPosted === true) continue;
        if (chatPhase({ startsAtMs: event.startsAtMs, durationMinutes: event.durationMinutes, status: event.status }, now) !== 'before') continue;
        const postAt = headsUpPostAtMs(event.startsAtMs, String(event.localDate), String(event.localTime));
        if (postAt === null || now < postAt) continue;
        // Claim before posting so overlapping runs can't post twice.
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists || fresh.data()?.headsUpPosted === true) return false;
          tx.update(doc.ref, { headsUpPosted: true });
          return true;
        });
        if (!claimed) continue;
        const going = ((event.attendeeUids as string[] | undefined) ?? []).length;
        try {
          await doc.ref.collection('messages').add({
            fromUserId: SYSTEM_UID,
            kind: 'headsup',
            text: headsUpText(String(event.title), String(event.placeName), clock12(String(event.localTime)), going),
            createdAt: FieldValue.serverTimestamp(),
          });
        } catch (error) {
          console.warn('packDayChat: heads-up post failed', { eventId: doc.id, error });
          await doc.ref.update({ headsUpPosted: false }).catch(() => undefined);
        }
      }
    });

  return { onPackDayMessageCreated, packDayChatHost, postPackDayHeadsUps };
}
