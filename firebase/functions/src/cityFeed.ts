// firebase/functions/src/cityFeed.ts
// City feed: structured board posts (cityPosts/), their expiry cleanup and the
// once-a-day digest push. Clients read cityPosts/ directly (firestore.rules,
// live posts only) but never write it: posting goes through createCityPost so
// the content filter, template rules, per-member limit and the new-account
// check run on the server. Pure rules live in ./cityFeedRules.ts (a copy of
// shared/cityFeed.ts). Pushes go through the global cap in ./notifyLimit.ts.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { checkContent, CONTENT_FILTER_MESSAGE } from './contentFilter';
import {
  CITY_FEED_LIMITS,
  postEligibility,
  postExpiresAtMs,
  validatePostFields,
} from './cityFeedRules';
import type { PushKind } from './notifyLimit';
import { pushDayKey } from './notifyLimit';

const HttpsError = functions.https.HttpsError;
const DAY_MS = 24 * 60 * 60 * 1000;
const CONTACT_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|app)\b|@|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/i;

export interface CityFeedDeps {
  db: FirebaseFirestore.Firestore;
  sendLimitedPush: (
    uid: string,
    payload: { title: string; body: string; data: Record<string, string> },
    kind: PushKind,
  ) => Promise<boolean>;
}

function isCompleteDog(dog: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!dog) return false;
  const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const hasCoords = typeof dog.lat === 'number' && typeof dog.lng === 'number';
  return (
    count(dog.photos) >= 3 && filled(dog.name) && filled(dog.breed) && filled(dog.age) && filled(dog.sex) &&
    filled(dog.size) && typeof dog.energyLevel === 'number' &&
    (count(dog.temperament) >= 1 || count(dog.playStyles) >= 1) &&
    (hasCoords || (filled(dog.city) && filled(dog.state)) || filled(dog.location))
  );
}

export function makeCityFeedFunctions({ db, sendLimitedPush }: CityFeedDeps) {
  /** True if this member checked in at any Pack Day. Check-ins live at
   *  packDays/{eventId}/checkins/{uid}; if that feature isn't deployed the
   *  lookup finds nothing and the account-age rule alone applies. */
  async function attendedPackDay(uid: string): Promise<boolean> {
    try {
      const mine = await db.collection('packDays').where('attendeeUids', 'array-contains', uid).limit(20).get();
      for (const d of mine.docs) {
        if ((await d.ref.collection('checkins').doc(uid).get()).exists) return true;
      }
    } catch (error) {
      console.warn('cityFeed: check-in lookup failed', { uid, error });
    }
    return false;
  }

  const createCityPost = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to post.');
    const fields = validatePostFields(data ?? {});
    if (!fields.ok) throw new HttpsError('invalid-argument', fields.message);
    const { template, text, place } = fields.value;
    for (const value of [text, place]) {
      if (CONTACT_PATTERN.test(value)) {
        throw new HttpsError('invalid-argument', 'Leave links and contact details out. Neighbors can reach you through a Pack Day or a match.');
      }
      if (!checkContent(value).ok) throw new HttpsError('invalid-argument', CONTENT_FILTER_MESSAGE);
    }

    const dogSnap = await db.doc(`dogs/${uid}`).get();
    const dog = dogSnap.data();
    const city = ((dog?.city as string | undefined) ?? '').trim();
    const authUser = await admin.auth().getUser(uid);
    const accountAgeMs = Date.now() - new Date(authUser.metadata.creationTime).getTime();
    const complete = isCompleteDog(dog) && !!city;
    // Only look up check-ins when they could change the answer.
    const needsCheckin = complete && accountAgeMs < CITY_FEED_LIMITS.minAccountAgeDays * DAY_MS;
    const gate = postEligibility({
      profileComplete: complete,
      accountAgeMs,
      attendedPackDay: needsCheckin ? await attendedPackDay(uid) : false,
    });
    if (!gate.ok) throw new HttpsError('failed-precondition', gate.message);

    const now = Date.now();
    const live = await db.collection('cityPosts').where('authorUid', '==', uid).get();
    if (live.docs.filter((d) => (d.data().expiresAtMs as number) > now).length >= CITY_FEED_LIMITS.maxLivePerAuthor) {
      throw new HttpsError('resource-exhausted', `You can have ${CITY_FEED_LIMITS.maxLivePerAuthor} live posts at a time. Delete one or wait for it to expire.`);
    }

    const ref = db.collection('cityPosts').doc();
    await ref.set({
      authorUid: uid,
      authorDogName: ((dog?.name as string | undefined) ?? 'A dog').trim() || 'A dog',
      city,
      state: ((dog?.state as string | undefined) ?? '').trim(),
      template,
      text,
      place,
      claimed: false,
      createdAtMs: now,
      expiresAtMs: postExpiresAtMs(template, now),
    });
    // "Found a Pup" meets "Lost dog": every owner with an open alert in this city
    // hears about it straight away, so the two sides of a reunion find each other.
    if (template === 'found_dog' && city) {
      try {
        const open = await db.collection('lostAlerts').where('city', '==', city).where('status', '==', 'active').limit(20).get();
        const owners = [...new Set(open.docs.map((d) => d.get('ownerId')).filter((o): o is string => typeof o === 'string' && o !== uid))];
        await Promise.all(owners.map((owner) => sendLimitedPush(owner, {
          title: `🔎 A neighbor found a dog near ${place || city}`,
          body: 'Could it be yours? Open Neighbarkhood to see the post.',
          data: { type: 'cityPost', postId: ref.id, link: 'https://godoggydate.com/app/pack?view=feed' },
        }, 'urgent').catch(() => false)));
      } catch (err) {
        console.warn('found dog: could not notify lost-dog owners', err); // the post itself stands
      }
    }
    return { postId: ref.id };
  });

  /** The author closes their own post: 'claim' (Free/Lend is gone) ends it now
   *  by expiring it; 'delete' removes it. */
  const updateCityPost = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const postId = typeof data?.postId === 'string' ? data.postId : '';
    const action = data?.action;
    if (!postId || postId.length > 64 || postId.includes('/') || (action !== 'claim' && action !== 'delete')) {
      throw new HttpsError('invalid-argument', 'Invalid request.');
    }
    const ref = db.doc(`cityPosts/${postId}`);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    if (snap.data()?.authorUid !== uid) throw new HttpsError('permission-denied', 'Only the author can change this post.');
    if (action === 'delete') await ref.delete();
    else await ref.update({ claimed: true, expiresAtMs: Date.now() });
    return { ok: true };
  });

  // Hourly: delete posts a day past expiry (queries already hide them from the
  // moment they expire), and push counters older than two days.
  const cleanupCityFeed = functions.pubsub.schedule('every 60 minutes').onRun(async () => {
    const now = Date.now();
    const old = await db.collection('cityPosts')
      .where('expiresAtMs', '<', now - CITY_FEED_LIMITS.cleanupGraceHours * 60 * 60 * 1000)
      .limit(400).get();
    const counters = await db.collection('pushCounters').where('day', '<', pushDayKey(now - 2 * DAY_MS)).limit(400).get();
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    counters.docs.forEach((d) => batch.delete(d.ref));
    if (old.size + counters.size > 0) await batch.commit();
  });

  // Daily: ONE push per user summarising what's new in their city in the last
  // day, instead of a push per post. Counts against the 2-a-day cap.
  // shortcut: cities are matched by the exact text on dog profiles, and each
  // city's dogs are read in one query; fine for a launch-sized community, move
  // to a normalised city key plus paging when a city passes a few thousand dogs.
  const sendCityFeedDigest = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .pubsub.schedule('0 17 * * *')
    .timeZone('America/Chicago')
    .onRun(async () => {
      const now = Date.now();
      const since = now - DAY_MS;
      const [posts, days] = await Promise.all([
        db.collection('cityPosts').where('createdAtMs', '>', since).get(),
        db.collection('packDays').where('createdAtMs', '>', since).get(),
      ]);
      const byCity = new Map<string, { posts: Array<{ authorUid: string }>; packDays: Array<{ authorUid: string }> }>();
      const bucket = (city: string) => {
        if (!byCity.has(city)) byCity.set(city, { posts: [], packDays: [] });
        return byCity.get(city)!;
      };
      posts.docs.forEach((d) => {
        const p = d.data();
        if ((p.expiresAtMs as number) > now && p.city) bucket(p.city as string).posts.push({ authorUid: p.authorUid as string });
      });
      days.docs.forEach((d) => {
        const e = d.data();
        if (e.status === 'open' && (e.startsAtMs as number) > now && e.city) {
          bucket(e.city as string).packDays.push({ authorUid: e.hostUid as string });
        }
      });

      for (const [city, found] of byCity) {
        // One digest per city per day, even if the schedule is delivered twice.
        const marker = db.doc(`cityFeedDigests/${encodeURIComponent(city.toLowerCase())}_${pushDayKey(now)}`);
        try {
          await marker.create({ city, sentAtMs: now });
        } catch {
          continue;
        }
        const dogs = await db.collection('dogs').where('city', '==', city).get();
        for (const dog of dogs.docs) {
          const uid = dog.id;
          const blocked = await blockedSet(uid);
          const theirs = (list: Array<{ authorUid: string }>) =>
            list.filter((i) => i.authorUid !== uid && !blocked.has(i.authorUid)).length;
          const nPosts = theirs(found.posts);
          const nDays = theirs(found.packDays);
          if (nPosts + nDays === 0) continue;
          const parts = [
            nDays > 0 ? `${nDays} new Pack Day${nDays > 1 ? 's' : ''}` : '',
            nPosts > 0 ? `${nPosts} new post${nPosts > 1 ? 's' : ''}` : '',
          ].filter(Boolean);
          await sendLimitedPush(uid, {
            title: `New in ${city} 🐾`,
            body: `${parts.join(' and ')} from your neighbors.`,
            data: { type: 'cityfeed', link: 'https://godoggydate.com/app/pack' },
          }, 'social').catch((error) => console.warn('cityFeed: digest push failed', { uid, error }));
        }
      }
    });

  async function blockedSet(uid: string): Promise<Set<string>> {
    const [a, b] = await Promise.all([
      db.collection(`blocks/${uid}/blocked`).get(),
      db.collection(`blocks/${uid}/blockedBy`).get(),
    ]);
    return new Set([...a.docs, ...b.docs].map((d) => d.id));
  }

  return { createCityPost, updateCityPost, cleanupCityFeed, sendCityFeedDigest };
}
