// mobile/lib/packDayChat.ts
// Pack Day group chat, client side. Messages are packDays/{eventId}/messages
// (members = the event's RSVP list; firestore.rules also ends writes 48 hours
// after the event). Pin, mute and remove go through the packDayChatHost callable.
// Pure rules (phases, who is visible, class-photo members) are in
// shared/packDayChat.ts. The 1:1 chat's content filter and report sheet are
// reused as they are (shared/contentFilter, lib/reports).

import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { checkContent } from '../../shared/contentFilter';
import {
  CHAT_MAX_TEXT,
  CHAT_RAIN_CHECK_TEXT,
  type PackDayMessageKind,
} from '../../shared/packDayChat';
import { getFirebase } from './firebase';
import { uploadPhotoAt } from './storage';

export interface PackDayMessage {
  id: string;
  fromUserId: string;
  text: string;
  kind: PackDayMessageKind;
  photoUrl: string | null;
  createdAt: number;
  moderated: boolean;
}

export interface PackDayChatControl {
  pinned: { messageId: string; text: string; kind: string; fromUserId: string } | null;
  mutedUids: string[];
  removedUids: string[];
}

export const EMPTY_CONTROL: PackDayChatControl = { pinned: null, mutedUids: [], removedUids: [] };

/** How many of the newest messages to keep live. Photos are messages too. */
const CHAT_WINDOW = 200;

function toMessage(d: QueryDocumentSnapshot): PackDayMessage {
  // 'estimate' gives a just-sent message its local time instead of null.
  const data = d.data({ serverTimestamps: 'estimate' });
  const kind = ['text', 'here', 'late', 'headsup', 'photo'].includes(data.kind) ? data.kind : 'text';
  return {
    id: d.id,
    fromUserId: String(data.fromUserId ?? ''),
    text: typeof data.text === 'string' ? data.text : '',
    kind,
    photoUrl: kind === 'photo' && typeof data.photoUrl === 'string' ? data.photoUrl : null,
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    moderated: data.moderated === true,
  };
}

export function subscribePackDayMessages(
  eventId: string,
  onMessages: (messages: PackDayMessage[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  return onSnapshot(
    query(collection(db, 'packDays', eventId, 'messages'), orderBy('createdAt', 'desc'), limit(CHAT_WINDOW)),
    (snap) => onMessages(snap.docs.map(toMessage).reverse()),
    onError,
  );
}

export function subscribePackDayControl(eventId: string, onControl: (c: PackDayChatControl) => void): Unsubscribe {
  const { db } = getFirebase();
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return onSnapshot(
    doc(db, 'packDays', eventId, 'chatControl', 'state'),
    (snap) => {
      const data = snap.data();
      const p = data?.pinned;
      onControl({
        pinned: p && typeof p.messageId === 'string'
          ? { messageId: p.messageId, text: String(p.text ?? ''), kind: String(p.kind ?? 'text'), fromUserId: String(p.fromUserId ?? '') }
          : null,
        mutedUids: strings(data?.mutedUids),
        removedUids: strings(data?.removedUids),
      });
    },
    () => onControl(EMPTY_CONTROL),
  );
}

export class ChatContentError extends Error {}

async function post(eventId: string, uid: string, kind: PackDayMessageKind, text: string, photoUrl?: string): Promise<void> {
  const { db } = getFirebase();
  await addDoc(collection(db, 'packDays', eventId, 'messages'), {
    fromUserId: uid,
    text,
    kind,
    ...(photoUrl ? { photoUrl } : {}),
    createdAt: serverTimestamp(),
  });
}

/** A typed message. Filtered here like the 1:1 chat (Apple 1.2); the server filters again. */
export async function sendPackDayText(eventId: string, uid: string, text: string): Promise<void> {
  const trimmed = text.trim().slice(0, CHAT_MAX_TEXT);
  if (!trimmed) return;
  if (!checkContent(trimmed).ok) throw new ChatContentError('content filter');
  await post(eventId, uid, 'text', trimmed);
}

/** "I'm here 📍" and "Running late": the kind carries the meaning, the text stays empty. */
export async function sendPackDayQuick(eventId: string, uid: string, kind: 'here' | 'late'): Promise<void> {
  await post(eventId, uid, kind, '');
}

/** Host only (firestore.rules): the one-tap weather check. */
export async function sendPackDayRainCheck(eventId: string, uid: string): Promise<void> {
  await post(eventId, uid, 'headsup', CHAT_RAIN_CHECK_TEXT);
}

export async function sendPackDayPhoto(eventId: string, uid: string, localUri: string, mimeType: string): Promise<void> {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const url = await uploadPhotoAt(`packDays/${eventId}/photos/${uid}/${Date.now()}.${ext}`, localUri, mimeType);
  await post(eventId, uid, 'photo', '', url);
}

export type HostAction = 'pin' | 'unpin' | 'mute' | 'unmute' | 'remove';

export async function packDayHostAction(
  eventId: string,
  action: HostAction,
  target: { messageId?: string; targetUid?: string },
): Promise<void> {
  const { app } = getFirebase();
  await httpsCallable(getFunctions(app, 'us-central1'), 'packDayChatHost')({ eventId, action, ...target });
}

/** Who checked in, from packDays/{eventId}/checkins/{uid} (built by the check-in
 *  feature). Empty if there are none or that path isn't readable yet, so the
 *  class photo falls back to the RSVP list. */
export async function loadCheckinUids(eventId: string): Promise<string[]> {
  try {
    const { db } = getFirebase();
    const snap = await getDocs(collection(db, 'packDays', eventId, 'checkins'));
    return snap.docs.map((d) => String(d.data().uid ?? d.id));
  } catch {
    return [];
  }
}
