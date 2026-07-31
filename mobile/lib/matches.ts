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
import { isUserChatUnlocked } from '../../shared/matchAccess';
import { getBlockedUserIds } from './blocks';
import { getEntitlements } from './entitlements';

const MATCH_THREAD_PREVIEW = 'New message';

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

export interface PlaydateDetails {
  date: string;
  time: string;
  place: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
  type?: 'playdate_proposal' | 'playdate_confirmed';
  playdate?: PlaydateDetails;
}

export const MAX_MESSAGE_LENGTH = 1000;

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
  dog1ChatUnlocked?: boolean | null;
  dog2ChatUnlocked?: boolean | null;
  dog1LastReadAt?: number | { toMillis?: () => number } | null;
  dog2LastReadAt?: number | { toMillis?: () => number } | null;
}

function isSeedUserId(id: string): boolean {
  return id.startsWith('user_seed_');
}

function getReadFieldForUser(data: FirestoreMatchDoc, userId: string): 'dog1LastReadAt' | 'dog2LastReadAt' | null {
  if (data.dog1UserId === userId) return 'dog1LastReadAt';
  if (data.dog2UserId === userId) return 'dog2LastReadAt';

  // Older match docs used userAId/userBId instead of dog1UserId/dog2UserId.
  // We still persist read state into the current dog1/dog2 slots so unread
  // tracking works without widening access.
  if (data.userAId === userId) return 'dog1LastReadAt';
  if (data.userBId === userId) return 'dog2LastReadAt';

  return null;
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
  if (isSeedUserId(dogId)) return null;

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
  blockedIds: Set<string>,
  hasLifetime: boolean,
): Promise<MatchItem | null> {
  const nestedDog = data.dog;
  const otherDogId = getOtherDogId(data, currentUserId);
  if (otherDogId && isSeedUserId(otherDogId)) return null;
  if (otherDogId && blockedIds.has(otherDogId)) return null;
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
    chatUnlocked: isUserChatUnlocked(data, currentUserId) || hasLifetime,
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

  const db = getFirebase().db;
  const [matchQueries, blockedIds, entitlements] = await Promise.all([
    Promise.allSettled([
      getDocs(query(collection(db, 'matches'), where('dog1UserId', '==', userId))),
      getDocs(query(collection(db, 'matches'), where('dog2UserId', '==', userId))),
    ]),
    getBlockedUserIds(userId),
    getEntitlements(userId),
  ]);

  // If EVERY match query failed, we have no idea how many matches exist —
  // that is not the same fact as "zero matches", and the caller must not
  // treat it as one. This used to be swallowed into a `catch` that returned
  // [] unconditionally, so a Firestore outage rendered as a cheerful "No
  // matches yet" and the user blamed their own dog rather than the app.
  // A single query failing (the other direction still succeeded) degrades
  // gracefully instead — better to show the real matches we do have.
  if (matchQueries.every((result) => result.status === 'rejected')) {
    const reason = matchQueries[0].status === 'rejected' ? matchQueries[0].reason : undefined;
    console.warn('Could not load Firestore matches', reason);
    throw new Error('Could not load your matches — check your connection and try again.');
  }

  const docs = new Map<string, FirestoreMatchDoc>();
  for (const result of matchQueries) {
    if (result.status !== 'fulfilled') continue;
    for (const snap of result.value.docs) {
      docs.set(snap.id, snap.data() as FirestoreMatchDoc);
    }
  }

  if (docs.size === 0) return [];

  const normalized = await Promise.all(
    [...docs.entries()].map(([id, data]) =>
      normalizeMatchDoc(id, data, userId, blockedIds, entitlements.lifetimeChatUnlocks)),
  );
  return normalized
    .filter((match): match is MatchItem => Boolean(match))
    .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
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
    const [docSnap, entitlements] = await Promise.all([
      getDoc(doc(db, 'matches', matchId)),
      currentUserId ? getEntitlements(currentUserId) : Promise.resolve({ lifetimeChatUnlocks: false }),
    ]);
    if (docSnap.exists()) {
      const data = docSnap.data() as FirestoreMatchDoc;
      // A single-match fetch never needs the blocked-ids filter — the caller
      // already has the matchId and is opening this exact conversation.
      return normalizeMatchDoc(docSnap.id, data, currentUserId, new Set(), entitlements.lifetimeChatUnlocks);
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
  const readField = getReadFieldForUser(data, userId);

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
  extra?: { type: ChatMessage['type']; playdate: PlaydateDetails },
): Promise<ChatMessage> {
  const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!matchId || !senderId || !trimmed) {
    throw new Error('matchId, senderId, and text are required');
  }

  const db = getFirebase().db;
  const messageRef = await addDoc(collection(db, 'matches', matchId, 'messages'), {
    fromUserId: senderId,
    text: trimmed,
    read: false,
    createdAt: serverTimestamp(),
    ...(extra ? { type: extra.type, playdate: extra.playdate } : {}),
  });

  await setDoc(
    doc(db, 'matches', matchId),
    {
      lastMessage: MATCH_THREAD_PREVIEW,
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
    ...(extra ? { type: extra.type, playdate: extra.playdate } : {}),
  };
}
