// mobile/lib/packGroup.ts
// Client wiring for recurring Pack Day groups. Reads come straight from
// Firestore (signed-in members may read packGroups/ and packDays/); every write
// goes through a callable in firebase/functions/src/packGroups.ts. Types,
// limits and copy live in shared/packGroup.ts.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from './firebase';
import { toPackDay } from './packDay';
import type { PackDay, PackDayFormat } from '../../shared/packDay';
import type { PackGroup, PackGroupFrequency, PackGroupStatus } from '../../shared/packGroup';

export { packDayErrorMessage } from './packDay';

export interface CreatePackGroupInput {
  name: string;
  tags: string[];
  smallDogsOnly: boolean;
  frequency: PackGroupFrequency;
  /** 'YYYY-MM-DD' of the first meetup, in the host's calendar. */
  firstLocalDate: string;
  localTime: string;
  timeZone: string;
  durationMinutes: number;
  placeName: string;
  note: string;
  capacity: number;
  acceptedRules: true;
}

export type PackGroupPatch = Partial<{
  name: string;
  placeName: string;
  note: string;
  tags: string[];
  capacity: number;
  durationMinutes: number;
  frequency: PackGroupFrequency;
  localTime: string;
  smallDogsOnly: boolean;
  status: PackGroupStatus;
}>;

function callable<Req, Res>(name: string) {
  const { app } = getFirebase();
  return httpsCallable<Req, Res>(getFunctions(app, 'us-central1'), name);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u: unknown): u is string => typeof u === 'string') : []);

function toPackGroup(id: string, data: DocumentData): PackGroup {
  return {
    id,
    name: String(data.name ?? ''),
    hostUid: String(data.hostUid ?? ''),
    hostDogName: String(data.hostDogName ?? ''),
    city: String(data.city ?? ''),
    state: String(data.state ?? ''),
    placeName: String(data.placeName ?? ''),
    note: String(data.note ?? ''),
    format: (data.format as PackDayFormat) ?? 'pack-walk',
    tags: strings(data.tags),
    smallDogsOnly: data.smallDogsOnly === true,
    capacity: Number(data.capacity ?? 0),
    durationMinutes: Number(data.durationMinutes ?? 60),
    frequency: (data.frequency as PackGroupFrequency) ?? 'weekly',
    weekday: Number(data.weekday ?? 0),
    localTime: String(data.localTime ?? '09:00'),
    timeZone: String(data.timeZone ?? ''),
    status: data.status === 'paused' ? 'paused' : 'active',
    memberUids: strings(data.memberUids),
    removedUids: strings(data.removedUids),
  };
}

export async function createPackGroup(input: CreatePackGroupInput): Promise<{ groupId: string; eventId: string }> {
  return (await callable<CreatePackGroupInput, { groupId: string; eventId: string }>('createPackGroup')(input)).data;
}

export async function joinPackGroup(groupId: string): Promise<void> {
  await callable<{ groupId: string }, unknown>('joinPackGroup')({ groupId });
}

export async function leavePackGroup(groupId: string): Promise<void> {
  await callable<{ groupId: string }, unknown>('leavePackGroup')({ groupId });
}

export async function updatePackGroup(groupId: string, patch: PackGroupPatch): Promise<void> {
  await callable<{ groupId: string; patch: PackGroupPatch }, unknown>('updatePackGroup')({ groupId, patch });
}

export async function removePackGroupMember(groupId: string, uid: string): Promise<void> {
  await callable<{ groupId: string; uid: string }, unknown>('removePackGroupMember')({ groupId, uid });
}

/** Host's "Moved": same time of day, new date, RSVPs notified. ("Cancelled" is cancelPackDay.) */
export async function movePackDay(eventId: string, localDate: string): Promise<void> {
  await callable<{ eventId: string; localDate: string }, unknown>('movePackDay')({ eventId, localDate });
}

export async function getPackGroup(groupId: string): Promise<PackGroup | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'packGroups', groupId));
  return snap.exists() ? toPackGroup(snap.id, snap.data()) : null;
}

/** Groups you follow or host (any status), plus active ones to discover.
 *  Two single-field queries (no composite index); capped. */
export async function listPackGroups(uid: string): Promise<{ mine: PackGroup[]; discover: PackGroup[] }> {
  const { db } = getFirebase();
  const [mineSnap, activeSnap] = await Promise.all([
    getDocs(query(collection(db, 'packGroups'), where('memberUids', 'array-contains', uid), limit(30))),
    getDocs(query(collection(db, 'packGroups'), where('status', '==', 'active'), limit(60))),
  ]);
  const mine = mineSnap.docs.map((d) => toPackGroup(d.id, d.data()));
  const mineIds = new Set(mine.map((g) => g.id));
  return { mine, discover: activeSnap.docs.filter((d) => !mineIds.has(d.id)).map((d) => toPackGroup(d.id, d.data())) };
}

/** A group's 40 latest meetups, soonest first. Needs the packDays groupId + startsAtMs index. */
export async function listGroupOccurrences(groupId: string): Promise<PackDay[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, 'packDays'), where('groupId', '==', groupId), orderBy('startsAtMs', 'desc'), limit(40)));
  return snap.docs.map((d) => toPackDay(d.id, d.data())).sort((a, b) => a.startsAtMs - b.startsAtMs);
}
