// web/lib/matching.ts
// Firestore swipe writes + mutual-like detection → match creation.
//
// Swipe path:   swipes/{userId}/decisions/{targetUserId}
// Match path:   matches/{matchId} where matchId = [userA, userB].sort().join('_')

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SwipeParams {
  currentUserId: string;
  currentDogId: string;
  targetUserId: string;
  targetDogId: string;
  action: 'like' | 'pass';
}

export interface SwipeResult {
  isMatch: boolean;
  matchId?: string;
}

export interface MatchData {
  dog1Id: string;
  dog2Id: string;
  dog1UserId: string;
  dog2UserId: string;
  chatUnlocked: boolean;
  dog1ChatUnlocked: boolean;
  dog2ChatUnlocked: boolean;
  createdAt: ReturnType<typeof serverTimestamp>;
  lastMessage: null;
  lastMessageTime: null;
  lastMessageFromUid: null;
  dog1LastReadAt: null;
  dog2LastReadAt: null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function makeMatchId(userA: string, userB: string): string {
  return [userA, userB].sort().join('_');
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Record a swipe decision.
 * If the action is 'like', checks for a mutual like and creates a match document.
 * Returns { isMatch, matchId? }.
 */
export async function recordSwipe(params: SwipeParams): Promise<SwipeResult> {
  const { db } = getFirebase();

  // Write the current user's decision keyed by the TARGET USER ID
  const decisionRef = doc(
    db,
    'swipes',
    params.currentUserId,
    'decisions',
    params.targetUserId,
  );

  await setDoc(decisionRef, {
    action: params.action,
    timestamp: serverTimestamp(),
    targetUserId: params.targetUserId,
  });

  console.info('[matching] wrote swipe', {
    currentUserId: params.currentUserId,
    targetUserId: params.targetUserId,
    action: params.action,
    decisionPath: `swipes/${params.currentUserId}/decisions/${params.targetUserId}`,
  });

  if (params.action !== 'like') {
    return { isMatch: false };
  }

  // Check if the target user already liked the current user back
  const reverseRef = doc(
    db,
    'swipes',
    params.targetUserId,
    'decisions',
    params.currentUserId,
  );

  console.info('[matching] checking reverse like', {
    currentUserId: params.currentUserId,
    targetUserId: params.targetUserId,
    reversePath: `swipes/${params.targetUserId}/decisions/${params.currentUserId}`,
  });

  let reverseSnap = await getDoc(reverseRef);

  if (!reverseSnap.exists()) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    reverseSnap = await getDoc(reverseRef);
  }

  console.info('[matching] reverse like result', {
    exists: reverseSnap.exists(),
    action: reverseSnap.data()?.action ?? null,
  });

  if (!reverseSnap.exists() || reverseSnap.data()?.action !== 'like') {
    return { isMatch: false };
  }

  // ── Mutual like — create match ───────────────────────────────────────────
  const matchId = makeMatchId(params.currentUserId, params.targetUserId);
  const matchRef = doc(db, 'matches', matchId);
  const existingMatch = await getDoc(matchRef);
  const [dog1UserId, dog2UserId] = [
    params.currentUserId,
    params.targetUserId,
  ].sort();

  console.info('[matching] creating match', {
    matchId,
    dog1UserId,
    dog2UserId,
  });

  // In this app, dog docs are stored at dogs/{uid}, so dogId and userId align.
  const matchData: MatchData = {
    dog1Id: dog1UserId,
    dog2Id: dog2UserId,
    dog1UserId,
    dog2UserId,
    chatUnlocked: false,
    dog1ChatUnlocked: false,
    dog2ChatUnlocked: false,
    createdAt: serverTimestamp(),
    lastMessage: null,
    lastMessageTime: null,
    lastMessageFromUid: null,
    dog1LastReadAt: null,
    dog2LastReadAt: null,
  };

  try {
    if (!existingMatch.exists()) {
      await setDoc(matchRef, matchData);
    }
    console.info('[matching] match creation succeeded', { matchId });
  } catch (error: unknown) {
    console.error('[matching] match creation failed', { matchId, error });
    throw error;
  }

  return { isMatch: true, matchId };
}

/**
 * Check if a match already exists between two users.
 */
export async function matchExists(userA: string, userB: string): Promise<boolean> {
  const { db } = getFirebase();
  const matchRef = doc(db, 'matches', makeMatchId(userA, userB));
  const snap = await getDoc(matchRef);
  return snap.exists();
}
