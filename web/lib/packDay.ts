// web/lib/packDay.ts
// Client wiring for Pack Day. Reads come straight from Firestore (signed-in
// members may read packDays/); every write goes through a callable function,
// which enforces capacity, limits and blocks — see firebase/functions/src/packDay.ts.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/utils/firebase';
import { isPast } from '../../shared/packDay';
import type { PackDay, PackDayFormat } from '../../shared/packDay';

export interface CreatePackDayInput {
  title: string;
  format: PackDayFormat;
  startsAtMs: number;
  durationMinutes: number;
  localDate: string;
  localTime: string;
  placeName: string;
  note: string;
  capacity: number;
  acceptedRules: true;
}

function callable<Req, Res>(name: string) {
  const { app } = getFirebase();
  return httpsCallable<Req, Res>(getFunctions(app, 'us-central1'), name);
}

/** Callable errors carry the server's plain-language message after "…: ". */
export function packDayErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return message && !/^internal$/i.test(message) ? message : fallback;
}

export async function createPackDay(input: CreatePackDayInput): Promise<string> {
  const result = await callable<CreatePackDayInput, { eventId: string }>('createPackDay')(input);
  return result.data.eventId;
}

export async function joinPackDay(eventId: string): Promise<void> {
  await callable<{ eventId: string; action: 'join'; acceptedRules: true }, { joined: boolean }>('rsvpPackDay')({
    eventId,
    action: 'join',
    acceptedRules: true,
  });
}

export async function leavePackDay(eventId: string): Promise<void> {
  await callable<{ eventId: string; action: 'leave' }, { joined: boolean }>('rsvpPackDay')({
    eventId,
    action: 'leave',
  });
}

export async function cancelPackDay(eventId: string): Promise<void> {
  await callable<{ eventId: string }, { cancelled: boolean }>('cancelPackDay')({ eventId });
}

function toPackDay(id: string, data: DocumentData): PackDay {
  return {
    id,
    hostUid: String(data.hostUid ?? ''),
    hostDogName: String(data.hostDogName ?? ''),
    title: String(data.title ?? ''),
    format: (data.format as PackDayFormat) ?? 'pack-walk',
    startsAtMs: Number(data.startsAtMs ?? 0),
    durationMinutes: Number(data.durationMinutes ?? 60),
    localDate: String(data.localDate ?? ''),
    localTime: String(data.localTime ?? ''),
    placeName: String(data.placeName ?? ''),
    city: String(data.city ?? ''),
    state: String(data.state ?? ''),
    note: String(data.note ?? ''),
    capacity: Number(data.capacity ?? 0),
    attendeeUids: Array.isArray(data.attendeeUids) ? data.attendeeUids.filter((u): u is string => typeof u === 'string') : [],
    status: data.status === 'cancelled' ? 'cancelled' : 'open',
    official: data.official === true,
  };
}

export async function getPackDay(eventId: string): Promise<{ event: PackDay; foundingUids: string[] } | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'packDays', eventId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    event: toPackDay(snap.id, data),
    foundingUids: Array.isArray(data.foundingUids) ? data.foundingUids.filter((u): u is string => typeof u === 'string') : [],
  };
}

/** Upcoming open events, soonest first. One single-field range query (no
 *  composite index); status and city are filtered here. Capped, which is far
 *  more than one community will have. */
export async function listUpcomingPackDays(nowMs: number = Date.now()): Promise<PackDay[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, 'packDays'), where('startsAtMs', '>', nowMs - 3 * 60 * 60 * 1000), orderBy('startsAtMs'), limit(60)),
  );
  return snap.docs
    .map((d) => toPackDay(d.id, d.data()))
    .filter((event) => event.status === 'open' && !isPast(event, nowMs));
}

export function packDayUrl(eventId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
  return `${origin}/pack/${eventId}`;
}
