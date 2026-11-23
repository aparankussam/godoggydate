import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ── Local waitlist ───────────────────────────────────────────────────────────
// A new city has no dogs yet. Instead of an empty deck and a shrug, an owner can ask
// to be told when a neighbor joins:
//
//   joinWaitlist   (callable)  records waitlist/{uid} { city, state, joinedAt } and returns
//                              the person's position in their city. Idempotent.
//   leaveWaitlist  (callable)  removes it.
//   onDogJoinedWaitlistedCity  when a COMPLETE dog appears in a waitlisted city/state, each
//                              waitlisted owner gets one push, at most one per day.
//   onWaitlistUserDeleted      deleting the account removes the entry.
//
// waitlist/ has no client access at all (firestore.rules denies anything it does not
// list); everything here uses the Admin SDK. The push goes out the same way index.ts's
// sendPushToUser does it (users/{uid}/private/push: expoPushTokens + fcmWebTokens),
// copied here because index.ts re-exports this file and importing it back would be circular.
// The push says only that "a neighbor" joined: never the dog's name or anything else about them.

const db = () => admin.firestore();

const PUSH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_NOTIFIED_PER_DOG = 500;
const SEND_TIMEOUT_MS = 8000;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cityKey(city: string): string {
  return city.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface Place {
  city: string;
  state: string;
  cityKey: string;
}

function placeFrom(source: unknown): Place | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const city = cleanText(record.city, 80);
  // Not sliced to 2 first: "XYZ" must fail, not become "XY".
  const state = cleanText(record.state, 10).toUpperCase();
  if (!city || !/^[A-Z]{2}$/.test(state)) return null;
  // A ZIP typed into the City box is private data; never store it.
  if (/^\d{5}(-\d{4})?$/.test(city)) return null;
  return { city, state, cityKey: cityKey(city) };
}

// ── joinWaitlist ─────────────────────────────────────────────────────────────

export const joinWaitlist = functions.https.onCall(async (_data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to join the waitlist.');
  }

  // The place comes ONLY from the person's own dog profile (its public city/state), never
  // from arguments: nobody can join the list for a city they didn't put on their profile.
  const dogSnap = await db().doc(`dogs/${uid}`).get();
  const place = placeFrom(dogSnap.data());
  if (!place) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Add a city and state to your dog’s profile first, so we know where to look.',
    );
  }

  const ref = db().doc(`waitlist/${uid}`);
  const now = Timestamp.now();
  const { joinedAt, alreadyJoined } = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.data();
    const samePlace = existing && existing.state === place.state && existing.cityKey === place.cityKey;
    if (snap.exists && samePlace && existing?.joinedAt instanceof Timestamp) {
      return { joinedAt: existing.joinedAt as Timestamp, alreadyJoined: true };
    }
    tx.set(ref, {
      city: place.city,
      state: place.state,
      cityKey: place.cityKey,
      joinedAt: now,
      // A new place starts a fresh cooldown; keep the old one if only re-joining.
      ...(snap.exists && samePlace ? {} : { lastNotifiedAt: FieldValue.delete(), notifyCount: 0 }),
    }, { merge: true });
    return { joinedAt: now, alreadyJoined: false };
  });

  const sameCity = db()
    .collection('waitlist')
    .where('state', '==', place.state)
    .where('cityKey', '==', place.cityKey);
  const [before, total] = await Promise.all([
    sameCity.where('joinedAt', '<', joinedAt).count().get(),
    sameCity.count().get(),
  ]);

  return {
    position: before.data().count + 1,
    total: total.data().count,
    city: place.city,
    state: place.state,
    alreadyJoined,
  };
});

export const leaveWaitlist = functions.https.onCall(async (_data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  await db().doc(`waitlist/${uid}`).delete();
  return { left: true };
});

// ── The trigger ──────────────────────────────────────────────────────────────

type DogDoc = FirebaseFirestore.DocumentData;

/** The public dog doc has everything a swipe card needs. Mirrors shared/profile.ts isProfileComplete. */
function isCompleteDog(dog: DogDoc | undefined): boolean {
  if (!dog) return false;
  const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const hasCoords =
    typeof dog.lat === 'number' && Number.isFinite(dog.lat) && typeof dog.lng === 'number' && Number.isFinite(dog.lng);
  const hasLocation = hasCoords || (filled(dog.city) && filled(dog.state)) || filled(dog.location);
  return (
    count(dog.photos) >= 3 &&
    filled(dog.name) &&
    filled(dog.breed) &&
    filled(dog.age) &&
    filled(dog.sex) &&
    filled(dog.size) &&
    typeof dog.energyLevel === 'number' &&
    (count(dog.temperament) >= 1 || count(dog.playStyles) >= 1) &&
    hasLocation
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

interface PushTokensDoc {
  expoPushTokens?: string[];
  fcmWebTokens?: string[];
}

async function readTokens(uid: string): Promise<{ expo: string[]; web: string[] }> {
  const snap = await db().doc(`users/${uid}/private/push`).get();
  const tokens = (snap.data() ?? {}) as PushTokensDoc;
  return {
    expo: (tokens.expoPushTokens ?? []).filter(Boolean),
    web: (tokens.fcmWebTokens ?? []).filter(Boolean),
  };
}

async function sendPush(
  uid: string,
  tokens: { expo: string[]; web: string[] },
  payload: { title: string; body: string; data: Record<string, string> },
): Promise<void> {
  const staleExpo: string[] = [];
  const staleWeb: string[] = [];

  if (tokens.expo.length > 0) {
    try {
      const res = await withTimeout(
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokens.expo.map((to) => ({
            to, title: payload.title, body: payload.body, data: payload.data, sound: 'default',
          }))),
        }).then((r) => r.json() as Promise<{ data?: Array<{ status: string; details?: { error?: string } }> }>),
        SEND_TIMEOUT_MS,
      );
      res?.data?.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') staleExpo.push(tokens.expo[i]);
      });
    } catch (error) {
      console.warn('waitlist: Expo push failed', { uid, error: String(error) });
    }
  }

  if (tokens.web.length > 0) {
    try {
      const response = await withTimeout(
        admin.messaging().sendEachForMulticast({
          tokens: tokens.web,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          webpush: { fcmOptions: { link: payload.data.link ?? 'https://godoggydate.com/app' } },
        }),
        SEND_TIMEOUT_MS,
      );
      response?.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') staleWeb.push(tokens.web[i]);
      });
    } catch (error) {
      console.warn('waitlist: FCM push failed', { uid, error: String(error) });
    }
  }

  if (staleExpo.length > 0 || staleWeb.length > 0) {
    await db().doc(`users/${uid}/private/push`).set({
      ...(staleExpo.length > 0 ? { expoPushTokens: FieldValue.arrayRemove(...staleExpo) } : {}),
      ...(staleWeb.length > 0 ? { fcmWebTokens: FieldValue.arrayRemove(...staleWeb) } : {}),
    }, { merge: true });
  }
}

async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    db().doc(`blocks/${a}/blocked/${b}`).get(),
    db().doc(`blocks/${b}/blocked/${a}`).get(),
  ]);
  return x.exists || y.exists;
}

/**
 * Tell the waitlisted owners in this city. The trigger below is the only caller.
 * Returns how many owners were notified.
 */
async function notifyWaitlistForNewDog(dogUid: string, place: Place): Promise<number> {
  const waiting = await db()
    .collection('waitlist')
    .where('state', '==', place.state)
    .where('cityKey', '==', place.cityKey)
    .limit(MAX_NOTIFIED_PER_DOG)
    .get();

  let notified = 0;
  for (const entry of waiting.docs) {
    const waitingUid = entry.id;
    if (waitingUid === dogUid) continue;
    try {
      if (await isBlockedEitherWay(waitingUid, dogUid)) continue;

      // No push token, nothing to send, nothing to use up: the cooldown is only
      // spent when there was somebody to tell.
      const tokens = await readTokens(waitingUid);
      if (tokens.expo.length === 0 && tokens.web.length === 0) continue;

      // At most one push per person per day, however many dogs arrive.
      const shouldSend = await db().runTransaction(async (tx) => {
        const fresh = await tx.get(entry.ref);
        const last = fresh.data()?.lastNotifiedAt;
        if (last instanceof Timestamp && Date.now() - last.toMillis() < PUSH_COOLDOWN_MS) return false;
        tx.set(entry.ref, {
          lastNotifiedAt: Timestamp.now(),
          notifyCount: FieldValue.increment(1),
        }, { merge: true });
        return true;
      });
      if (!shouldSend) continue;

      await sendPush(waitingUid, tokens, {
        title: 'GoDoggyDate',
        // The waitlister's own city text (matching is by normalized name), never text from the new dog.
        body: `A neighbor just joined GoDoggyDate near ${cleanText(entry.data().city, 80) || place.city}`,
        data: { type: 'waitlist_neighbor', link: 'https://godoggydate.com/app' },
      });
      notified += 1;
    } catch (error) {
      console.error('waitlist: could not notify', { waitingUid, error: String(error) });
    }
  }
  return notified;
}

export const onDogJoinedWaitlistedCity = functions.firestore
  .document('dogs/{uid}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : undefined;
    if (!after || !isCompleteDog(after)) return;
    const place = placeFrom(after);
    if (!place) return; // not discoverable by city: nobody could be waiting for it

    const before = change.before.exists ? change.before.data() : undefined;
    const wasHere = isCompleteDog(before) && placeFrom(before)?.cityKey === place.cityKey && placeFrom(before)?.state === place.state;
    if (wasHere) return; // an edit to a dog who was already there is not a new neighbor

    const uid = context.params.uid as string;
    const notified = await notifyWaitlistForNewDog(uid, place);
    if (notified > 0) console.info('waitlist: neighbors told', { dog: uid, city: place.city, state: place.state, notified });
  });

export const onWaitlistUserDeleted = functions.auth.user().onDelete(async (user) => {
  await db().doc(`waitlist/${user.uid}`).delete().catch(() => undefined);
});
