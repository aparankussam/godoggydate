import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminBucket, getAdminDb } from '../../../../lib/firebaseAdmin';
import { clientIp, createRateLimiter, requestOriginAllowed } from '../../../../lib/requestGuards';
import { checkContent } from '../../../../../shared/contentFilter';
import {
  LOST_LIMITS,
  coarsenPin,
  isValidLostId,
  sniffImageType,
  validateSighting,
} from '../../../../../shared/lostDog';

// "I found / saw this dog": the one public write in the lost-dog feature. People
// without the app use it, so there is no account to hang limits on. Guards:
//   - own-origin only for the website form (the app sends a Firebase ID token
//     instead, which also records WHO helped so they can be thanked later)
//   - a hidden honeypot field and a minimum fill time reject simple bots
//   - an in-memory per-IP burst limit, then DURABLE limits in Firestore
//     (lostRate/*, Admin only): per IP per hour, per alert per hour, per alert total
//   - the shared content filter and a no-links rule on every text field
//   - photos: 4 MB, JPEG/PNG/WebP by their first bytes (never the declared type)
// The finder's exact pin and contact details go only to the owner-only
// sightings doc; the public page gets a ~1 km area (lib/lostPublic.ts).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = LOST_LIMITS.photoBytes + 64 * 1024;
const burst = createRateLimiter(10, 60_000);
const HOUR_MS = 60 * 60 * 1000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
}

/** Counts this report against the IP (or signed-in user), the alert's hour and the alert's total, all or nothing. */
async function claimQuota(alertId: string, actor: string): Promise<'ok' | 'actor' | 'hour' | 'total'> {
  const db = getAdminDb();
  const hour = Math.floor(Date.now() / HOUR_MS);
  const expireAt = Timestamp.fromMillis((hour + 2) * HOUR_MS);
  const actorHash = createHash('sha256').update(`${process.env.LOST_RATE_SALT ?? ''}${actor}`).digest('hex').slice(0, 32);
  const refs = {
    actor: db.doc(`lostRate/a_${actorHash}_${hour}`),
    hour: db.doc(`lostRate/h_${alertId}_${hour}`),
    total: db.doc(`lostRate/t_${alertId}`),
  };
  return db.runTransaction(async (tx) => {
    const [a, h, t] = await Promise.all([tx.get(refs.actor), tx.get(refs.hour), tx.get(refs.total)]);
    if ((a.data()?.n ?? 0) >= LOST_LIMITS.sightingsPerIpPerHour) return 'actor';
    if ((h.data()?.n ?? 0) >= LOST_LIMITS.sightingsPerAlertPerHour) return 'hour';
    if ((t.data()?.n ?? 0) >= LOST_LIMITS.sightingsPerAlertTotal) return 'total';
    tx.set(refs.actor, { n: FieldValue.increment(1), expireAt }, { merge: true });
    tx.set(refs.hour, { n: FieldValue.increment(1), expireAt }, { merge: true });
    tx.set(refs.total, { n: FieldValue.increment(1) }, { merge: true });
    return 'ok';
  });
}

export async function POST(request: Request) {
  // Who is calling: a signed-in app user (Bearer token) or an anonymous web visitor.
  let reporterUid: string | null = null;
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) {
    try {
      reporterUid = (await getAdminAuth().verifyIdToken(bearer)).uid;
    } catch {
      return fail('Please sign in again.', 401);
    }
  } else if (!requestOriginAllowed(request)) {
    return fail('forbidden', 403);
  }

  const ip = clientIp(request);
  if (burst.hit(reporterUid ?? ip)) return fail('Too many reports. Please wait a minute.', 429);

  const declared = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return fail('That is too large. Try a smaller photo.', 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Could not read that. Please try again.', 400);
  }

  // Bots fill every field. Pretend it worked so they don't learn what tripped.
  if (field(form, 'website')) return NextResponse.json({ ok: true });
  if (!reporterUid) {
    const startedAt = Number(field(form, 't'));
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < LOST_LIMITS.minFillMs) {
      return fail('Please take a moment to describe what you saw, then send it again.', 429);
    }
  }

  const alertId = field(form, 'alertId');
  if (!isValidLostId(alertId)) return fail('This alert was not found.', 404);

  const checked = validateSighting(
    { message: field(form, 'message'), contact: field(form, 'contact'), finderName: field(form, 'finderName'), lat: field(form, 'lat'), lng: field(form, 'lng') },
    (text) => checkContent(text).ok,
  );
  if ('error' in checked) return fail(checked.error, 400);

  let photoBytes: Buffer | null = null;
  const photo = form.get('photo');
  if (photo && typeof photo !== 'string' && photo.size > 0) {
    if (photo.size > LOST_LIMITS.photoBytes) return fail('That photo is too large (4 MB max).', 413);
    photoBytes = Buffer.from(await photo.arrayBuffer());
  }
  const photoType = photoBytes ? sniffImageType(photoBytes) : null;
  if (photoBytes && !photoType) return fail('Please attach a JPEG, PNG or WebP photo.', 400);

  const db = getAdminDb();
  const alertSnap = await db.doc(`lostAlerts/${alertId}`).get();
  if (!alertSnap.exists) return fail('This alert was not found.', 404);
  if (alertSnap.data()?.status !== 'active') return fail('Good news: this dog has already been found.', 410);
  if (reporterUid && reporterUid === alertSnap.data()?.ownerId) return fail('This is your own alert.', 400);

  const quota = await claimQuota(alertId, reporterUid ?? ip);
  if (quota !== 'ok') {
    return fail(
      quota === 'actor' ? 'You have sent several reports already. Please try again in an hour.' : 'This alert is getting a lot of reports. Please try again later.',
      429,
    );
  }

  let photoUrl: string | null = null;
  if (photoBytes && photoType) {
    try {
      const token = randomUUID();
      const path = `lostSightings/${alertId}/${randomUUID()}.${photoType === 'image/jpeg' ? 'jpg' : photoType === 'image/png' ? 'png' : 'webp'}`;
      const bucket = getAdminBucket();
      await bucket.file(path).save(photoBytes, {
        resumable: false,
        metadata: { contentType: photoType, cacheControl: 'private, max-age=3600', metadata: { firebaseStorageDownloadTokens: token } },
      });
      photoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    } catch (error) {
      // The report matters more than the picture.
      console.error('lost sighting: photo upload failed', error);
    }
  }

  const { value } = checked;
  await db.collection(`lostAlerts/${alertId}/sightings`).add({
    message: value.message,
    contact: value.contact || null,
    finderName: value.finderName || null,
    // Exact pin: the owner only (firestore.rules). The public page reads `area`.
    lat: value.lat,
    lng: value.lng,
    area: coarsenPin(value.lat, value.lng),
    photoUrl,
    reporterUid,
    source: reporterUid ? 'app' : 'web',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
