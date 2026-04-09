import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getOtherDogId, isMatchUnread } from './firestoreData';
import { getFirebase } from './firebase';

export interface MatchedDog {
  id: string;
  name: string;
  breed: string;
  photos: string[];
  location?: string;
}

export interface MatchItem {
  id: string;
  dog: MatchedDog;
  lastMessage?: string;
  lastMessageAt?: number;
  unread?: boolean;
  chatUnlocked?: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
}

interface FirestoreDogDoc {
  name?: string;
  breed?: string;
  photos?: string[];
  location?: string;
}

interface FirestoreMatchDoc {
  dog?: MatchedDog;
  dog1Id?: string;
  dog2Id?: string;
  dog1UserId?: string;
  dog2UserId?: string;
  dogAId?: string;
  dogBId?: string;
  userAId?: string;
  userBId?: string;
  lastMessage?: string | null;
  lastMessageAt?: number | { toMillis?: () => number } | null;
  lastMessageTime?: number | { toMillis?: () => number } | null;
  lastMessageFromUid?: string | null;
  unread?: boolean;
  chatUnlocked?: boolean;
  dog1LastReadAt?: number | { toMillis?: () => number } | null;
  dog2LastReadAt?: number | { toMillis?: () => number } | null;
}

function toMillis(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis?: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

async function fetchDogSummary(dogId: string): Promise<MatchedDog | null> {
  if (!dogId) return null;

  try {
    const db = getFirebase().db;
    const snap = await getDoc(doc(db, 'dogs', dogId));
    if (!snap.exists()) return null;

    const data = snap.data() as FirestoreDogDoc;
    return {
      id: snap.id,
      name: data.name?.trim() || 'Unnamed dog',
      breed: data.breed?.trim() || 'Unknown breed',
      photos: Array.isArray(data.photos) ? data.photos.filter(Boolean) : [],
      location: data.location?.trim(),
    };
  } catch (error) {
    console.warn('Could not load dog summary', { dogId, error });
    return null;
  }
}

async function normalizeMatchDoc(
  id: string,
  data: FirestoreMatchDoc,
  currentUserId: string,
): Promise<MatchItem> {
  const nestedDog = data.dog;
  const otherDogId = getOtherDogId(data, currentUserId);
  const fetchedDog = otherDogId ? await fetchDogSummary(otherDogId) : null;
  const dog: MatchedDog =
    fetchedDog ??
    (nestedDog && nestedDog.name
      ? nestedDog
      : {
          id: otherDogId ?? id,
          name: 'Unknown dog',
          breed: 'Unknown breed',
          photos: [],
        });

  return {
    id,
    dog,
    lastMessage: data.lastMessage ?? undefined,
    lastMessageAt: toMillis(data.lastMessageAt) ?? toMillis(data.lastMessageTime),
    unread: isMatchUnread(
      data,
      currentUserId,
      toMillis(data.lastMessageAt) ?? toMillis(data.lastMessageTime),
    ),
    chatUnlocked: Boolean(data.chatUnlocked),
  };
}

export function formatMatchTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000 * 60) return 'now';
  if (diff < 1000 * 60 * 60) return `${Math.floor(diff / (1000 * 60))}m`;
  if (diff < 1000 * 60 * 60 * 24) return `${Math.floor(diff / (1000 * 60 * 60))}h`;
  return `${Math.floor(diff / (1000 * 60 * 60 * 24))}d`;
}

export async function fetchMatches(userId: string): Promise<MatchItem[]> {
  if (!userId) return [];

  try {
    const db = getFirebase().db;
    const matchQueries = await Promise.allSettled([
      getDocs(query(collection(db, 'matches'), where('dog1UserId', '==', userId))),
      getDocs(query(collection(db, 'matches'), where('dog2UserId', '==', userId))),
    ]);

    const docs = new Map<string, FirestoreMatchDoc>();
    for (const result of matchQueries) {
      if (result.status !== 'fulfilled') continue;
      for (const snap of result.value.docs) {
        docs.set(snap.id, snap.data() as FirestoreMatchDoc);
      }
    }

    if (docs.size > 0) {
      const normalized = await Promise.all(
        [...docs.entries()].map(([id, data]) => normalizeMatchDoc(id, data, userId)),
      );
      return normalized.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
    }
  } catch (err) {
    console.warn('Could not load Firestore matches', err);
  }

  return [];
}

export async function fetchMessages(matchId: string): Promise<ChatMessage[]> {
  if (!matchId) return [];

  try {
    const db = getFirebase().db;
    const snap = await getDocs(
      query(
        collection(db, 'matches', matchId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200),
      ),
    );

    if (!snap.empty) {
      return snap.docs.map((messageDoc) => {
        const data = messageDoc.data() as {
          text?: string;
          fromUserId?: string;
          senderId?: string;
          createdAt?: number | { toMillis?: () => number };
        };

        return {
          id: messageDoc.id,
          text: data.text ?? '',
          senderId: data.fromUserId ?? data.senderId ?? 'other',
          createdAt: toMillis(data.createdAt) ?? Date.now(),
        };
      });
    }
  } catch (err) {
    console.warn('Could not load Firestore messages', err);
  }
  return [];
}

export async function fetchMatch(matchId: string, currentUserId = ''): Promise<MatchItem | null> {
  if (!matchId) return null;

  try {
    const db = getFirebase().db;
    const docSnap = await getDoc(doc(db, 'matches', matchId));
    if (docSnap.exists()) {
      const data = docSnap.data() as FirestoreMatchDoc;
      return normalizeMatchDoc(docSnap.id, data, currentUserId);
    }
  } catch (err) {
    console.warn('Could not load Firestore match', err);
  }

  return null;
}

export async function markMatchRead(matchId: string, userId: string): Promise<void> {
  if (!matchId || !userId) return;

  const db = getFirebase().db;
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) return;

  const data = snap.data() as FirestoreMatchDoc;
  const readField =
    data.dog1UserId === userId
      ? 'dog1LastReadAt'
      : data.dog2UserId === userId
        ? 'dog2LastReadAt'
        : null;

  if (!readField) return;

  await setDoc(
    matchRef,
    {
      [readField]: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function sendMessage(
  matchId: string,
  senderId: string,
  text: string,
): Promise<ChatMessage> {
  const trimmed = text.trim();
  if (!matchId || !senderId || !trimmed) {
    throw new Error('matchId, senderId, and text are required');
  }

  const db = getFirebase().db;
  const messageRef = await addDoc(collection(db, 'matches', matchId, 'messages'), {
    fromUserId: senderId,
    text: trimmed,
    read: false,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, 'matches', matchId),
    {
      lastMessage: trimmed,
      lastMessageTime: serverTimestamp(),
      lastMessageFromUid: senderId,
    },
    { merge: true },
  );

  return {
    id: messageRef.id,
    text: trimmed,
    senderId,
    createdAt: Date.now(),
  };
}
