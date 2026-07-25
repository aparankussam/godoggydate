// ── Soft-launch pricing policy ──────────────────────────────────────────────
// At current density (a handful of real dogs, ~0 matches/week per user) a
// per-match chat unlock taxes the one interaction the product barely produces
// yet, and teaches early users the core loop is a paywall. Chat is free for
// every real match while this is true; monetization moves to the $39
// Founding Member tier (a separate Stripe Payment Link, unaffected by this
// flag) instead of gating conversations.
//
// Flip this back to false once a launch neighborhood/ZIP crosses real
// density (see the Neighborhood Unlock Meter in the roadmap) and real per-
// match paid unlocks should resume. This flag must be flipped in lockstep
// with the identical constant in firestore.rules (canCurrentUserChat) —
// Firestore security rules are a separate deployable artifact and can't
// import this file directly.
export const CHAT_FREE_LAUNCH_MODE = true;

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

  // Soft-launch: every real match is free to chat in. Still requires the
  // user to actually be a party to this match (checked above) — this is
  // not a blanket bypass, just a price of $0 for a legitimate participant.
  if (CHAT_FREE_LAUNCH_MODE) return true;

  // One payment unlocks the conversation for both sides — see anyChatUnlocked.
  return anyChatUnlocked(matchData);
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
