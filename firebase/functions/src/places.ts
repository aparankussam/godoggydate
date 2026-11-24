// firebase/functions/src/places.ts
// "Where we go": owners tag the vet, groomer, daycare, trainer or park they
// use. No reviews, no ratings: a tag is just "we go here".
//
//   placeTags/{uid}__{placeId}  one owner's tag. Owner-readable and
//                               owner-deletable only (firestore.rules); created
//                               here, after the content filter.
//   places/{placeId}            public count doc, written ONLY by
//                               onPlaceTagWritten and ONLY while at least
//                               PLACE_MIN_OWNERS distinct owners use the place,
//                               so a count can never point at a single dog.
//   placeAsks/{uid}__{category} "Ask for a rec" record (once a day per category);
//                               the city feed can read it.

import * as functions from 'firebase-functions';
import { checkContent, CONTENT_FILTER_MESSAGE } from './contentFilter';
import {
  isPlaceCategory, PLACE_CATEGORIES, PLACE_MAX_TAGS_PER_OWNER, PLACE_MIN_OWNERS, PLACE_NAME_MAX,
  placeCityKey, placeIdFor,
} from './placeKeys';
import type { PlaceCategory } from './placeKeys';

const HttpsError = functions.https.HttpsError;
const ASK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_ASK_RECIPIENTS = 50;
// Map links: only the big map apps, so a place link can't point at spam.
const MAP_LINK = /^https:\/\/(maps\.apple\.com|maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|google\.com\/maps|maps\.google\.com)(\/|\?|$)/i;
// Contact details and links in a NAME are how a listing gets used for spam.
const CONTACT_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|app)\b|@|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/i;

export interface PlaceDeps {
  db: FirebaseFirestore.Firestore;
  sendPushToUser: (uid: string, payload: { title: string; body: string; data: Record<string, string> }) => Promise<void>;
  isBlockedEitherWay: (uidA: string, uidB: string) => Promise<boolean>;
}

export function cleanPlaceName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Enter the place’s name.');
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) throw new HttpsError('invalid-argument', 'Enter the place’s name.');
  if (name.length > PLACE_NAME_MAX) throw new HttpsError('invalid-argument', `Keep the name to ${PLACE_NAME_MAX} characters.`);
  if (CONTACT_PATTERN.test(name)) throw new HttpsError('invalid-argument', 'Just the place’s name, without links or contact details.');
  if (!checkContent(name).ok) throw new HttpsError('invalid-argument', CONTENT_FILTER_MESSAGE);
  return name;
}

/** The caller's city, from their public dog profile. */
async function callerPlace(db: PlaceDeps['db'], uid: string) {
  const dog = (await db.doc(`dogs/${uid}`).get()).data() ?? {};
  const city = typeof dog.city === 'string' ? dog.city.trim() : '';
  const state = typeof dog.state === 'string' ? dog.state.trim() : '';
  if (!city || !state) throw new HttpsError('failed-precondition', 'Add your city to your dog’s profile first.');
  return { city, state, cityKey: placeCityKey(city, state) };
}

function requireUid(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return uid;
}

export function makePlaceFunctions({ db, sendPushToUser, isBlockedEitherWay }: PlaceDeps) {
  const tagPlace = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context);
    const category = data?.category;
    if (!isPlaceCategory(category)) throw new HttpsError('invalid-argument', 'Pick a category.');
    const name = cleanPlaceName(data?.name);
    const mapUrl = typeof data?.mapUrl === 'string' ? data.mapUrl.trim() : '';
    if (mapUrl && (mapUrl.length > 300 || !MAP_LINK.test(mapUrl))) {
      throw new HttpsError('invalid-argument', 'Use a link from Apple Maps or Google Maps.');
    }
    const place = await callerPlace(db, uid);
    const placeId = placeIdFor(place.cityKey, category, name);
    const ref = db.doc(`placeTags/${uid}__${placeId}`);
    if (!(await ref.get()).exists) {
      const mine = await db.collection('placeTags').where('ownerId', '==', uid).count().get();
      if (mine.data().count >= PLACE_MAX_TAGS_PER_OWNER) {
        throw new HttpsError('resource-exhausted', 'You’ve tagged as many places as we allow. Remove one first.');
      }
    }
    await ref.set({
      ownerId: uid, placeId, category, name, city: place.city, state: place.state, cityKey: place.cityKey,
      ...(mapUrl ? { mapUrl } : {}), createdAtMs: Date.now(),
    });
    return { placeId };
  });

  // Keeps the public count doc in step with the tags. Recounting (rather than
  // incrementing) makes it safe to run twice and to repair after any failure.
  const onPlaceTagWritten = functions.firestore.document('placeTags/{tagId}').onWrite(async (change) => {
    const placeId = (change.after.exists ? change.after : change.before).data()?.placeId;
    if (typeof placeId !== 'string') return;
    const tags = db.collection('placeTags').where('placeId', '==', placeId);
    const count = (await tags.count().get()).data().count;
    const ref = db.doc(`places/${placeId}`);
    if (count < PLACE_MIN_OWNERS) {
      await ref.delete();
      return;
    }
    const sample = (await tags.limit(1).get()).docs[0]?.data();
    if (!sample) return;
    await ref.set({
      category: sample.category, name: sample.name, city: sample.city, state: sample.state, cityKey: sample.cityKey,
      ...(sample.mapUrl ? { mapUrl: sample.mapUrl } : {}), ownerCount: count, updatedAtMs: Date.now(),
    });
  });

  // Push to owners in the caller's city who tagged this category. The asker
  // learns only whether it went out, never how many or who, so a quiet
  // category can't be used to unmask the one dog that tagged it.
  const askPlaceRec = functions.https.onCall(async (data, context) => {
    const uid = requireUid(context);
    const category = data?.category as PlaceCategory;
    if (!isPlaceCategory(category)) throw new HttpsError('invalid-argument', 'Pick a category.');
    const place = await callerPlace(db, uid);
    const askRef = db.doc(`placeAsks/${uid}__${category}`);
    const last = (await askRef.get()).data()?.createdAtMs;
    if (typeof last === 'number' && Date.now() - last < ASK_COOLDOWN_MS) {
      throw new HttpsError('resource-exhausted', 'You already asked about this today. Neighbors need a little time to answer.');
    }
    const owners = await db.collection('placeTags')
      .where('cityKey', '==', place.cityKey).where('category', '==', category).limit(MAX_ASK_RECIPIENTS).get();
    const recipients = [...new Set(owners.docs.map((d) => d.data().ownerId as string))].filter((o) => o !== uid);
    const noun = PLACE_CATEGORIES[category].noun;
    await Promise.all(recipients.map(async (to) => {
      if (await isBlockedEitherWay(uid, to)) return;
      await sendPushToUser(to, {
        title: 'A neighbor could use a rec',
        body: `Someone in ${place.city} is looking for a ${noun}. Open Where we go to see yours.`,
        data: { type: 'place_ask', category },
      }).catch(() => undefined);
    }));
    await askRef.set({ askerUid: uid, category, city: place.city, state: place.state, cityKey: place.cityKey, createdAtMs: Date.now() });
    return { asked: true };
  });

  return { tagPlace, onPlaceTagWritten, askPlaceRec };
}
