import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { discoverFromItems } from './dogtypeDiscovery';
import { getOtherDogId, isMatchUnread } from './firestoreData';
import { getFirebase } from './firebase';
import { isUserChatUnlocked } from '../../shared/matchAccess';
import type { SavedDogProfile } from '../../shared/profile';
import { getBlockedUserIds } from './blocks';
import { getEntitlements } from './entitlements';
import { getHeroPhoto, getRenderablePhotos } from './photos';
import { resolveHeroIndex } from './coverPhoto';
import { formatPlaydateWhen } from './playdates';

// The match doc only ever says 'New message'. Message text is deliberately not
// copied onto it (privacy), so the match list reads the newest message itself.
const MATCH_THREAD_PREVIEW = 'New message';

export interface MatchedDog {
  id: string;
  name: string;
  breed: string;
  photos: string[];
  /** The photo this dog LEADS with — the owner's cover pick, else the AI hero,
   *  else the first real photo. Resolved here (where the full dog doc is in
   *  hand) so a match row shows the same photo as the profile it opens. */
  heroPhoto: string | null;
  location?: string;
  /** The whole public dog doc, for the chat's Heads-Up card and starter
   *  prompts. Null when only the match doc's old denormalised copy exists. */
  profile?: SavedDogProfile | null;
}

/** The newest message in a thread, for the match list. */
export interface LastMessagePreview {
  senderId: string;
  text: string;
  type?: ChatMessage['type'];
  playdate?: PlaydateDetails;
  moderated?: boolean;
}

export interface MatchItem {
  id: string;
  dog: MatchedDog;
  lastMessage?: string;
  lastMessageAt?: number;
  lastMessageFromUid?: string;
  /** When the match was made. */
  createdAt?: number;
  /** Latest activity: the last message, or the match itself when nobody has
   *  written yet. Sorting by this keeps brand-new matches at the top. */
  activityAt: number;
  /** Nobody has sent a message yet. */
  isNew: boolean;
  /** Only filled in by subscribeMatches. Null when it couldn't be read. */
  preview?: LastMessagePreview | null;
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
  /** Set by the server when the content filter caught this message. Its text
   *  is replaced with a notice and its type/playdate are deleted; render it
   *  muted, never as a playdate, and leave it out of every playdate check. */
  moderated?: boolean;
}

/** A playdate message that should count: not moderated, and actually carrying a playdate. */
export function isPlaydateMessage<T extends Pick<ChatMessage, 'type' | 'playdate' | 'moderated'>>(
  message: T,
  type: NonNullable<ChatMessage['type']>,
): message is T & { playdate: PlaydateDetails } {
  return !message.moderated && message.type === type && Boolean(message.playdate);
}

export const MAX_MESSAGE_LENGTH = 1000;

interface FirestoreDogDoc {
  name?: string;
  breed?: string;
  photos?: string[];
  location?: string;
  // Read only to resolve the hero photo (see MatchedDog.heroPhoto).
  coverPhotoIndex?: number | null;
  ai?: { vibeCheck?: { heroPhotoIndex?: number } | null } | null;
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
  createdAt?: number | { toMillis?: () => number } | null;
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

/** The other person's uid on a match doc, or null if this user isn't on it. */
export function getOtherUserId(data: FirestoreMatchDoc, userId: string): string | null {
  if (data.dog1UserId === userId) return data.dog2UserId ?? null;
  if (data.dog2UserId === userId) return data.dog1UserId ?? null;
  if (data.userAId === userId) return data.userBId ?? null;
  if (data.userBId === userId) return data.userAId ?? null;
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
      // getRenderablePhotos (not bare filter(Boolean)) — both save paths pad
      // the stored array with the '_placeholder_' token to reach the minimum
      // photo count, and that token must never reach an <Image source={{uri}}>.
      photos: getRenderablePhotos(data.photos),
      heroPhoto: getHeroPhoto(data.photos, resolveHeroIndex(data)),
      location: data.location?.trim(),
      profile: snap.data() as SavedDogProfile,
    };
  } catch (error) {
    console.warn('Could not load dog summary', { dogId, error });
    return null;
  }
}

function normalizeMatchDoc(
  id: string,
  data: FirestoreMatchDoc,
  currentUserId: string,
  fetchedDog: MatchedDog | null,
  hasLifetime: boolean,
): MatchItem {
  const nestedDog = data.dog;
  const otherDogId = getOtherDogId(data, currentUserId);
  const dog: MatchedDog =
    fetchedDog ??
    (nestedDog && nestedDog.name
      ? // The denormalized copy on the match doc predates heroPhoto, so fall
        // back to its first RENDERABLE photo — photos[0] can be the
        // '_placeholder_' padding token, which must never reach an <Image>.
        (() => {
          const real = getRenderablePhotos(nestedDog.photos);
          return { ...nestedDog, photos: real, heroPhoto: nestedDog.heroPhoto ?? real[0] ?? null, profile: null };
        })()
      : {
          id: otherDogId ?? id,
          name: 'Unknown dog',
          breed: 'Unknown breed',
          photos: [],
          heroPhoto: null,
          profile: null,
        });

  const lastMessageAt = toMillis(data.lastMessageAt) ?? toMillis(data.lastMessageTime);
  const createdAt = toMillis(data.createdAt);
  return {
    id,
    dog,
    lastMessage: data.lastMessage ?? undefined,
    lastMessageAt,
    lastMessageFromUid: data.lastMessageFromUid ?? undefined,
    createdAt,
    activityAt: lastMessageAt ?? createdAt ?? 0,
    isNew: !data.lastMessage,
    unread: isMatchUnread(data, currentUserId, lastMessageAt),
    chatUnlocked: isUserChatUnlocked(data, currentUserId) || hasLifetime,
  };
}

function shouldHideMatch(data: FirestoreMatchDoc, currentUserId: string, blockedIds: Set<string>): boolean {
  const otherDogId = getOtherDogId(data, currentUserId);
  if (otherDogId && (isSeedUserId(otherDogId) || blockedIds.has(otherDogId))) return true;
  const otherUserId = getOtherUserId(data, currentUserId);
  return Boolean(otherUserId && blockedIds.has(otherUserId));
}

function byLatestActivity(a: MatchItem, b: MatchItem): number {
  return b.activityAt - a.activityAt;
}

export function formatMatchTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000 * 60) return 'now';
  if (diff < 1000 * 60 * 60) return `${Math.floor(diff / (1000 * 60))}m`;
  if (diff < 1000 * 60 * 60 * 24) return `${Math.floor(diff / (1000 * 60 * 60))}h`;
  return `${Math.floor(diff / (1000 * 60 * 60 * 24))}d`;
}

/**
 * The match list's second line: who wrote last, and what. Falls back to
 * "Kaju sent a message" (what web shows) when the message couldn't be read.
 */
export function lastMessageLine(item: MatchItem, selfUid: string): string {
  const senderId = item.preview?.senderId ?? item.lastMessageFromUid;
  const who = senderId && senderId === selfUid ? 'You' : item.dog.name;
  const preview = item.preview;
  if (!preview) return `${who} sent a message`;
  if (preview.moderated) return `${who}: Message removed`;

  if (isPlaydateMessage(preview, 'playdate_proposal')) {
    return `📅 ${who} proposed a playdate for ${formatPlaydateWhen(preview.playdate)}`;
  }
  if (isPlaydateMessage(preview, 'playdate_confirmed')) {
    return `✅ ${who} confirmed the playdate for ${formatPlaydateWhen(preview.playdate)}`;
  }
  const text = preview.text.replace(/\s+/g, ' ').trim();
  return text ? `${who}: ${text}` : `${who} sent a message`;
}

async function fetchLastMessagePreview(matchId: string): Promise<LastMessagePreview | null> {
  try {
    const db = getFirebase().db;
    const snap = await getDocs(
      query(collection(db, 'matches', matchId, 'messages'), orderBy('createdAt', 'desc'), limit(1)),
    );
    const newest = snap.docs[0];
    if (!newest) return null;
    const data = newest.data() as {
      text?: string;
      fromUserId?: string;
      senderId?: string;
      type?: ChatMessage['type'];
      playdate?: PlaydateDetails;
      moderated?: boolean;
    };
    return {
      senderId: data.fromUserId ?? data.senderId ?? '',
      text: typeof data.text === 'string' ? data.text : '',
      type: data.type,
      playdate: data.playdate,
      moderated: data.moderated === true,
    };
  } catch (error) {
    // e.g. a locked chat: the rules don't let either side read its messages.
    console.warn('Could not load last message', { matchId, error });
    return null;
  }
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

  const visible = [...docs.entries()].filter(([, data]) => !shouldHideMatch(data, userId, blockedIds));
  const normalized = await Promise.all(
    visible.map(async ([id, data]) => {
      const otherDogId = getOtherDogId(data, userId);
      const dog = otherDogId ? await fetchDogSummary(otherDogId) : null;
      return normalizeMatchDoc(id, data, userId, dog, entitlements.lifetimeChatUnlocks);
    }),
  );
  const sorted = normalized.sort(byLatestActivity);
  discoverFromItems(userId, sorted);
  return sorted;
}

/**
 * The match list, live. Listens to both match queries and re-emits whenever a
 * match is made or a message lands, with each row's newest message attached.
 * Dog docs and last messages are cached for the life of the subscription, and
 * a last message is only re-read when that thread's lastMessageTime moves.
 * Blocks and entitlements are read once per subscription, so subscribe while
 * the screen is focused to pick up a block made in a chat.
 *
 * onError fires only when BOTH queries fail: we then can't tell "no matches"
 * from "couldn't check", and the screen must not claim the former.
 */
export function subscribeMatches(
  userId: string,
  onData: (matches: MatchItem[]) => void,
  onError: (error: Error) => void,
): () => void {
  if (!userId) {
    onData([]);
    return () => {};
  }

  const db = getFirebase().db;
  let cancelled = false;
  let generation = 0;
  const results: Array<Map<string, FirestoreMatchDoc> | 'failed' | null> = [null, null];
  const dogCache = new Map<string, Promise<MatchedDog | null>>();
  const previewCache = new Map<string, { at: number; preview: Promise<LastMessagePreview | null> }>();
  const context = Promise.all([getBlockedUserIds(userId), getEntitlements(userId)]);

  const loadDog = (dogId: string) => {
    let cached = dogCache.get(dogId);
    if (!cached) {
      cached = fetchDogSummary(dogId);
      dogCache.set(dogId, cached);
    }
    return cached;
  };

  const loadPreview = (matchId: string, at: number) => {
    const cached = previewCache.get(matchId);
    if (cached && cached.at === at) return cached.preview;
    const preview = fetchLastMessagePreview(matchId);
    previewCache.set(matchId, { at, preview });
    return preview;
  };

  async function emit() {
    if (results.some((r) => r === null)) return; // wait until both queries have answered once
    if (results.every((r) => r === 'failed')) {
      onError(new Error('Could not load your matches — check your connection and try again.'));
      return;
    }

    const run = ++generation;
    const docs = new Map<string, FirestoreMatchDoc>();
    for (const r of results) {
      if (r && r !== 'failed') r.forEach((data, id) => docs.set(id, data));
    }

    const [blockedIds, entitlements] = await context;
    const visible = [...docs.entries()].filter(([, data]) => !shouldHideMatch(data, userId, blockedIds));
    const items = await Promise.all(
      visible.map(async ([id, data]) => {
        const otherDogId = getOtherDogId(data, userId);
        const dog = otherDogId ? await loadDog(otherDogId) : null;
        const item = normalizeMatchDoc(id, data, userId, dog, entitlements.lifetimeChatUnlocks);
        if (!item.isNew && item.chatUnlocked && item.lastMessageAt !== undefined) {
          item.preview = await loadPreview(id, item.lastMessageAt);
        }
        return item;
      }),
    );

    if (cancelled || run !== generation) return; // a newer snapshot already took over
    const sorted = items.sort(byLatestActivity);
    discoverFromItems(userId, sorted);
    onData(sorted);
  }

  const listen = (field: 'dog1UserId' | 'dog2UserId', slot: 0 | 1) =>
    onSnapshot(
      query(collection(db, 'matches'), where(field, '==', userId)),
      (snap) => {
        const map = new Map<string, FirestoreMatchDoc>();
        snap.docs.forEach((d) => map.set(d.id, d.data() as FirestoreMatchDoc));
        results[slot] = map;
        void emit();
      },
      (error) => {
        console.warn(`Matches listener (${field}) failed`, error);
        results[slot] = 'failed';
        void emit();
      },
    );

  const unsubs = [listen('dog1UserId', 0), listen('dog2UserId', 1)];
  return () => {
    cancelled = true;
    unsubs.forEach((unsub) => unsub());
  };
}

/**
 * Live count for the Matches tab badge, mirroring web/components/
 * AppLayoutShell.tsx: threads where the other person wrote last and you
 * haven't read it since, plus new matches nobody has written in yet. Unlike
 * web, a new match stops counting once you've opened it, so the badge can
 * always be cleared. Blocked people and demo profiles never count, matching
 * what the list shows.
 */
export function subscribeUnreadCount(userId: string, onCount: (count: number) => void): () => void {
  if (!userId) {
    onCount(0);
    return () => {};
  }

  const db = getFirebase().db;
  const matchSets: Array<Map<string, FirestoreMatchDoc>> = [new Map(), new Map()];
  const blockSets: Array<Set<string>> = [new Set(), new Set()];

  function recompute() {
    const blocked = new Set([...blockSets[0], ...blockSets[1]]);
    const all = new Map<string, FirestoreMatchDoc>([...matchSets[0], ...matchSets[1]]);
    let count = 0;
    for (const data of all.values()) {
      if (shouldHideMatch(data, userId, blocked)) continue;
      const readField = getReadFieldForUser(data, userId);
      const myReadAt = readField ? toMillis(data[readField]) : undefined;
      if (!data.lastMessage) {
        if (myReadAt === undefined) count += 1;
        continue;
      }
      const lastMessageAt = toMillis(data.lastMessageAt) ?? toMillis(data.lastMessageTime);
      if (isMatchUnread(data, userId, lastMessageAt)) count += 1;
    }
    onCount(count);
  }

  const unsubs = [
    ...(['dog1UserId', 'dog2UserId'] as const).map((field, slot) =>
      onSnapshot(
        query(collection(db, 'matches'), where(field, '==', userId)),
        (snap) => {
          const map = new Map<string, FirestoreMatchDoc>();
          snap.docs.forEach((d) => map.set(d.id, d.data() as FirestoreMatchDoc));
          matchSets[slot] = map;
          recompute();
        },
        (error) => console.warn('Unread badge listener failed', error),
      )),
    ...(['blocked', 'blockedBy'] as const).map((sub, slot) =>
      onSnapshot(
        collection(db, 'blocks', userId, sub),
        (snap) => {
          blockSets[slot] = new Set(snap.docs.map((d) => d.id));
          recompute();
        },
        // Same as getBlockedUserIds: unreadable blocks just hide nothing.
        () => {},
      )),
  ];

  return () => unsubs.forEach((unsub) => unsub());
}

/** Newest messages first from the server, returned oldest-first for display. */
export async function fetchMessages(matchId: string, max = 200): Promise<ChatMessage[]> {
  if (!matchId) return [];

  try {
    const db = getFirebase().db;
    const snap = await getDocs(
      query(
        collection(db, 'matches', matchId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(max),
      ),
    );

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
    }).reverse();
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
      // already has the matchId and is opening this exact conversation. Demo
      // profiles stay hidden, as before.
      const otherDogId = getOtherDogId(data, currentUserId);
      if (otherDogId && isSeedUserId(otherDogId)) return null;
      const dog = otherDogId ? await fetchDogSummary(otherDogId) : null;
      return normalizeMatchDoc(docSnap.id, data, currentUserId, dog, entitlements.lifetimeChatUnlocks);
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
