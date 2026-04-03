import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { makeMatchId } from './firestoreData';
import { getFirebase } from './firebase';

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

export async function recordSwipe(params: SwipeParams): Promise<SwipeResult> {
  const { currentUserId, currentDogId, targetUserId, targetDogId, action } = params;
  if (!currentUserId || !currentDogId || !targetUserId || !targetDogId) {
    throw new Error('A valid current user, current dog, target user, and target dog are required');
  }

  const { db } = getFirebase();
  const decisionRef = doc(db, 'swipes', currentUserId, 'decisions', targetDogId);

  await setDoc(
    decisionRef,
    {
      action,
      targetDogId,
      targetUserId,
      timestamp: serverTimestamp(),
    },
    { merge: true },
  );

  if (action !== 'like') {
    return { isMatch: false };
  }

  const reverseRef = doc(db, 'swipes', targetUserId, 'decisions', currentDogId);
  const reverseSnap = await getDoc(reverseRef);
  if (!reverseSnap.exists() || reverseSnap.data()?.action !== 'like') {
    return { isMatch: false };
  }

  const matchId = makeMatchId(currentUserId, targetUserId);
  const matchRef = doc(db, 'matches', matchId);
  const existingMatch = await getDoc(matchRef);
  if (!existingMatch.exists()) {
    const [dog1UserId, dog2UserId] = [currentUserId, targetUserId].sort();
    const dog1Id = dog1UserId === currentUserId ? currentDogId : targetDogId;
    const dog2Id = dog2UserId === currentUserId ? currentDogId : targetDogId;

    await setDoc(matchRef, {
      dog1Id,
      dog2Id,
      dog1UserId,
      dog2UserId,
      chatUnlocked: true,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageTime: null,
      lastMessageFromUid: null,
      dog1LastReadAt: null,
      dog2LastReadAt: null,
    });
  }

  return { isMatch: true, matchId };
}
