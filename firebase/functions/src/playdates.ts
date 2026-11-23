// firebase/functions/src/playdates.ts
// Playdate reminders. Nothing used to help two matched neighbors actually meet:
// a confirmed playdate was a chat message and nothing more. Every 15 minutes
// this looks at the playdates that are about a day away, about two hours away,
// or finished a little while ago, and pushes each person once:
//   24 h before   "Playdate with Waffles tomorrow"
//   2 h before    "Playdate with Waffles in about 2 hours"
//   2.5 h after   "How did it go with Waffles?"  (opens the chat, where the rating lives)
//
// WHERE A PLAYDATE LIVES: a chat message of type 'playdate_confirmed' carrying
// { date, time, place } (the web and iPhone chats write it). The decisions (what
// is due when, which playdate counts, the wording) are pure and live in
// ./playdateReminders.ts, tested by shared/playdateReminders.test.ts. This file
// is the Firestore and push side of it.
//
// ONCE ONLY: each reminder claims a marker doc, playdateReminders/{id}, with
// create() BEFORE sending, so two overlapping runs can't both send. A failed
// send releases it so the next run retries (inside the reminder's window).
// The id holds the match, the person, the kind and a hash of the playdate
// (date|time|place), so a rescheduled playdate gets its own reminders while a
// duplicate confirmation of the same playdate gets none.
//
// WHICH PLAYDATE COUNTS: only the latest confirmed one per match (a newer one
// is a reschedule). Skipped: a blocked pair, a match that is gone, a dog whose
// account was deleted, a date older iPhone builds stored as free text, a
// rating prompt to someone who already rated this match.
//
// TIME ZONE: the date and time carry none. Each person's reminder uses their own
// device zone, saved with their push token (users/{uid}/private/push.timeZone),
// else the main zone of their dog's state. With neither, nothing is sent: a
// guess could put a rating prompt before the meetup.
//
// INDEX: the scan is one collection-group query on playdate.date, which needs
// the fieldOverride in firestore.indexes.json (deploy it with the functions).
//
// index.ts owns sendPushToUser and isBlockedEitherWay and passes them in, as it
// does for ./packDay.ts, rather than this file importing index.ts.

import * as functions from 'firebase-functions';
import * as crypto from 'crypto';
import {
  buildReminderPush,
  confirmedAtMs,
  dueReminders,
  isValidTimeZone,
  latestConfirmedPlaydate,
  playdateKey,
  zoneForState,
} from './playdateReminders';
import type { ConfirmedMessage, ReminderKind } from './playdateReminders';

const SITE = 'https://godoggydate.com';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlaydatePush {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PlaydateDeps {
  db: FirebaseFirestore.Firestore;
  sendPushToUser: (uid: string, payload: PlaydatePush) => Promise<void>;
  isBlockedEitherWay: (uidA: string, uidB: string) => Promise<boolean>;
}

export interface PlaydateRunSummary {
  matchesChecked: number;
  sent: Array<{ matchId: string; uid: string; kind: ReminderKind }>;
  skipped: Record<string, number>;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makePlaydateFunctions({ db, sendPushToUser, isBlockedEitherWay }: PlaydateDeps) {
  async function ownerTimeZone(uid: string, dog: FirebaseFirestore.DocumentData): Promise<string | null> {
    try {
      const push = await db.doc(`users/${uid}/private/push`).get();
      const saved = push.data()?.timeZone;
      if (isValidTimeZone(saved)) return saved;
    } catch {
      // fall through to the state
    }
    return zoneForState(dog.state);
  }

  async function hasRated(uid: string, matchId: string): Promise<boolean> {
    try {
      return (await db.doc(`ratings/${uid}_${matchId}`).get()).exists;
    } catch {
      return false;
    }
  }

  /**
   * One pass. Exported through the factory so a script can run it against the
   * emulator at any `nowMs` (scheduled functions don't fire there).
   */
  async function runPlaydateReminders(nowMs: number = Date.now()): Promise<PlaydateRunSummary> {
    const summary: PlaydateRunSummary = { matchesChecked: 0, sent: [], skipped: {} };
    const skip = (reason: string) => { summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1; };

    // Playdates dated around today, in any time zone: a day either side of the
    // UTC date for the zone, and for the longest lead (24 h) and the prompt.
    const candidates = await db.collectionGroup('messages')
      .where('playdate.date', '>=', isoDay(nowMs - 2 * DAY_MS))
      .where('playdate.date', '<=', isoDay(nowMs + 3 * DAY_MS))
      .get();

    const matchIds = new Set<string>();
    for (const doc of candidates.docs) {
      const matchRef = doc.ref.parent.parent;
      if (!matchRef || matchRef.parent.id !== 'matches') continue;
      const data = doc.data();
      if (data.type !== 'playdate_confirmed' || data.moderated === true) continue;
      matchIds.add(matchRef.id);
    }

    for (const matchId of matchIds) {
      summary.matchesChecked += 1;
      try {
        await processMatch(matchId, nowMs, summary, skip);
      } catch (error) {
        console.error('playdate reminders: match failed', { matchId, error });
        skip('error');
      }
    }
    return summary;
  }

  async function processMatch(
    matchId: string,
    nowMs: number,
    summary: PlaydateRunSummary,
    skip: (reason: string) => void,
  ): Promise<void> {
    const matchSnap = await db.doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) return skip('match gone');
    const match = matchSnap.data() ?? {};
    const people = [match.dog1UserId, match.dog2UserId].filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (people.length !== 2 || people[0] === people[1]) return skip('bad match');

    // Every confirmed playdate of the match, so a newer one (a reschedule)
    // replaces an older one even when only the older one is in today's window.
    const confirmedSnap = await db.collection(`matches/${matchId}/messages`).where('type', '==', 'playdate_confirmed').get();
    const confirmed: ConfirmedMessage[] = confirmedSnap.docs.map((d) => {
      const data = d.data();
      const playdate = (data.playdate ?? {}) as Record<string, unknown>;
      return {
        id: d.id,
        date: playdate.date,
        time: playdate.time,
        place: playdate.place,
        createdAtMs: d.createTime ? d.createTime.toMillis() : 0,
        claimedAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : undefined,
        moderated: data.moderated === true,
      };
    });
    const latest = latestConfirmedPlaydate(confirmed);
    if (!latest) return skip('no usable playdate');

    if (await isBlockedEitherWay(people[0], people[1])) return skip('blocked');

    const dogs = await Promise.all(people.map((uid) => db.doc(`dogs/${uid}`).get()));
    if (dogs.some((d) => !d.exists)) return skip('account deleted');

    const digest = crypto.createHash('sha1').update(playdateKey(latest)).digest('hex').slice(0, 16);

    for (let i = 0; i < 2; i += 1) {
      const uid = people[i];
      const otherDog = dogs[1 - i].data() ?? {};
      const timeZone = await ownerTimeZone(uid, dogs[i].data() ?? {});
      if (!timeZone) {
        skip('no time zone');
        continue;
      }

      for (const kind of dueReminders(latest, timeZone, confirmedAtMs(latest), nowMs)) {
        if (kind === 'how_did_it_go' && await hasRated(uid, matchId)) {
          skip('already rated');
          continue;
        }
        const markerRef = db.doc(`playdateReminders/${matchId}_${uid}_${kind}_${digest}`);
        try {
          // Server-only bookkeeping (no client rule): nothing reads it but this function.
          await markerRef.create({ matchId, uid, kind, messageId: latest.id, sentAtMs: nowMs });
        } catch {
          skip('already sent');
          continue;
        }

        const { title, body } = buildReminderPush(kind, {
          dogName: typeof otherDog.name === 'string' ? otherDog.name : '',
          playdate: latest,
          timeZone,
          nowMs,
        });
        try {
          await sendPushToUser(uid, {
            title,
            body,
            data: { type: 'playdate', kind, matchId, link: `${SITE}/app/messages/${matchId}` },
          });
          summary.sent.push({ matchId, uid, kind });
        } catch (error) {
          // The marker was claimed before sending (that is what makes the
          // once-only safe against overlapping runs), so a failed send would
          // otherwise use up this reminder. Release it for the next run.
          console.error('playdate reminders: push failed, releasing marker', { matchId, uid, kind, error });
          await markerRef.delete().catch(() => undefined);
          skip('push failed');
        }
      }
    }
  }

  const sendPlaydateReminders = functions
    .runWith({ timeoutSeconds: 240, memory: '256MB' })
    .pubsub.schedule('every 15 minutes')
    .onRun(async () => {
      const summary = await runPlaydateReminders(Date.now());
      console.log('playdate reminders', {
        matchesChecked: summary.matchesChecked,
        sent: summary.sent.length,
        skipped: summary.skipped,
      });
    });

  return { sendPlaydateReminders, runPlaydateReminders };
}
