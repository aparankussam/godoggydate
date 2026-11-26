// mobile/lib/lostDog.ts
// Lost dog alert client. Free for everyone. The kit lives privately at
// users/{uid}/private/lostKit; an alert is lostAlerts/{id} plus the lostActive/{uid}
// pointer that firestore.rules uses to allow only ONE active alert per owner.
// Pure rules (medicine lines, poster facts, validation) are in shared/lostDog.ts.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebase } from './firebase';
import { webUrl } from './webLinks';
import { lostPageUrl, type LostAlert, type LostKit } from '../../shared/lostDog';

import { coarsenPin } from '../../shared/lostDog';
export { lostFacts, medicineNeeds, LOST_LIMITS } from '../../shared/lostDog';
export type { LostAlert, LostKit } from '../../shared/lostDog';

export function lostAlertUrl(id: string): string {
  return lostPageUrl(webUrl('/'), id);
}

function toMillis(v: unknown): number | undefined {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : undefined;
}

function toAlert(id: string, d: Record<string, unknown>): LostAlert {
  return {
    id,
    ownerId: String(d.ownerId ?? ''),
    dogName: String(d.dogName ?? ''),
    breed: typeof d.breed === 'string' ? d.breed : undefined,
    size: typeof d.size === 'string' ? d.size : undefined,
    markings: typeof d.markings === 'string' ? d.markings : undefined,
    photoUrl: typeof d.photoUrl === 'string' ? d.photoUrl : undefined,
    microchipped: d.microchipped === true,
    medicines: Array.isArray(d.medicines) ? d.medicines.filter((m): m is string => typeof m === 'string') : [],
    lastSeen: typeof d.lastSeen === 'string' ? d.lastSeen : undefined,
    city: String(d.city ?? ''),
    state: String(d.state ?? ''),
    status: d.status === 'found' ? 'found' : 'active',
    createdAtMs: toMillis(d.createdAt) ?? Date.now(),
    foundAtMs: toMillis(d.foundAt),
  };
}

export async function getLostKit(uid: string): Promise<LostKit> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'users', uid, 'private', 'lostKit'));
  return snap.exists() ? (snap.data() as LostKit) : {};
}

export async function saveLostKit(uid: string, kit: LostKit): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'users', uid, 'private', 'lostKit'), {
    photoUrl: kit.photoUrl ?? '',
    microchip: kit.microchip?.trim() ?? '',
    vetPhone: kit.vetPhone?.trim() ?? '',
    markings: kit.markings?.trim() ?? '',
    updatedAt: serverTimestamp(),
  });
}

/** The owner's active alert (there is at most one), live. */
export function onMyActiveAlert(uid: string, callback: (alert: LostAlert | null) => void): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, 'lostAlerts'), where('ownerId', '==', uid), where('status', '==', 'active'), limit(1));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs[0] ? toAlert(snap.docs[0].id, snap.docs[0].data()) : null),
    () => callback(null),
  );
}

export async function getLostAlert(id: string): Promise<LostAlert | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'lostAlerts', id));
  return snap.exists() ? toAlert(snap.id, snap.data()) : null;
}

export interface NewAlertInput {
  dogName: string;
  breed?: string;
  size?: string;
  markings?: string;
  photoUrl?: string;
  microchipped: boolean;
  medicines: string[];
  lastSeen?: string;
  city?: string;
  state?: string;
  /** Where the dog went missing, if the owner shared it: neighbors around it are told first. */
  lostPin?: { lat: number; lng: number } | null;
  /** A household member raising the alert for the owner's dog: the owner's uid. */
  forOwnerId?: string;
}

/** Opens the alert and its one-active pointer in a single batch (the rules need both together). */
export async function createLostAlert(uid: string, input: NewAlertInput): Promise<string> {
  // The dog doc id is the owner's uid; a sitter raises it for that dog and is recorded as raisedBy.
  const ownerId = input.forOwnerId || uid;
  const { db } = getFirebase();
  const ref = doc(collection(db, 'lostAlerts'));
  const clean = (v?: string) => (v?.trim() ? v.trim() : undefined);
  const data: Record<string, unknown> = {
    ownerId,
    dogId: ownerId,
    ...(ownerId !== uid ? { raisedBy: uid } : {}),
    dogName: input.dogName.trim().slice(0, 60) || 'My dog',
    microchipped: input.microchipped,
    medicines: input.medicines.slice(0, 5),
    status: 'active',
    createdAt: serverTimestamp(),
  };
  const optional = { breed: clean(input.breed), size: clean(input.size), markings: clean(input.markings), photoUrl: clean(input.photoUrl), lastSeen: clean(input.lastSeen), city: clean(input.city), state: clean(input.state) };
  for (const [k, v] of Object.entries(optional)) if (v) data[k] = v;
  const pin = input.lostPin ? coarsenPin(input.lostPin.lat, input.lostPin.lng) : null;
  if (pin) { data.lostLat = pin.lat; data.lostLng = pin.lng; }

  const batch = writeBatch(db);
  batch.set(ref, data);
  batch.set(doc(db, 'lostActive', ownerId), { alertId: ref.id, createdAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}

/** "Found": closes the alert and frees the owner to open another one later. */
export async function markDogFound(uid: string, alertId: string): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  batch.update(doc(db, 'lostAlerts', alertId), { status: 'found', foundAt: serverTimestamp() });
  batch.delete(doc(db, 'lostActive', uid));
  await batch.commit();
}

export interface Sighting {
  id: string;
  message: string;
  contact?: string;
  finderName?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  createdAtMs: number;
}

/** Sightings with the exact pin and the finder's contact: readable by the owner only. */
export function onSightings(alertId: string, callback: (s: Sighting[]) => void): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, 'lostAlerts', alertId, 'sightings'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        message: String(x.message ?? ''),
        contact: typeof x.contact === 'string' ? x.contact : undefined,
        finderName: typeof x.finderName === 'string' ? x.finderName : undefined,
        lat: typeof x.lat === 'number' ? x.lat : undefined,
        lng: typeof x.lng === 'number' ? x.lng : undefined,
        photoUrl: typeof x.photoUrl === 'string' ? x.photoUrl : undefined,
        createdAtMs: toMillis(x.createdAt) ?? Date.now(),
      };
    })),
    () => callback([]),
  );
}

export interface SightingReport {
  message: string;
  photoUri?: string;
  lat?: number;
  lng?: number;
}

/**
 * "I saw this dog" from the app. Goes through the same website route as the public
 * form (rate limits, content filter, photo checks), signed with the person's ID
 * token so they can be thanked when the dog is found. Returns an error message, or null.
 */
export async function reportSighting(alertId: string, report: SightingReport): Promise<string | null> {
  try {
    const { auth } = getFirebase();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return 'Sign in to report a sighting.';
    const form = new FormData();
    form.append('alertId', alertId);
    form.append('message', report.message);
    if (typeof report.lat === 'number' && typeof report.lng === 'number') {
      form.append('lat', String(report.lat));
      form.append('lng', String(report.lng));
    }
    if (report.photoUri) {
      // React Native's FormData takes a { uri, name, type } file descriptor.
      form.append('photo', { uri: report.photoUri, name: 'sighting.jpg', type: 'image/jpeg' } as unknown as Blob);
    }
    const res = await fetch(webUrl('/api/lost/sighting'), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return typeof body.error === 'string' ? body.error : 'Could not send that. Please try again.';
  } catch {
    return 'No connection. Please try again.';
  }
}

// ── "I'm helping look" ────────────────────────────────────────────────────────
// One doc per helper at lostAlerts/{id}/helpers/{uid}, holding only a timestamp.

/** Live count of neighbors helping, and whether `uid` is one of them. */
export function onHelpers(alertId: string, uid: string | undefined, callback: (h: { count: number; mine: boolean }) => void): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, 'lostAlerts', alertId, 'helpers'),
    (snap) => callback({ count: snap.size, mine: !!uid && snap.docs.some((d) => d.id === uid) }),
    () => callback({ count: 0, mine: false }),
  );
}

export async function setHelping(alertId: string, uid: string, helping: boolean): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, 'lostAlerts', alertId, 'helpers', uid);
  if (helping) await setDoc(ref, { createdAt: serverTimestamp() });
  else await deleteDoc(ref);
}
