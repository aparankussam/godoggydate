// firebase/functions/src/packDayWindow.ts
// The hours a Pack Day may start, with NO imports so shared/packDay.test.ts can
// import this very file and check it agrees with PACK_DAY_LIMITS in
// shared/packDay.ts (this package can't import shared/, and a copy that nothing
// compares would drift). 6:00 AM to 9:45 PM on the host's wall clock: when
// public parks are open, and what the iPhone form offers.

export const EARLIEST_START_MINUTES = 6 * 60;
export const LATEST_START_MINUTES = 21 * 60 + 45;

export const START_WINDOW_MESSAGE = 'Pack Days start between 6:00 AM and 9:45 PM, when public parks are open.';

/** True when 'HH:MM' (24-hour) is inside the window. Anything else is false. */
export function isStartTimeAllowed(localTime: unknown): boolean {
  if (typeof localTime !== 'string') return false;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= EARLIEST_START_MINUTES && minutes <= LATEST_START_MINUTES;
}
