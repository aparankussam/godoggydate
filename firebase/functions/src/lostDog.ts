// firebase/functions/src/lostDog.ts
// Lost dog alert, server side. Free for everyone. The client writes the alert
// (firestore.rules limits it to the owner's own dog and one active alert); these
// triggers then re-check that, stamp the owner's real city, and tell people:
//
//   onLostAlertCreated  checks the alert, then pushes the owner's matches and
//                       Pack Day regulars first and the rest of the city after
//   onLostAlertUpdated  when the owner marks the dog found, thanks everyone who
//                       reported a sighting while signed in
//   onLostSightingCreated  tells the owner (sightings are written by the website's
//                       /api/lost/sighting route through the Admin SDK)
//
// Location is stored by city, not GPS, so "the city" is dogs with the same city
// and state. index.ts passes in the helpers (push, block check) so this file
// never imports it. Content filter and photo policy are this package's mirrors.

import * as functions from 'firebase-functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { checkContent } from './contentFilter';
import { isOwnStoragePhotoUrl } from './photoUrl';
import type { PhotoUrlPolicy } from './photoUrl';
import { NEARBY_LAT_WINDOW, cleanLine, helpersToThank, nearbyMembers, planAudience } from './lostDogLogic';

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGHTING_PUSH_GAP_MS = 2 * 60 * 1000;
const CHUNK = 25;

export interface LostDogPush {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface LostDogDeps {
  db: FirebaseFirestore.Firestore;
  sendPushToUser: (uid: string, payload: LostDogPush) => Promise<void>;
  isBlockedEitherWay: (uidA: string, uidB: string) => Promise<boolean>;
  photoUrlPolicy: () => PhotoUrlPolicy;
}

/** Text the owner typed, kept only if it is short and passes the content filter. */
function cleanOwnerText(value: unknown, max: number): string {
  const text = cleanLine(value, max);
  return text && checkContent(text).ok ? text : '';
}

export function makeLostDogFunctions({ db, sendPushToUser, isBlockedEitherWay, photoUrlPolicy }: LostDogDeps) {
  async function pushAll(uids: string[], ownerId: string, payload: LostDogPush): Promise<number> {
    let sent = 0;
    for (let i = 0; i < uids.length; i += CHUNK) {
      await Promise.all(uids.slice(i, i + CHUNK).map(async (uid) => {
        try {
          if (await isBlockedEitherWay(uid, ownerId)) return;
          await sendPushToUser(uid, payload);
          sent += 1;
        } catch (error) {
          console.warn('lost dog push failed', { uid, error });
        }
      }));
    }
    return sent;
  }

  async function matchPartners(uid: string): Promise<string[]> {
    const [a, b] = await Promise.all([
      db.collection('matches').where('dog1UserId', '==', uid).get(),
      db.collection('matches').where('dog2UserId', '==', uid).get(),
    ]);
    return [
      ...a.docs.map((d) => d.data().dog2UserId as string),
      ...b.docs.map((d) => d.data().dog1UserId as string),
    ];
  }

  async function packDayAttendees(city: string, state: string): Promise<string[]> {
    const events = await db.collection('packDays').where('city', '==', city).limit(50).get();
    const out: string[] = [];
    for (const e of events.docs) {
      const data = e.data();
      if (state && data.state && data.state !== state) continue;
      for (const uid of (data.attendeeUids as string[] | undefined) ?? []) out.push(uid);
    }
    return out;
  }

  async function cityMembers(city: string, state: string): Promise<string[]> {
    const dogs = await db.collection('dogs').where('city', '==', city).where('state', '==', state).limit(600).get();
    return dogs.docs.map((d) => d.id);
  }

  // Members around where the dog went missing (a ~1 km pin from the alert
  // screen's "Use where I am now"), whichever city they're in. One range query
  // on lat, then distance in memory: no geohash index needed.
  async function membersNearPin(lat: number, lng: number): Promise<string[]> {
    const dogs = await db.collection('dogs')
      .where('lat', '>=', lat - NEARBY_LAT_WINDOW)
      .where('lat', '<=', lat + NEARBY_LAT_WINDOW)
      .limit(2000)
      .get();
    return nearbyMembers(dogs.docs.map((d) => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng') })), { lat, lng });
  }
  const onLostAlertCreated = functions.firestore
    .document('lostAlerts/{alertId}')
    .onCreate(async (snap, context) => {
      const { alertId } = context.params as { alertId: string };
      const raw = snap.data();
      const ownerId = typeof raw.ownerId === 'string' ? raw.ownerId : '';
      if (!ownerId || raw.status !== 'active' || raw.notifiedAt) return;

      // Server-side "one active alert": rules already require the pointer, this
      // covers anything that got past them. The earlier alert wins.
      const active = await db.collection('lostAlerts').where('ownerId', '==', ownerId).where('status', '==', 'active').get();
      const mine = (raw.createdAt as Timestamp | undefined)?.toMillis() ?? 0;
      const isEarlier = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
        const at = (d.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0;
        return at < mine || (at === mine && d.id < alertId);
      };
      if (active.docs.some((d) => d.id !== alertId && isEarlier(d))) {
        console.warn('lost dog: second active alert removed', { alertId, ownerId });
        await snap.ref.delete();
        return;
      }

      // The profile is the source of truth for who and where. Whatever the client
      // sent for name, city and state is replaced, so an alert can't point at a
      // city the owner doesn't live in.
      const dogSnap = await db.doc(`dogs/${ownerId}`).get();
      const dog = dogSnap.data();
      if (!dog) { await snap.ref.delete(); return; }
      const city = cleanLine(dog.city, 80);
      const state = cleanLine(dog.state, 40);
      const dogName = cleanLine(dog.name, 60) || 'A dog';
      const photoUrl = isOwnStoragePhotoUrl(raw.photoUrl, ownerId, photoUrlPolicy()) ? (raw.photoUrl as string) : FieldValue.delete();
      const medicines = Array.isArray(raw.medicines)
        ? (raw.medicines as unknown[]).map((m) => cleanOwnerText(m, 60)).filter(Boolean).slice(0, 5)
        : [];

      // One earlier alert in the last day means a repeat: the owner's own people
      // are still told, the whole city is not.
      const earlier = await db.collection('lostAlerts').where('ownerId', '==', ownerId).limit(10).get();
      const nowMs = Date.now();
      // Where the dog went missing, rounded to ~1 km so the public alert never holds an exact spot.
      const pin = typeof raw.lostLat === 'number' && typeof raw.lostLng === 'number'
        && Math.abs(raw.lostLat) <= 90 && Math.abs(raw.lostLng) <= 180
        ? { lat: Math.round(raw.lostLat * 100) / 100, lng: Math.round(raw.lostLng * 100) / 100 }
        : null;
      const repeat = earlier.docs.some((d) => d.id !== alertId && nowMs - ((d.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0) < DAY_MS);

      await snap.ref.update({
        dogName,
        city,
        state,
        photoUrl,
        medicines,
        markings: cleanOwnerText(raw.markings, 200),
        lastSeen: cleanOwnerText(raw.lastSeen, 80),
        lostLat: pin ? pin.lat : FieldValue.delete(),
        lostLng: pin ? pin.lng : FieldValue.delete(),
        notifiedAt: FieldValue.serverTimestamp(),
      });

      const audience = planAudience({
        ownerId,
        nearbyMembers: pin && !repeat ? await membersNearPin(pin.lat, pin.lng) : [],
        matchPartners: await matchPartners(ownerId),
        packDayAttendees: city ? await packDayAttendees(city, state) : [],
        cityMembers: city && state ? await cityMembers(city, state) : [],
        broadcast: !repeat,
      });
      const payload: LostDogPush = {
        title: `🚨 ${dogName} is missing${city ? ` near ${city}` : ''}`,
        body: 'Tap to see the poster. If you spot this dog, tell the owner.',
        data: { type: 'lost', alertId, kind: 'alert' },
      };
      // Raised by a sitter or other household member: the owner hears first, by
      // name, and the person who raised it is not told about their own alert.
      const raisedBy = typeof raw.raisedBy === 'string' && raw.raisedBy !== ownerId ? raw.raisedBy : null;
      if (raisedBy) {
        await sendPushToUser(ownerId, {
          title: `🚨 ${dogName} was reported lost`,
          body: 'Someone in your household raised the alert. Tap to see it and the sightings.',
          data: { type: 'lost', alertId, kind: 'owner' },
        }).catch((err: unknown) => console.warn('lost dog: owner push failed', err));
        audience.first = audience.first.filter((u) => u !== raisedBy);
        audience.rest = audience.rest.filter((u) => u !== raisedBy);
      }
      const first = await pushAll(audience.first, ownerId, payload);
      const rest = await pushAll(audience.rest, ownerId, payload);
      await snap.ref.update({ notifiedFirst: first, notifiedRest: rest });
    });

  const onLostAlertUpdated = functions.firestore
    .document('lostAlerts/{alertId}')
    .onUpdate(async (change, context) => {
      const { alertId } = context.params as { alertId: string };
      const before = change.before.data();
      const after = change.after.data();
      if (before.status !== 'active' || after.status !== 'found' || after.thanksSentAt) return;
      await change.after.ref.update({ thanksSentAt: FieldValue.serverTimestamp() });

      const ownerId = after.ownerId as string;
      const sightings = await change.after.ref.collection('sightings').limit(200).get();
      const helpers = helpersToThank(sightings.docs.map((d) => d.data()), ownerId);
      const dogName = (after.dogName as string) || 'The dog';
      await pushAll(helpers, ownerId, {
        title: `🎉 ${dogName} is home!`,
        body: 'Thank you for helping look. Your report made a difference.',
        data: { type: 'lost', alertId, kind: 'found' },
      });
    });

  const onLostSightingCreated = functions.firestore
    .document('lostAlerts/{alertId}/sightings/{sightingId}')
    .onCreate(async (_snap, context) => {
      const { alertId } = context.params as { alertId: string };
      const alertRef = db.doc(`lostAlerts/${alertId}`);
      const alert = (await alertRef.get()).data();
      if (!alert || alert.status !== 'active') return;
      // One push every couple of minutes at most, however many reports arrive.
      const last = (alert.lastSightingPushAt as Timestamp | undefined)?.toMillis() ?? 0;
      if (Date.now() - last < SIGHTING_PUSH_GAP_MS) return;
      await alertRef.update({ lastSightingPushAt: FieldValue.serverTimestamp() });
      await sendPushToUser(alert.ownerId as string, {
        title: `👀 Someone may have seen ${(alert.dogName as string) || 'your dog'}`,
        body: 'Open the app to see where and what they said.',
        data: { type: 'lost', alertId, kind: 'sighting' },
      });
    });

  return { onLostAlertCreated, onLostAlertUpdated, onLostSightingCreated };
}
