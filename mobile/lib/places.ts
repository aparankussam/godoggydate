// mobile/lib/places.ts
// Client wiring for "Where we go" (see firebase/functions/src/places.ts).
// Tags are created by the tagPlace callable (content filter + limits) and
// removed straight from Firestore (owner-delete rule); counts live in the
// public places/ docs, which exist only once >= 3 owners use a place.

import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from './firebase';
import { submitReport } from './reports';
import type { PackDay } from '../../shared/packDay';
import type { PlaceCategory } from '../../shared/places';

export interface MyPlaceTag {
  placeId: string;
  category: PlaceCategory;
  name: string;
  city: string;
  /** Distinct owners, or null while the place has fewer than 3 (count stays private). */
  ownerCount: number | null;
}

export interface PublicPlace {
  placeId: string;
  category: PlaceCategory;
  name: string;
  city: string;
  mapUrl?: string;
  ownerCount: number;
}

function call<Req, Res>(name: string) {
  return httpsCallable<Req, Res>(getFunctions(getFirebase().app, 'us-central1'), name);
}

export function placeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  // Transport failures carry only a bare code ("internal", "unavailable").
  return message && !/^[a-z]+([-_][a-z]+)*$/i.test(message) ? message : fallback;
}

export async function tagPlace(input: { category: PlaceCategory; name: string; mapUrl?: string }): Promise<string> {
  return (await call<typeof input, { placeId: string }>('tagPlace')(input)).data.placeId;
}

export async function askPlaceRec(category: PlaceCategory): Promise<void> {
  await call<{ category: PlaceCategory }, { asked: boolean }>('askPlaceRec')({ category });
}

export async function removePlaceTag(uid: string, placeId: string): Promise<void> {
  await deleteDoc(doc(getFirebase().db, 'placeTags', `${uid}__${placeId}`));
}

export async function listMyPlaceTags(uid: string): Promise<MyPlaceTag[]> {
  const { db } = getFirebase();
  const tags = await getDocs(query(collection(db, 'placeTags'), where('ownerId', '==', uid), limit(50)));
  const rows = await Promise.all(
    tags.docs.map(async (d) => {
      const t = d.data();
      const pub = await getDoc(doc(db, 'places', String(t.placeId))).catch(() => null);
      return {
        placeId: String(t.placeId), category: t.category as PlaceCategory, name: String(t.name), city: String(t.city),
        ownerCount: pub?.exists() ? Number(pub.data().ownerCount) : null,
      };
    }),
  );
  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function toPublic(id: string, d: Record<string, unknown>): PublicPlace {
  return {
    placeId: id, category: d.category as PlaceCategory, name: String(d.name), city: String(d.city),
    ...(typeof d.mapUrl === 'string' ? { mapUrl: d.mapUrl } : {}), ownerCount: Number(d.ownerCount),
  };
}

export async function getPublicPlace(placeId: string): Promise<PublicPlace | null> {
  const snap = await getDoc(doc(getFirebase().db, 'places', placeId));
  return snap.exists() ? toPublic(snap.id, snap.data()) : null;
}

/** Places in a city for one category, most-used first. Equality filters only, so no composite index. */
export async function listPlaces(cityKey: string, category: PlaceCategory): Promise<PublicPlace[]> {
  const snap = await getDocs(
    query(collection(getFirebase().db, 'places'), where('cityKey', '==', cityKey), where('category', '==', category), limit(100)),
  );
  return snap.docs.map((d) => toPublic(d.id, d.data())).sort((a, b) => b.ownerCount - a.ownerCount);
}

/** Pack Days in a city, past and upcoming (members may read packDays/). Matches
 *  the host's city text exactly, as Pack Day does; capped. */
export async function listCityPackDays(city: string): Promise<Array<Pick<PackDay, 'id' | 'placeName' | 'status' | 'startsAtMs' | 'title' | 'localDate' | 'localTime'>>> {
  const snap = await getDocs(query(collection(getFirebase().db, 'packDays'), where('city', '==', city), limit(200)));
  return snap.docs.map((d) => {
    const e = d.data();
    return {
      id: d.id, placeName: String(e.placeName ?? ''), status: e.status === 'cancelled' ? 'cancelled' : 'open',
      startsAtMs: Number(e.startsAtMs ?? 0), title: String(e.title ?? ''),
      localDate: String(e.localDate ?? ''), localTime: String(e.localTime ?? ''),
    } as const;
  });
}

/** Reports go to the same ops queue as profile reports (source 'place'; targetUserId is the place id). */
export function reportPlace(reporterId: string, placeId: string) {
  return submitReport({ reporterId, targetUserId: placeId, source: 'place' }, 'inappropriate');
}
