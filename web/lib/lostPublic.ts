// web/lib/lostPublic.ts
// Server-only loader for the public lost-dog page and its share image. Admin SDK,
// STRICT ALLOWLIST like lib/packDayPublic.ts: it never spreads a document. There
// is no owner phone, address or uid here to leak, and sightings are reduced to a
// count and a ~1 km area, never the exact pin, the message, the photo or the
// finder's contact details (those stay in the owner-only sightings docs).

import { getAdminDb } from './firebaseAdmin';
import { trustedPhotoUrl } from './trustedPhotoUrl';
import { coarsenPin, isValidLostId, type LostAlert } from '../../shared/lostDog';

export type PublicLostAlert = Omit<LostAlert, 'ownerId'>;

export interface PublicLostPage {
  alert: PublicLostAlert;
  sightingCount: number;
  /** The most recent report, as a rounded area only. */
  lastSighting: { atMs: number; lat: number; lng: number } | null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function loadPublicLostAlert(id: string): Promise<PublicLostPage | null> {
  if (!isValidLostId(id)) return null;
  try {
    const ref = getAdminDb().doc(`lostAlerts/${id}`);
    const snap = await ref.get();
    const raw = snap.data();
    if (!raw || typeof raw.dogName !== 'string') return null;

    const recent = await ref.collection('sightings').orderBy('createdAt', 'desc').limit(1).get();
    const countSnap = await ref.collection('sightings').count().get();
    const last = recent.docs[0]?.data();
    const area = last ? coarsenPin(last.area?.lat, last.area?.lng) : null;

    return {
      alert: {
        id: snap.id,
        dogName: text(raw.dogName, 60),
        breed: text(raw.breed, 80) || undefined,
        size: text(raw.size, 20) || undefined,
        markings: text(raw.markings, 200) || undefined,
        photoUrl: trustedPhotoUrl(raw.photoUrl) ?? undefined,
        microchipped: raw.microchipped === true,
        medicines: Array.isArray(raw.medicines) ? raw.medicines.filter((m: unknown) => typeof m === 'string').slice(0, 5) : [],
        lastSeen: text(raw.lastSeen, 80) || undefined,
        city: text(raw.city, 80),
        state: text(raw.state, 40),
        status: raw.status === 'found' ? 'found' : 'active',
        createdAtMs: raw.createdAt?.toMillis?.() ?? 0,
        foundAtMs: raw.foundAt?.toMillis?.() ?? undefined,
      },
      sightingCount: countSnap.data().count,
      lastSighting: last && area ? { atMs: last.createdAt?.toMillis?.() ?? 0, ...area } : null,
    };
  } catch (error) {
    console.error('public lost alert: failed to load', id, error);
    return null;
  }
}
