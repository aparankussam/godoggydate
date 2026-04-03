export interface MatchIdentityLike {
  dog1Id?: string;
  dog2Id?: string;
  dog1UserId?: string;
  dog2UserId?: string;
  dogAId?: string;
  dogBId?: string;
  userAId?: string;
  userBId?: string;
}

export interface MatchReadStateLike extends MatchIdentityLike {
  lastMessageFromUid?: string | null;
  dog1LastReadAt?: number | { toMillis?: () => number } | null;
  dog2LastReadAt?: number | { toMillis?: () => number } | null;
}

export function makeMatchId(userA: string, userB: string): string {
  return [userA, userB].sort().join('_');
}

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    ) as T;
  }

  return value;
}

export function getOtherDogId(
  data: MatchIdentityLike,
  currentUserId: string,
): string | null {
  if (data.dog1UserId || data.dog2UserId) {
    if (data.dog1UserId === currentUserId) return data.dog2Id ?? null;
    if (data.dog2UserId === currentUserId) return data.dog1Id ?? null;
    return data.dog2Id ?? data.dog1Id ?? null;
  }

  if (data.userAId || data.userBId) {
    if (data.userAId === currentUserId) return data.dogBId ?? null;
    if (data.userBId === currentUserId) return data.dogAId ?? null;
    return data.dogBId ?? data.dogAId ?? null;
  }

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

export function isMatchUnread(
  data: MatchReadStateLike,
  currentUserId: string,
  lastMessageAt?: number,
): boolean {
  if (!currentUserId || !lastMessageAt || !data.lastMessageFromUid) return false;
  if (data.lastMessageFromUid === currentUserId) return false;

  const readAt =
    data.dog1UserId === currentUserId
      ? toMillis(data.dog1LastReadAt)
      : data.dog2UserId === currentUserId
        ? toMillis(data.dog2LastReadAt)
        : undefined;

  return !readAt || readAt < lastMessageAt;
}
