// web/lib/packDayChat.ts
// Pack Day group chat, client side (web port of mobile/lib/packDayChat.ts).
// Messages are packDays/{eventId}/messages (members = the event's RSVP list;
// firestore.rules also ends writes 48 hours after the event). Pin, mute and
// remove go through the packDayChatHost callable. Pure rules (phases, who is
// visible, class-photo members) are in shared/packDayChat.ts.

import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/utils/firebase';
import { checkContent } from '../../shared/contentFilter';
import { CHAT_MAX_TEXT, CHAT_RAIN_CHECK_TEXT, type PackDayMessageKind } from '../../shared/packDayChat';
import { toMetadataFreeJpeg } from './storage';

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

/** Re-encoded to a metadata-free JPEG first (strips GPS), then posted as a photo message. */
export async function sendPackDayPhoto(eventId: string, uid: string, file: File): Promise<void> {
  const { storage } = getFirebase();
  if (!storage) throw new Error('Firebase Storage not initialized');
  const jpeg = await toMetadataFreeJpeg(file);
  const snap = await uploadBytes(ref(storage, `packDays/${eventId}/photos/${uid}/${Date.now()}.jpg`), jpeg, { contentType: 'image/jpeg' });
  await post(eventId, uid, 'photo', '', await getDownloadURL(snap.ref));
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
