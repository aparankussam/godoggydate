// web/lib/packDayPending.ts
// Remembers which Pack Day a visitor came for, so sign-up and the dog-profile
// step can drop them back on it instead of the generic home. Deliberately
// dependency-free: the public /pack/[id] page imports this, and it must not
// drag the Firebase client into a page strangers open from a QR code.

const PENDING_KEY = 'godoggydate.pendingPackDay';

export function setPendingPackDay(eventId: string): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, eventId);
  } catch { /* storage unavailable — they land on /app and can reopen the link */ }
}

export function takePendingPackDay(): string | null {
  try {
    const id = window.sessionStorage.getItem(PENDING_KEY);
    if (id) window.sessionStorage.removeItem(PENDING_KEY);
    return id && /^[A-Za-z0-9]{1,64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
