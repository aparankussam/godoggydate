// shared/lostDog.ts
// Lost dog alert: pure rules shared by the iPhone app, the website's public
// alert page and its sighting form. Free for everyone, never behind a paywall.
//
// Privacy rules that every consumer relies on:
//  - The owner's phone number and address are never stored on an alert, so no
//    public surface can show them. A finder reaches the owner through the
//    sighting form, which sends the owner a message.
//  - The microchip number and vet phone live only in the owner's private kit
//    (users/{uid}/private/lostKit). The alert holds just `microchipped: true`.
//  - A sighting keeps the exact pin for the owner only. Everyone else gets it
//    rounded to about 1 km (coarsenPin).

export const LOST_LIMITS = {
  markings: 200,
  lastSeen: 80,
  message: 500,
  contact: 80,
  finderName: 40,
  medicines: 5,
  medicineLabel: 40,
  microchip: 40,
  vetPhone: 30,
  /** Sightings one person (by IP) can send per hour, across all alerts. */
  sightingsPerIpPerHour: 5,
  /** Sightings one alert accepts per hour, from everyone. */
  sightingsPerAlertPerHour: 40,
  /** Sightings one alert accepts in total. */
  sightingsPerAlertTotal: 200,
  /** Largest photo a finder may attach. */
  photoBytes: 4 * 1024 * 1024,
  /** A form submitted faster than this was not filled in by a person. */
  minFillMs: 2500,
} as const;

export type LostStatus = 'active' | 'found';

export interface LostKit {
  photoUrl?: string;
  microchip?: string;
  vetPhone?: string;
  markings?: string;
}

/** The public-safe fields of lostAlerts/{id}. */
export interface LostAlert {
  id: string;
  ownerId: string;
  dogName: string;
  breed?: string;
  size?: string;
  markings?: string;
  photoUrl?: string;
  microchipped: boolean;
  /** "Needs <label> daily" lines. */
  medicines: string[];
  lastSeen?: string;
  city: string;
  state: string;
  status: LostStatus;
  createdAtMs: number;
  foundAtMs?: number;
}

const ID_PATTERN = /^[A-Za-z0-9]{8,64}$/;
export function isValidLostId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

export function lostPageUrl(base: string, id: string): string {
  return `${base.replace(/\/$/, '')}/lost/${id}`;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * "Needs <label> daily" for every Daily medicine reminder (type 'medication',
 * see mobile/lib/reminders.ts). The type is compared as a string so this keeps
 * working whichever build of shared/types knows the type.
 */
export function medicineNeeds(reminders: ReadonlyArray<{ type: string; label?: string }>): string[] {
  const out: string[] = [];
  for (const r of reminders) {
    if (r.type !== 'medication') continue;
    const label = cleanLine(r.label, LOST_LIMITS.medicineLabel) || 'medicine';
    const line = `Needs ${label} daily`;
    if (!out.includes(line)) out.push(line);
    if (out.length >= LOST_LIMITS.medicines) break;
  }
  return out;
}

/** The facts printed on the poster and the public page, in order. */
export function lostFacts(alert: Pick<LostAlert, 'breed' | 'size' | 'markings' | 'microchipped' | 'medicines' | 'lastSeen' | 'city' | 'state'>): string[] {
  const SIZES: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' };
  const lines: string[] = [];
  const bodyParts = [alert.breed?.trim(), alert.size ? SIZES[alert.size] : undefined].filter(Boolean);
  if (bodyParts.length) lines.push(bodyParts.join(' · '));
  if (alert.markings?.trim()) lines.push(`Markings: ${alert.markings.trim()}`);
  if (alert.microchipped) lines.push('Microchipped');
  for (const m of alert.medicines) lines.push(m);
  if (alert.lastSeen?.trim()) lines.push(`Last seen: ${alert.lastSeen.trim()}`);
  const place = [alert.city, alert.state].filter(Boolean).join(', ');
  if (place) lines.push(`Lost near ${place}`);
  return lines;
}

/** Rounds a pin to 0.01 degrees (about 1 km) for the public. null when not a real coordinate. */
export function coarsenPin(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

export interface SightingInput {
  message: string;
  contact: string;
  finderName: string;
  lat: number | null;
  lng: number | null;
}

export type SightingCheck = { ok: true; value: SightingInput } | { ok: false; error: string };

const LINK_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|app|ly)\b/i;

/** Validates and cleans the text fields of a "I saw this dog" report. */
export function validateSighting(
  raw: { message?: unknown; contact?: unknown; finderName?: unknown; lat?: unknown; lng?: unknown },
  // The caller passes the content filter (shared/contentFilter.ts, or the server's copy):
  // it is injected so this file has no imports and runs under plain node in tests.
  isClean: (text: string) => boolean,
): SightingCheck {
  const message = cleanLine(raw.message, LOST_LIMITS.message);
  const contact = cleanLine(raw.contact, LOST_LIMITS.contact);
  const finderName = cleanLine(raw.finderName, LOST_LIMITS.finderName);
  if (message.length < 3) return { ok: false, error: 'Tell the owner a little about where and when you saw the dog.' };
  // Links are the usual way a form with no accounts gets used for spam. A phone
  // number is fine: it goes only to the owner.
  if (LINK_PATTERN.test(message) || LINK_PATTERN.test(finderName)) {
    return { ok: false, error: 'Please leave links out of your message.' };
  }
  for (const text of [message, contact, finderName]) {
    if (text && !isClean(text)) return { ok: false, error: 'Please keep it kind and friendly.' };
  }
  const hasPin = raw.lat !== null && raw.lat !== undefined && raw.lat !== '' && raw.lng !== null && raw.lng !== undefined && raw.lng !== '';
  let lat: number | null = null;
  let lng: number | null = null;
  if (hasPin) {
    const pin = coarsenPin(Number(raw.lat), Number(raw.lng));
    if (!pin) return { ok: false, error: 'That location does not look right.' };
    lat = Number(raw.lat);
    lng = Number(raw.lng);
  }
  return { ok: true, value: { message, contact, finderName, lat, lng } };
}

/** Image types a finder may attach, by their first bytes (the declared type is not trusted). */
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

/** "3 min ago", "2 h ago", "yesterday"... for the public page. */
export function timeAgo(thenMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - thenMs) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
