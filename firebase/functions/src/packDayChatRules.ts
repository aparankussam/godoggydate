// firebase/functions/src/packDayChatRules.ts
// Byte-identical copy of shared/packDayChat.ts from its first export line down
// (Cloud Functions can't import shared/). serverMirrors.test.ts fails if it drifts.

export const CHAT_READ_ONLY_AFTER_MS = 48 * 60 * 60 * 1000;

export const CHAT_MAX_TEXT = 500;

export type PackDayMessageKind = 'text' | 'here' | 'late' | 'headsup' | 'photo';

/** What the two quick buttons show and post. The kind, not the stored text, decides what is drawn. */
export const CHAT_QUICK_MESSAGES = {
  here: "I'm here 📍",
  late: 'Running late',
} as const;

/** The host's one-tap weather check. Posted as a 'headsup' message. */
export const CHAT_RAIN_CHECK_TEXT = 'Rain expected, still on? ☔';

export interface ChatEventTimes {
  startsAtMs: number;
  durationMinutes: number;
}

export type ChatPhase = 'before' | 'live' | 'after' | 'readonly';

export function chatEventEndMs(event: ChatEventTimes): number {
  return event.startsAtMs + event.durationMinutes * 60_000;
}

export function chatClosesAtMs(event: ChatEventTimes): number {
  return chatEventEndMs(event) + CHAT_READ_ONLY_AFTER_MS;
}

/** before: not started. live: running. after: over, still writable (album time).
 *  readonly: 48 hours after the end. A cancelled event is always readonly. */
export function chatPhase(event: ChatEventTimes & { status?: string }, nowMs: number): ChatPhase {
  if (event.status === 'cancelled') return 'readonly';
  if (nowMs < event.startsAtMs) return 'before';
  if (nowMs < chatEventEndMs(event)) return 'live';
  if (nowMs < chatClosesAtMs(event)) return 'after';
  return 'readonly';
}

export function canPostText(phase: ChatPhase): boolean {
  return phase !== 'readonly';
}

/** Photos wait for the event to start (the rules say the same). */
export function canPostPhoto(phase: ChatPhase): boolean {
  return phase === 'live' || phase === 'after';
}

/** The morning-of message goes out at 7:00 AM on the host's wall clock, or an
 *  hour before an earlier start. The host's zone offset is recovered from the
 *  stored wall-clock date and time against the real start instant. Null if the
 *  wall-clock strings are malformed. */
export function headsUpPostAtMs(startsAtMs: number, localDate: string, localTime: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  const t = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!d || !t) return null;
  const localStartAsUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const offsetMs = localStartAsUtc - startsAtMs;
  const localMidnightAsUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
  const sevenAm = localMidnightAsUtc - offsetMs + 7 * 60 * 60_000;
  return Math.min(sevenAm, startsAtMs - 60 * 60_000);
}

/** The text of the morning-of message, e.g. "Today: Sunday Sniff at Maple Park, 9:00 AM. 6 dogs going. Still on? 🐾". */
export function headsUpText(title: string, placeName: string, clock: string, going: number): string {
  return `Today: ${title} at ${placeName}, ${clock}. ${going} ${going === 1 ? 'dog' : 'dogs'} going. Still on? 🐾`;
}

export interface ChatMessageLike {
  fromUserId: string;
}

/** A blocked person's messages are hidden from the blocker. System posts (fromUserId 'system') stay. */
export function visibleChatMessages<T extends ChatMessageLike>(messages: readonly T[], blocked: ReadonlySet<string>): T[] {
  return messages.filter((m) => !blocked.has(m.fromUserId));
}

/** Who did my dog play with? Everyone else going, minus people I blocked. */
export function whoPlayedCandidates(attendeeUids: readonly string[], myUid: string, blocked: ReadonlySet<string>): string[] {
  return attendeeUids.filter((uid) => uid !== myUid && !blocked.has(uid));
}

/** The class photo is everyone who checked in; with no check-ins (or the
 *  check-in feature not there yet) it falls back to the RSVP list. Only people
 *  still on the RSVP list count, so a removed member is never pictured. */
export function classPhotoUids(checkinUids: readonly string[], attendeeUids: readonly string[]): string[] {
  const going = new Set(attendeeUids);
  const checked = [...new Set(checkinUids)].filter((uid) => going.has(uid));
  return checked.length > 0 ? checked : [...attendeeUids];
}
