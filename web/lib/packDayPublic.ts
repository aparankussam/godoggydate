// web/lib/packDayPublic.ts
// Server-only loader for the public, no-signup Pack Day page and its share
// image. Uses the Admin SDK (bypassing firestore.rules, like /d/[slug]).
//
// STRICT ALLOWLIST — never spread the document. This crosses into HTML any
// stranger or crawler can read, so it carries what a flyer would: what, when,
// where (a public place name), how many. It deliberately omits hostUid and
// attendeeUids (identifiers), the founding list (who paid), and the host's
// profile — the host's dog is named, nothing more.

import { getAdminDb } from './firebaseAdmin';
import { PACK_DAY_FORMAT_KEYS } from '../../shared/packDay';
import type { PackDay, PackDayFormat } from '../../shared/packDay';

export interface PublicPackDay {
  event: Pick<
    PackDay,
    'id' | 'title' | 'format' | 'startsAtMs' | 'durationMinutes' | 'localDate' | 'localTime' |
    'placeName' | 'city' | 'state' | 'note' | 'capacity' | 'status' | 'official' | 'hostDogName'
  >;
  /** A count, never the list. */
  attendeeCount: number;
}

export async function loadPublicPackDay(eventId: string): Promise<PublicPackDay | null> {
  // Same guard as the dog slug: a malformed id would otherwise reach Firestore
  // as an invalid doc path and throw instead of returning "not found".
  if (!/^[A-Za-z0-9]{1,64}$/.test(eventId)) return null;
  try {
    const snap = await getAdminDb().doc(`packDays/${eventId}`).get();
    if (!snap.exists) return null;
    const raw = snap.data();
    if (!raw || typeof raw.title !== 'string') return null;
    const format = PACK_DAY_FORMAT_KEYS.includes(raw.format as PackDayFormat) ? (raw.format as PackDayFormat) : 'pack-walk';
    return {
      event: {
        id: snap.id,
        title: raw.title,
        format,
        startsAtMs: Number(raw.startsAtMs ?? 0),
        durationMinutes: Number(raw.durationMinutes ?? 60),
        localDate: String(raw.localDate ?? ''),
        localTime: String(raw.localTime ?? ''),
        placeName: String(raw.placeName ?? ''),
        city: String(raw.city ?? ''),
        state: String(raw.state ?? ''),
        note: String(raw.note ?? ''),
        capacity: Number(raw.capacity ?? 0),
        status: raw.status === 'cancelled' ? 'cancelled' : 'open',
        official: raw.official === true,
        hostDogName: String(raw.hostDogName ?? ''),
      },
      attendeeCount: Array.isArray(raw.attendeeUids) ? raw.attendeeUids.length : 0,
    };
  } catch (error) {
    console.error('public pack day: failed to load', eventId, error);
    return null;
  }
}
