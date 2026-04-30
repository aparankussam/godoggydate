export interface MatchAccessLike {
  dog1UserId?: string;
  dog2UserId?: string;
  userAId?: string;
  userBId?: string;
  chatUnlocked?: boolean | null;
  dog1ChatUnlocked?: boolean | null;
  dog2ChatUnlocked?: boolean | null;
}

export type ParticipantSlot = 'dog1' | 'dog2';

export function getParticipantSlot(
  matchData: MatchAccessLike,
  userId: string,
): ParticipantSlot | null {
  if (!userId) return null;
  if (matchData.dog1UserId === userId || matchData.userAId === userId) return 'dog1';
  if (matchData.dog2UserId === userId || matchData.userBId === userId) return 'dog2';
  return null;
}

export function getChatUnlockFieldForSlot(slot: ParticipantSlot): 'dog1ChatUnlocked' | 'dog2ChatUnlocked' {
  return slot === 'dog1' ? 'dog1ChatUnlocked' : 'dog2ChatUnlocked';
}

export function getChatUnlockFieldForUserId(
  matchData: MatchAccessLike,
  userId: string,
): 'dog1ChatUnlocked' | 'dog2ChatUnlocked' | null {
  const slot = getParticipantSlot(matchData, userId);
  return slot ? getChatUnlockFieldForSlot(slot) : null;
}

export function isUserChatUnlocked(
  matchData: MatchAccessLike,
  userId: string,
): boolean {
  const slot = getParticipantSlot(matchData, userId);
  if (!slot) return false;

  const field = getChatUnlockFieldForSlot(slot);
  const value = matchData[field];

  // Backward compatibility for legacy docs that only had a single shared flag.
  if (typeof value !== 'boolean') {
    return Boolean(matchData.chatUnlocked);
  }

  return value;
}

export function anyChatUnlocked(matchData: MatchAccessLike): boolean {
  const explicitDog1 = Boolean(matchData.dog1ChatUnlocked);
  const explicitDog2 = Boolean(matchData.dog2ChatUnlocked);

  if (
    typeof matchData.dog1ChatUnlocked === 'boolean' ||
    typeof matchData.dog2ChatUnlocked === 'boolean'
  ) {
    return explicitDog1 || explicitDog2;
  }

  return Boolean(matchData.chatUnlocked);
}
