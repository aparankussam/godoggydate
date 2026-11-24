import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import { makePackDayFunctions } from './packDay';
import {
  MODERATED_MESSAGE_TEXT,
  checkMessageContent,
  dogPhotoFixes,
  dogProfileContentFixes,
  isSafeDocId,
  moderationNoticeFor,
} from './moderation';
import {
  FOUNDING_FREE_SPOTS,
  FOUNDING_PRICE_CENTS,
  FOUNDING_TOTAL,
  classifyFoundingCheckout,
  foundingProfileGaps,
  formatUsdCents,
} from './founding';
import { isOwnStoragePhotoUrl } from './photoUrl';
import type { PhotoUrlPolicy } from './photoUrl';
import { deleteUserData } from './accountCleanup';

admin.initializeApp();
const db = admin.firestore();
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
// Slack- or Discord-compatible incoming webhook URL for anything a human must
// act on: user reports and payments that couldn't be attributed.
const opsAlertWebhookUrl = defineSecret('OPS_ALERT_WEBHOOK_URL');

// Founding Member lifetime tier — checkout sessions below this amount never
// grant the entitlement ($39.00). Mirrored from shared/founding.ts (./founding).
const FOUNDING_MEMBER_MIN_CENTS = FOUNDING_PRICE_CENTS;

// The founding ladder (./founding is a copy of shared/founding.ts): #1–50 are
// free and handed out by onDogProfileFounding to the first finished profiles,
// #51–150 are numbered by the Stripe webhook as each $39 payment lands, and
// then founding closes. Both draw from the one counters/foundingPack counter,
// which only counts up, so a number is never handed out twice (a refunded
// number stays retired). Change the numbers in shared/founding.ts (and copy it
// to ./founding.ts) together with the payment limit on the Stripe Payment Link
// (FOUNDING_TOTAL_CAP - FOUNDING_FREE_CAP).
const FOUNDING_FREE_CAP = FOUNDING_FREE_SPOTS;
const FOUNDING_TOTAL_CAP = FOUNDING_TOTAL;

type MatchData = FirebaseFirestore.DocumentData & {
  dog1UserId?: string;
  dog2UserId?: string;
  userAId?: string;
  userBId?: string;
  dog1ChatUnlocked?: boolean | null;
  dog2ChatUnlocked?: boolean | null;
  chatUnlocked?: boolean | null;
};

type MatchUnlockStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'payment_failed'
  | 'canceled'
  | 'refunded'
  | 'disputed';

interface StoredPaymentDoc {
  matchId?: string;
  userId?: string;
  unlockId?: string;
  unlockField?: 'dog1ChatUnlocked' | 'dog2ChatUnlocked';
}

function isMatchParticipant(matchData: MatchData | undefined, userId: string): boolean {
  if (!matchData || !userId) return false;

  return [
    matchData.dog1UserId,
    matchData.dog2UserId,
    matchData.userAId,
    matchData.userBId,
  ].includes(userId);
}

function getUnlockFieldForUserId(
  matchData: MatchData | undefined,
  userId: string,
): 'dog1ChatUnlocked' | 'dog2ChatUnlocked' | null {
  if (!matchData || !userId) return null;
  if (matchData.dog1UserId === userId || matchData.userAId === userId) return 'dog1ChatUnlocked';
  if (matchData.dog2UserId === userId || matchData.userBId === userId) return 'dog2ChatUnlocked';
  return null;
}

function getOtherUnlockField(field: 'dog1ChatUnlocked' | 'dog2ChatUnlocked') {
  return field === 'dog1ChatUnlocked' ? 'dog2ChatUnlocked' : 'dog1ChatUnlocked';
}

// A marker with no processedAt after this long means the handler died mid-run
// (timeout, instance kill) without reaching its catch block.
const STALE_STRIPE_EVENT_MS = 5 * 60 * 1000;

// Never throws: a failed alert must not fail the work that triggered it. The
// console.error is the backstop — it lands in Cloud Logging either way.
async function sendOpsAlert(text: string): Promise<void> {
  console.error('[ops-alert]', text);
  try {
    const response = await fetch(opsAlertWebhookUrl.value(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Slack reads `text`, Discord reads `content`.
      body: JSON.stringify({ text, content: text }),
    });
    if (!response.ok) console.error('sendOpsAlert: webhook rejected', { status: response.status });
  } catch (error) {
    console.error('sendOpsAlert: webhook failed', { error });
  }
}

// ── Alert throttling ───────────────────────────────────────────────────────────
// One account can fire a trigger as often as it likes (50 reports took 113 ms),
// and every run used to page a human. A throttle lets the first few alerts for
// a scope through each hour, sends ONE summary when the limit is hit, and keeps
// the rest quiet. What is being alerted about is always still stored (reports/,
// moderationLog/, safetyEvidence/), so a suppressed alert loses nothing.
//
// Slots are documents created with create(), which fails if the id exists. That
// needs no transaction, so a burst of concurrent triggers never contends on a
// single counter. Windows are fixed clock hours, not sliding ones. The docs
// carry expireAt: set a Firestore TTL policy on opsThrottle.expireAt to clear
// them (see PRODUCTION-LAUNCH-CHECKS.md); they are tiny, so it is optional.
const THROTTLE_WINDOW_MS = 60 * 60 * 1000;

/** A short, document-id-safe key for ids and text that came from a client. */
function throttleKey(...parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);
}

function isAlreadyExists(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  return code === '6' || code === 'already-exists';
}

interface ThrottleClaim {
  /** True when the caller is inside the limit and should alert. */
  allowed: boolean;
  /** True for exactly one caller per window, the first one past the limit. */
  firstOverflow: boolean;
}

/** Claims one of `limit` slots for `scope` in the current window. */
async function claimThrottleSlot(scope: string, limit: number, windowMs = THROTTLE_WINDOW_MS): Promise<ThrottleClaim> {
  const bucket = Math.floor(Date.now() / windowMs);
  const expireAt = Timestamp.fromMillis((bucket + 2) * windowMs);
  const claim = async (id: string): Promise<boolean> => {
    try {
      await db.doc(`opsThrottle/${id}`).create({ scope, at: FieldValue.serverTimestamp(), expireAt });
      return true;
    } catch (error) {
      if (isAlreadyExists(error)) return false;
      throw error;
    }
  };
  try {
    for (let slot = 0; slot < limit; slot += 1) {
      if (await claim(`${scope}_${bucket}_${slot}`)) return { allowed: true, firstOverflow: false };
    }
    return { allowed: false, firstOverflow: await claim(`${scope}_${bucket}_over`) };
  } catch (error) {
    // A broken throttle must never swallow an alert: over-alert instead.
    console.error('claimThrottleSlot failed, letting the alert through', { scope, error });
    return { allowed: true, firstOverflow: false };
  }
}

type ThrottledAlertOutcome = 'sent' | 'summary' | 'suppressed';

/**
 * sendOpsAlert with a per-scope limit per hour. `summary` goes out once when
 * the limit is first exceeded and should say that further alerts are held back.
 */
async function sendThrottledOpsAlert(
  scope: string,
  limit: number,
  text: string,
  summary: string,
): Promise<ThrottledAlertOutcome> {
  const claim = await claimThrottleSlot(scope, limit);
  if (claim.allowed) {
    await sendOpsAlert(text);
    return 'sent';
  }
  if (claim.firstOverflow) {
    await sendOpsAlert(summary);
    return 'summary';
  }
  console.warn('[ops-alert suppressed]', text);
  return 'suppressed';
}

// ── Where a dog photo may come from ───────────────────────────────────────────
// Only this project's Storage buckets. The configured bucket plus both default
// names (`<project>.appspot.com` and `<project>.firebasestorage.app`), because
// which one a project has depends on when it was created (GDD_PHOTO_BUCKETS adds
// others). The emulator's http://127.0.0.1:9199/ URLs count only while running
// in the emulator.
function photoUrlPolicy(): PhotoUrlPolicy {
  const buckets = new Set<string>();
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
  if (projectId) {
    buckets.add(`${projectId}.appspot.com`);
    buckets.add(`${projectId}.firebasestorage.app`);
  }
  try {
    const configured = admin.app().options.storageBucket;
    if (configured) buckets.add(configured);
  } catch {
    // No default app options: the project-id names above still apply.
  }
  // Escape hatch for photos kept in a bucket that is not the project's default
  // one (comma-separated names, in firebase/functions/.env). Without it such
  // photos would be dropped on the next profile write.
  for (const extra of (process.env.GDD_PHOTO_BUCKETS ?? '').split(',')) {
    if (extra.trim()) buckets.add(extra.trim());
  }
  const allowEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const emulatorPort = Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(':').pop()) || 9199;
  return { buckets: [...buckets], allowEmulator, emulatorPort };
}

/**
 * False only when Auth positively says the user is gone or banned (disabled by
 * scripts/admin-ban-user.cjs); any other failure throws rather than guessing.
 */
async function authUserIsActive(uid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(uid);
    return user.disabled !== true;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
    if (code === 'auth/user-not-found') return false;
    throw error;
  }
}

async function isBlockedEitherWay(uidA: string, uidB: string): Promise<boolean> {
  const [aBlockedB, bBlockedA] = await Promise.all([
    db.doc(`blocks/${uidA}/blocked/${uidB}`).get(),
    db.doc(`blocks/${uidB}/blocked/${uidA}`).get(),
  ]);
  return aBlockedB.exists || bBlockedA.exists;
}

async function markStripeEventStarted(event: Stripe.Event): Promise<boolean> {
  try {
    await db.collection('stripeEvents').doc(event.id).create({
      type: event.type,
      createdAt: FieldValue.serverTimestamp(),
      livemode: event.livemode,
    });
    return true;
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

    if (code === '6' || code === 'already-exists') {
      const markerRef = db.collection('stripeEvents').doc(event.id);
      const marker = (await markerRef.get()).data();
      const startedAtMs = marker?.createdAt?.toMillis?.() ?? 0;
      if (!marker?.processedAt && Date.now() - startedAtMs > STALE_STRIPE_EVENT_MS) {
        await markerRef.update({ createdAt: FieldValue.serverTimestamp() });
        return true;
      }
      return false;
    }

    throw error;
  }
}

async function finalizeStripeEvent(eventId: string, status: 'processed' | 'ignored', extra?: Record<string, unknown>) {
  await db.collection('stripeEvents').doc(eventId).set({
    status,
    processedAt: FieldValue.serverTimestamp(),
    ...extra,
  }, { merge: true });
}

async function upsertMatchUnlockState(
  matchId: string,
  userId: string,
  field: 'dog1ChatUnlocked' | 'dog2ChatUnlocked',
  nextFieldValue: boolean,
  status: MatchUnlockStatus,
  paymentIntentId: string,
  extra?: Record<string, unknown>,
) {
  const matchRef = db.doc(`matches/${matchId}`);
  const unlockRef = db.doc(`matchUnlocks/${matchId}_${userId}`);
  const paymentRef = db.doc(`payments/${paymentIntentId}`);

  await db.runTransaction(async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists) {
      throw new Error(`Match ${matchId} not found while updating unlock state`);
    }

    const matchData = matchSnap.data() as MatchData;
    const otherField = getOtherUnlockField(field);
    const otherUnlocked = Boolean(matchData[otherField]);
    const anyUnlocked = nextFieldValue || otherUnlocked;

    transaction.set(matchRef, {
      [field]: nextFieldValue,
      chatUnlocked: anyUnlocked,
      paymentId: nextFieldValue ? paymentIntentId : matchData.paymentId ?? null,
      unlockedByUserId: nextFieldValue ? userId : matchData.unlockedByUserId ?? null,
      unlockedAt: nextFieldValue ? FieldValue.serverTimestamp() : matchData.unlockedAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(unlockRef, {
      matchId,
      userId,
      unlockField: field,
      paymentIntentId,
      status,
      updatedAt: FieldValue.serverTimestamp(),
      ...extra,
    }, { merge: true });

    transaction.set(paymentRef, {
      matchId,
      userId,
      unlockId: `${matchId}_${userId}`,
      unlockField: field,
      paymentIntentId,
      status,
      updatedAt: FieldValue.serverTimestamp(),
      ...extra,
    }, { merge: true });
  });
}

// ── goDoggyDate Pro (subscription entitlement) ──────────────────────────────
// The webhook is the SOLE writer of users/{uid}/private/entitlements.pro —
// firestore.rules blocks every client write. isProActive (shared/pro.ts) reads
// these exact fields; keep the two in lockstep. Founding Members already get
// lifetime Pro via lifetimeChatUnlocks, so this only tracks paid subscriptions.

// active/trialing clearly grant access; past_due keeps access during Stripe's
// dunning retries and is bounded by currentPeriodEndMs + the client-side grace
// window, so a genuinely lapsed sub still expires rather than lingering.
const PRO_ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

function subscriptionTier(sub: Stripe.Subscription): 'monthly' | 'annual' {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === 'year' ? 'annual' : 'monthly';
}

async function writeProEntitlementFromSubscription(uid: string, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
  // current_period_end is top-level in the 2024-04-10 shape but moved onto
  // items[] in Basil (2025-03-31+). Read top-level first, then fall back to the
  // item so a future API/SDK bump can't silently write a null period end (which
  // would make isProActive's "no known end" fallback grant Pro indefinitely).
  const itemPeriodEnd = (sub.items?.data?.[0] as unknown as { current_period_end?: number })
    ?.current_period_end;
  const periodEndSec =
    typeof sub.current_period_end === 'number'
      ? sub.current_period_end
      : typeof itemPeriodEnd === 'number'
        ? itemPeriodEnd
        : null;
  const currentPeriodEndMs = periodEndSec !== null ? periodEndSec * 1000 : null;

  await db.doc(`users/${uid}/private/entitlements`).set({
    pro: {
      active: PRO_ACTIVE_STATUSES.has(sub.status),
      status: sub.status,
      tier: subscriptionTier(sub),
      currentPeriodEndMs,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      updatedAtMs: Date.now(),
    },
  }, { merge: true });
}

// ── Founding Member purchases ──────────────────────────────────────────────────
// A $39 purchase grants the lifetime entitlement and the next founding number.
// Entitlement, counter, dog badge and payment record are written in ONE
// transaction, so a webhook retry either finds everything done or nothing done.

type PaidFoundingOutcome =
  | 'granted'            // new paid member with a number
  | 'granted_unnumbered' // paid after #150 was taken: member, but no number left
  | 'already_member'     // already a Founding Member: nothing changed, refund by hand
  | 'account_missing'    // the buyer's account no longer exists: nothing granted, refund by hand
  | 'replayed';          // this checkout session was already processed

interface PaidFoundingResult {
  outcome: PaidFoundingOutcome;
  foundingNumber: number | null;
  /** True when the number came out of the free range (#1–50): they paid while
   *  free spots were still open. */
  boughtDuringFreeSpots: boolean;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function grantPaidFoundingMember(
  uid: string,
  session: Stripe.Checkout.Session,
  paymentIntentId: string,
): Promise<PaidFoundingResult> {
  // A purchase for an account that has since been deleted (or banned) must not
  // create an entitlement (and spend a number) for nobody: the caller turns this
  // into an orphaned-payment alert for a manual refund.
  if (!(await authUserIsActive(uid))) {
    return { outcome: 'account_missing', foundingNumber: null, boughtDuringFreeSpots: false };
  }
  const entitlementRef = db.doc(`users/${uid}/private/entitlements`);
  const dogRef = db.doc(`dogs/${uid}`);
  const counterRef = db.doc('counters/foundingPack');
  const paymentRef = paymentIntentId ? db.doc(`payments/${paymentIntentId}`) : null;
  const now = FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    const [entSnap, dogSnap, counterSnap] = await Promise.all([
      tx.get(entitlementRef),
      tx.get(dogRef),
      tx.get(counterRef),
    ]);
    const ent: FirebaseFirestore.DocumentData = entSnap.data() ?? {};
    const existingNumber = asNumber(ent.foundingNumber);

    if (ent.checkoutSessionId === session.id) {
      return { outcome: 'replayed', foundingNumber: existingNumber, boughtDuringFreeSpots: false };
    }

    // Record the payment so charge.refunded / dispute events can find it
    // (they look up payments/{paymentIntentId}).
    const paymentRecord = {
      type: 'founding_member',
      userId: uid,
      checkoutSessionId: session.id,
      status: 'succeeded',
      amount: session.amount_total ?? null,
      currency: session.currency ?? null,
      updatedAt: now,
    };

    // Already a Founding Member (a free spot or an earlier purchase). Their
    // membership stays exactly as it is, and `duplicate` makes sure refunding
    // this second payment can't take it away.
    if (ent.lifetimeChatUnlocks === true) {
      if (paymentRef) tx.set(paymentRef, { ...paymentRecord, duplicate: true }, { merge: true });
      return { outcome: 'already_member', foundingNumber: existingNumber, boughtDuringFreeSpots: false };
    }

    // A dog numbered before the ladder existed keeps the number it shows.
    // Otherwise take the next number, unless all 150 are gone.
    const dogNumber = dogSnap.exists ? asNumber(dogSnap.data()?.foundingPackNumber) : null;
    const count = asNumber(counterSnap.data()?.count) ?? 0;
    let foundingNumber: number | null = dogNumber;
    let boughtDuringFreeSpots = false;
    if (foundingNumber === null && count < FOUNDING_TOTAL_CAP) {
      foundingNumber = count + 1;
      boughtDuringFreeSpots = count < FOUNDING_FREE_CAP;
      tx.set(counterRef, { count: foundingNumber }, { merge: true });
      // No dog profile yet: onDogProfileFounding copies the number across when
      // they make one. Writing here would create a half-empty dog doc.
      if (dogSnap.exists) tx.set(dogRef, { foundingPackNumber: foundingNumber }, { merge: true });
    }

    tx.set(entitlementRef, {
      lifetimeChatUnlocks: true,
      source: 'founding_member',
      foundingNumber,
      checkoutSessionId: session.id,
      paymentIntentId: paymentIntentId || null,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      grantedAt: now,
      // Buying again after a refund: clear the old revocation.
      revokedAt: FieldValue.delete(),
      revokedReason: FieldValue.delete(),
    }, { merge: true });
    if (paymentRef) tx.set(paymentRef, { ...paymentRecord, foundingNumber }, { merge: true });

    return {
      outcome: foundingNumber === null ? 'granted_unnumbered' : 'granted',
      foundingNumber,
      boughtDuringFreeSpots,
    };
  });
}

// A full refund or a dispute of a $39 purchase ends that paid membership and
// retires its number (the counter never goes back down). A free member, or a
// refund of a second purchase, never loses anything.
async function revokePaidFoundingMember(
  uid: string,
  paymentIntentId: string,
  reason: 'refunded' | 'disputed',
  duplicatePurchase: boolean,
): Promise<void> {
  const entitlementRef = db.doc(`users/${uid}/private/entitlements`);
  const dogRef = db.doc(`dogs/${uid}`);
  const paymentRef = db.doc(`payments/${paymentIntentId}`);
  const now = FieldValue.serverTimestamp();

  await db.runTransaction(async (tx) => {
    const [entSnap, dogSnap] = await Promise.all([tx.get(entitlementRef), tx.get(dogRef)]);
    const ent: FirebaseFirestore.DocumentData = entSnap.data() ?? {};

    tx.set(paymentRef, { status: reason, updatedAt: now }, { merge: true });

    // The account was deleted (deleteAccount removes users/{uid}) before this
    // refund or dispute arrived: the payment record above is all that is left to
    // update. Writing the entitlement would recreate an orphan doc for nobody.
    if (!entSnap.exists) return;
    if (duplicatePurchase || ent.foundingFree === true) return;
    // A refund of an older payment must not end a membership a newer one bought.
    if (typeof ent.paymentIntentId === 'string' && ent.paymentIntentId !== paymentIntentId) return;

    const foundingNumber = asNumber(ent.foundingNumber);
    tx.set(entitlementRef, {
      lifetimeChatUnlocks: false,
      foundingNumber: FieldValue.delete(),
      revokedAt: now,
      revokedReason: reason,
    }, { merge: true });
    if (
      foundingNumber !== null &&
      dogSnap.exists &&
      asNumber(dogSnap.data()?.foundingPackNumber) === foundingNumber
    ) {
      tx.update(dogRef, { foundingPackNumber: FieldValue.delete() });
    }
  });
}

// ── Stripe Webhook ─────────────────────────────────────────────────────────────

export const stripeWebhook = functions
  .runWith({ secrets: [stripeSecretKey, stripeWebhookSecret, opsAlertWebhookUrl] })
  .https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = stripeWebhookSecret.value();
    const stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: '2024-04-10',
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const shouldProcess = await markStripeEventStarted(event);
    if (!shouldProcess) {
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { matchId, userId } = pi.metadata;

        if (matchId && userId) {
          const matchRef = db.doc(`matches/${matchId}`);
          const matchSnap = await matchRef.get();

          if (!matchSnap.exists) {
            throw new Error(`Match ${matchId} not found for payment intent ${pi.id}`);
          }

          const matchData = matchSnap.data() as MatchData;
          if (!isMatchParticipant(matchData, userId)) {
            throw new Error(`Payment user ${userId} is not a participant in match ${matchId}`);
          }

          const unlockField = getUnlockFieldForUserId(matchData, userId);
          if (!unlockField) {
            throw new Error(`Could not determine unlock field for user ${userId} on match ${matchId}`);
          }

          await upsertMatchUnlockState(
            matchId,
            userId,
            unlockField,
            true,
            'succeeded',
            pi.id,
            {
              amount: pi.amount,
              currency: pi.currency,
              unlockedByUserId: userId,
              createdAt: FieldValue.serverTimestamp(),
            },
          );
        }

        await finalizeStripeEvent(event.id, 'processed', {
          paymentIntentId: pi.id,
        });
        res.json({ received: true });
        return;
      }

      if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { matchId, userId } = pi.metadata;

        if (matchId && userId) {
          const matchSnap = await db.doc(`matches/${matchId}`).get();
          if (matchSnap.exists) {
            const unlockField = getUnlockFieldForUserId(matchSnap.data() as MatchData, userId);
            if (unlockField) {
              await upsertMatchUnlockState(
                matchId,
                userId,
                unlockField,
                false,
                event.type === 'payment_intent.canceled' ? 'canceled' : 'payment_failed',
                pi.id,
                {
                  amount: pi.amount,
                  currency: pi.currency,
                  failureMessage: pi.last_payment_error?.message ?? null,
                },
              );
            }
          }
        }

        await finalizeStripeEvent(event.id, 'processed', {
          paymentIntentId: pi.id,
        });
        res.json({ received: true });
        return;
      }

      if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : '';

        // A partial refund (goodwill credit, duplicate fee) keeps access: only a
        // full refund or a dispute takes it away.
        const revokesAccess = event.type === 'charge.dispute.created' || charge.refunded === true;

        if (paymentIntentId && revokesAccess) {
          const paymentSnap = await db.doc(`payments/${paymentIntentId}`).get();
          if (paymentSnap.exists) {
            const paymentData = paymentSnap.data() as StoredPaymentDoc & { type?: string; duplicate?: boolean };

            // Founding Member refund/dispute → end that paid membership.
            if (paymentData.type === 'founding_member' && paymentData.userId) {
              await revokePaidFoundingMember(
                paymentData.userId,
                paymentIntentId,
                event.type === 'charge.refunded' ? 'refunded' : 'disputed',
                paymentData.duplicate === true,
              );
            }

            if (paymentData.matchId && paymentData.userId && paymentData.unlockField) {
              // deleteAccount removes the matches of a leaving user, so a refund
              // that arrives afterwards has no match to relock. That is not an
              // error (a 500 would make Stripe retry for days): the payment record
              // is all that is left to mark.
              const matchStillExists = (await db.doc(`matches/${paymentData.matchId}`).get()).exists;
              if (matchStillExists) {
                await upsertMatchUnlockState(
                  paymentData.matchId,
                  paymentData.userId,
                  paymentData.unlockField,
                  false,
                  event.type === 'charge.refunded' ? 'refunded' : 'disputed',
                  paymentIntentId,
                  {
                    amountRefunded: charge.amount_refunded ?? 0,
                    disputeId: event.type === 'charge.dispute.created' ? event.id : null,
                    refundEventId: event.type === 'charge.refunded' ? event.id : null,
                  },
                );
              } else {
                await db.doc(`payments/${paymentIntentId}`).set({
                  status: event.type === 'charge.refunded' ? 'refunded' : 'disputed',
                  updatedAt: FieldValue.serverTimestamp(),
                  matchGone: true,
                }, { merge: true });
              }
            }
          }
        }

        await finalizeStripeEvent(event.id, 'processed', {
          paymentIntentId,
        });
        res.json({ received: true });
        return;
      }

      // A dispute ends one of two ways. charge.dispute.created already took the
      // access away, so a LOST dispute only has to make sure that stuck, while a
      // WON dispute is the owner's call: the member did pay in the end, but the
      // number was retired when the dispute opened, so nothing is given back
      // automatically. Both are recorded on the payment and, for a Founding
      // Member purchase, put in front of a human.
      if (event.type === 'charge.dispute.closed') {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId =
          typeof dispute.payment_intent === 'string' ? dispute.payment_intent : '';
        const outcome = dispute.status === 'won' || dispute.status === 'lost' ? dispute.status : 'other';

        if (paymentIntentId) {
          const paymentRef = db.doc(`payments/${paymentIntentId}`);
          const paymentSnap = await paymentRef.get();
          if (paymentSnap.exists) {
            const paymentData = paymentSnap.data() as StoredPaymentDoc & { type?: string; duplicate?: boolean };
            await paymentRef.set({
              disputeStatus: dispute.status,
              disputeId: dispute.id,
              disputeClosedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            if (paymentData.type === 'founding_member' && paymentData.userId) {
              if (outcome === 'lost') {
                // Idempotent: a no-op if the dispute opening already revoked it.
                await revokePaidFoundingMember(
                  paymentData.userId,
                  paymentIntentId,
                  'disputed',
                  paymentData.duplicate === true,
                );
              } else if (outcome === 'won') {
                await sendOpsAlert(
                  `Founding Member dispute WON: payment ${paymentIntentId}, dispute ${dispute.id}, user ${paymentData.userId}. ` +
                  'The membership was revoked and its number retired when the dispute opened, and it stays revoked. ' +
                  'If you want them back, grant it by hand.',
                );
              }
            }
          }
        }

        console.log('Stripe dispute closed', { disputeId: dispute.id, status: dispute.status, paymentIntentId });
        await finalizeStripeEvent(event.id, 'processed', {
          paymentIntentId,
          disputeId: dispute.id,
          disputeStatus: dispute.status,
        });
        res.json({ received: true });
        return;
      }

      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object as Stripe.Checkout.Session;

        // goDoggyDate Pro subscription checkout (mode: 'subscription'). Handled
        // separately from the one-time Founding Member payment-link flow below
        // so the two never cross wires: a subscription must never trip the
        // amount >= 3900 lifetime grant, and a $39 lifetime purchase must never
        // be treated as a subscription. Ongoing renewals/cancels are tracked by
        // the customer.subscription.* events, not here.
        if (session.mode === 'subscription') {
          const proUid = session.client_reference_id || (session.metadata?.firebaseUid ?? '');
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id ?? '';
          if (proUid && subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            await writeProEntitlementFromSubscription(proUid, sub);
          }
          await finalizeStripeEvent(event.id, proUid && subscriptionId ? 'processed' : 'ignored', {
            checkoutSessionId: session.id,
            mode: 'subscription',
            hasClientReference: Boolean(proUid),
          });
          res.json({ received: true });
          return;
        }

        // Founding Member lifetime purchase via a Stripe Payment Link.
        // The marketing site appends ?client_reference_id=<uid> to the link,
        // so the session carries the purchasing user's Firebase uid.
        // Guards (classifyFoundingCheckout, in ./founding): must actually be
        // paid, and must be at least the Founding Member price — a cheaper
        // product on this Stripe account must never grant the entitlement.
        // Subtotal, not total, so a promo code the owner handed out still
        // grants what the buyer was promised; but a 100%-off session (nothing
        // charged) never spends a number.
        const uid = session.client_reference_id;
        const verdict = classifyFoundingCheckout({
          paymentStatus: session.payment_status,
          amountSubtotal: session.amount_subtotal,
          amountTotal: session.amount_total,
          currency: session.currency,
        });
        const paidEnough = verdict.grants;
        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : '';
        let granted = false;

        if (uid && paidEnough) {
          const result = await grantPaidFoundingMember(uid, session, paymentIntentId);
          granted = result.outcome !== 'account_missing';
          // The buyer has a Stripe receipt either way, so anything other than a
          // clean grant goes to a human.
          if (result.outcome === 'account_missing') {
            await sendOpsAlert(
              `Founding Member bought by an account that no longer exists or is banned: session ${session.id}. ` +
              'Nothing was granted and no number was used. Refund this payment by hand.',
            );
          } else if (result.outcome === 'already_member') {
            await sendOpsAlert(
              `Founding Member bought by someone who already is one: session ${session.id}. ` +
              'Their membership is unchanged. Refund this payment by hand.',
            );
          } else if (result.outcome === 'granted_unnumbered') {
            await sendOpsAlert(
              `Founding Member sold after all ${FOUNDING_TOTAL_CAP} numbers were taken: session ${session.id}. ` +
              'They have the membership but no number. Refund it by hand and turn off the payment link.',
            );
          } else if (result.outcome === 'granted' && result.boughtDuringFreeSpots) {
            await sendOpsAlert(
              `Founding Member #${result.foundingNumber} was bought while free spots were still open: ` +
              `session ${session.id}. Refund it by hand if you want; a refund ends the membership and retires the number.`,
            );
          }
          // One account holds one membership, so a raised quantity ($78 for two)
          // grants one. The rest of the money needs a human decision.
          if (granted && result.outcome !== 'replayed' && verdict.quantity > 1) {
            await sendOpsAlert(
              `Founding Member checkout paid for ${verdict.quantity} memberships (${formatUsdCents(session.amount_subtotal)} before discounts, ` +
              `${formatUsdCents(session.amount_total)} charged): session ${session.id}. ` +
              'One account can hold only one, so one membership was granted. Refund the extra by hand.',
            );
          }
        }

        // A 100%-off checkout took no money: no membership, no number. Tell a
        // human in case the owner meant to give it away (then grant it by hand).
        if (verdict.reason === 'zero_amount') {
          await sendOpsAlert(
            `Founding Member checkout with nothing charged (100% off): session ${session.id}, ` +
            `client reference ${uid ? 'present' : 'missing'}. No membership was granted and no number was used. ` +
            'If you meant to give this person Founding Member, grant it by hand.',
          );
        }

        // Money was taken but nothing was granted: keep a server-only record and
        // tell a human, since the buyer sees a successful Stripe receipt.
        if (session.payment_status === 'paid' && !granted && verdict.reason !== 'zero_amount') {
          await db.doc(`orphanedPayments/${session.id}`).set({
            checkoutSessionId: session.id,
            paymentIntentId: paymentIntentId || null,
            hasClientReference: Boolean(uid),
            amountSubtotal: session.amount_subtotal ?? null,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
            createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          await sendOpsAlert(
            `Paid Stripe checkout granted nothing: session ${session.id}, ` +
            `client reference ${uid ? 'present' : 'missing'}. Grant it by hand or refund it.`,
          );
        }

        await finalizeStripeEvent(event.id, granted ? 'processed' : 'ignored', {
          checkoutSessionId: session.id,
          hasClientReference: Boolean(uid),
          paidEnough,
          verdict: verdict.reason,
          quantity: verdict.quantity,
        });
        res.json({ received: true });
        return;
      }

      // goDoggyDate Pro lifecycle: renewals, plan switches, trials ending,
      // and cancellations all land here and keep entitlements.pro in sync so
      // access follows the real subscription state. The uid rides on
      // subscription.metadata.firebaseUid (set at checkout via subscription_data).
      if (
        event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        const rawSub = event.data.object as Stripe.Subscription;
        const uid = typeof rawSub.metadata?.firebaseUid === 'string' ? rawSub.metadata.firebaseUid : '';
        if (uid) {
          // Re-retrieve with the pinned-apiVersion client instead of trusting
          // the webhook payload: the payload is rendered at the ACCOUNT's API
          // version (which the SDK pin does not control), so its shape can drift
          // (e.g. current_period_end moving off the top level). Re-retrieving
          // also fetches CURRENT state, so a stale or reordered event can't
          // resurrect a subscription that was since canceled.
          const sub = await stripe.subscriptions.retrieve(rawSub.id);
          await writeProEntitlementFromSubscription(uid, sub);
        }
        await finalizeStripeEvent(event.id, uid ? 'processed' : 'ignored', {
          subscriptionId: rawSub.id,
          subscriptionStatus: rawSub.status,
        });
        res.json({ received: true });
        return;
      }

      await finalizeStripeEvent(event.id, 'ignored');
      res.json({ received: true, ignored: true });
    } catch (error) {
      console.error('Stripe webhook processing failed', {
        eventId: event.id,
        eventType: event.type,
        error,
      });
      // Delete the started-marker so Stripe's retry of this event is NOT
      // treated as a duplicate — otherwise a transient failure permanently
      // drops the event (e.g. a paid Founding Member never gets the grant).
      // All handlers are idempotent writes, so reprocessing is safe.
      await db.collection('stripeEvents').doc(event.id).delete().catch(() => undefined);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

// ── Trust Score Recalculation (triggered when a rating is created) ─────────────

export const onRatingCreated = functions.firestore
  .document('ratings/{ratingId}')
  .onCreate(async (snap) => {
    const rating = snap.data();
    const { dogId } = rating;
    if (!dogId) return;

    // Get all ratings for this dog
    const ratingsSnap = await db
      .collection('ratings')
      .where('dogId', '==', dogId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const ratings = ratingsSnap.docs.map((d) => d.data());
    const now = Date.now();
    const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

    let weightedSum = 0;
    let weightTotal = 0;
    let meetAgainCount = 0;

    // Defence in depth alongside the ratings rule: clamp stars here too, so a
    // malformed or legacy document can never poison the aggregate. Without
    // this, a non-numeric or out-of-range `stars` propagated straight into
    // weightedSum and produced a NaN trustScore that no later rating could
    // repair.
    let counted = 0;
    for (const r of ratings) {
      const stars = typeof r.stars === 'number' && Number.isFinite(r.stars)
        ? Math.min(5, Math.max(1, r.stars))
        : null;
      if (stars === null) continue;
      const ageMs = now - (r.createdAt?.toMillis?.() ?? now);
      const weight = Math.pow(0.5, ageMs / HALF_LIFE_MS);
      weightedSum += stars * weight;
      weightTotal += weight;
      if (r.wouldMeetAgain === true) meetAgainCount++;
      counted++;
    }

    const avgStars = weightTotal > 0 ? weightedSum / weightTotal : 0;
    const normalizedScore = avgStars / 5;
    // No usable ratings — clear the fields rather than writing zeros. Writing
    // trustScore: 0 would mark the dog with the WORST possible score, which
    // reads identically to "rated terribly" in every consumer, when the truth
    // is "not rated yet". The UI distinguishes absent from 0, so this matters.
    if (counted === 0) {
      await db.doc(`dogs/${dogId}`).update({
        trustScore: FieldValue.delete(),
        ratingCount: FieldValue.delete(),
        meetAgainRate: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    // Use `counted`, not ratings.length — a skipped malformed row must not
    // inflate the confidence bonus or dilute the meet-again rate.
    const confidenceBonus = Math.min(counted / 30, 1) * 0.1;
    const trustScore = Math.min(Math.round((normalizedScore + confidenceBonus) * 100) / 100, 1);
    const meetAgainRate = meetAgainCount / counted;

    await db.doc(`dogs/${dogId}`).update({
      trustScore,
      ratingCount: counted,
      meetAgainRate,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

// ── Account deletion (GDPR/CCPA + App Store requirement) ──────────────────────
// Deletes all of the caller's data, then the auth user itself. Client signs
// the user out after this resolves. Matches the user participates in are
// removed (including message subcollections) so the counterpart doesn't see
// a ghost thread. The data cleanup itself lives in ./accountCleanup, shared
// with scripts/admin-delete-user.cjs.
//
// Not done here, because it needs credentials this project doesn't hold yet:
// revoking the person's Sign in with Apple token (App Store guideline 5.1.1(v)).
// See "Apple token revocation" in PRODUCTION-LAUNCH-CHECKS.md.

/**
 * Cancels the person's Stripe subscriptions (goDoggyDate Pro) so deleting the
 * account stops the billing. Best effort and quiet when there is nothing to
 * cancel or Stripe isn't configured; a subscription that could not be
 * cancelled goes to the ops channel, because the person would keep paying.
 */
async function cancelStripeSubscriptionsForUser(uid: string): Promise<void> {
  const entitlements = (await db.doc(`users/${uid}/private/entitlements`).get()).data();
  const pro = (entitlements?.pro ?? {}) as { stripeSubscriptionId?: unknown; stripeCustomerId?: unknown };
  const subscriptionId = typeof pro.stripeSubscriptionId === 'string' ? pro.stripeSubscriptionId : '';
  const customerId = typeof pro.stripeCustomerId === 'string' ? pro.stripeCustomerId : '';
  if (!subscriptionId && !customerId) return;

  const key = stripeSecretKey.value();
  if (!key) return; // Stripe isn't configured on this deployment

  // Short timeout, no retries: this must never hold up a deletion.
  const stripe = new Stripe(key, { apiVersion: '2024-04-10', timeout: 15_000, maxNetworkRetries: 0 });
  const failed: string[] = [];
  try {
    const ids = new Set<string>();
    if (subscriptionId) ids.add(subscriptionId);
    if (customerId) {
      const listed = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
      for (const sub of listed.data) {
        if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') ids.add(sub.id);
      }
    }
    for (const id of ids) {
      try {
        await stripe.subscriptions.cancel(id);
      } catch (error) {
        // Already gone or already cancelled: nothing left to stop.
        const code = (error as { code?: string } | null)?.code;
        if (code !== 'resource_missing') failed.push(id);
        console.error('deleteAccount: could not cancel Stripe subscription', { uid, id, error });
      }
    }
  } catch (error) {
    console.error('deleteAccount: could not look up Stripe subscriptions', { uid, customerId, error });
    if (subscriptionId) failed.push(subscriptionId);
    else failed.push(`customer ${customerId}`);
  }
  if (failed.length > 0) {
    await sendOpsAlert(
      `A deleted account still has a Stripe subscription: user ${uid}, ${failed.join(', ')}. ` +
      'Cancel it in the Stripe dashboard so they are not billed.',
    );
  }
}

export const deleteAccount = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB', secrets: [stripeSecretKey, opsAlertWebhookUrl] })
  .https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in to delete your account.');
    }

    // First, so no device can mint a fresh ID token while the data goes. A token
    // already issued stays valid for up to an hour (Firebase can't recall it),
    // which is why onDogProfileFounding also removes a dog doc written for a
    // user that no longer exists.
    try {
      await admin.auth().revokeRefreshTokens(uid);
    } catch (error) {
      console.error('deleteAccount: could not revoke refresh tokens', { uid, error });
    }

    // Stop the billing before the entitlement record that names the
    // subscription is deleted.
    try {
      await cancelStripeSubscriptionsForUser(uid);
    } catch (error) {
      console.error('deleteAccount: Stripe cleanup failed', { uid, error });
    }

    await deleteUserData(
      {
        db,
        bucket: admin.storage().bucket(),
        cleanupPackDays: (id) => packDay.cleanupPackDaysForUser(id),
      },
      uid,
    );

    // payments/matchUnlocks/stripeEvents are retained: financial records
    // needed for refund/dispute defense (legitimate-interest retention).

    await admin.auth().deleteUser(uid);

    return { deleted: true };
  });

// ── Push notifications ─────────────────────────────────────────────────────────
// Tokens live at users/{uid}/private/push (owner-writable):
//   { expoPushTokens: string[], fcmWebTokens: string[] }
// Mobile registers an Expo push token; web registers an FCM token. Invalid
// tokens are pruned on send so the lists self-heal.

interface PushTokensDoc {
  expoPushTokens?: string[];
  fcmWebTokens?: string[];
}

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  const tokenRef = db.doc(`users/${uid}/private/push`);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) return;

  const tokens = tokenSnap.data() as PushTokensDoc;
  const expoTokens = (tokens.expoPushTokens ?? []).filter(Boolean);
  const webTokens = (tokens.fcmWebTokens ?? []).filter(Boolean);
  const staleExpo: string[] = [];
  const staleWeb: string[] = [];

  if (expoTokens.length > 0) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expoTokens.map((to) => ({
          to,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          sound: 'default',
        }))),
      });
      const result = await res.json() as { data?: Array<{ status: string; details?: { error?: string } }> };
      result.data?.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          staleExpo.push(expoTokens[i]);
        }
      });
    } catch (error) {
      console.warn('Expo push send failed', { uid, error });
    }
  }

  if (webTokens.length > 0) {
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: webTokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        webpush: {
          fcmOptions: { link: payload.data.link ?? 'https://godoggydate.com/app/messages' },
        },
      });
      response.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          staleWeb.push(webTokens[i]);
        }
      });
    } catch (error) {
      console.warn('FCM web push send failed', { uid, error });
    }
  }

  if (staleExpo.length > 0 || staleWeb.length > 0) {
    await tokenRef.set({
      ...(staleExpo.length > 0
        ? { expoPushTokens: FieldValue.arrayRemove(...staleExpo) }
        : {}),
      ...(staleWeb.length > 0
        ? { fcmWebTokens: FieldValue.arrayRemove(...staleWeb) }
        : {}),
    }, { merge: true });
  }
}

async function getDogName(dogId: string | undefined): Promise<string> {
  if (!dogId) return 'A new friend';
  try {
    const snap = await db.doc(`dogs/${dogId}`).get();
    const name = snap.exists ? (snap.data()?.name as string | undefined)?.trim() : undefined;
    return name || 'A new friend';
  } catch {
    return 'A new friend';
  }
}

// ── Neighborhood density → real chat pricing ────────────────────────────────
// CHAT_FREE_LAUNCH_MODE (shared/matchAccess.ts) is a manual global kill
// switch, currently on: every match is free regardless of the density logic
// below. This trigger keeps a live dog-count per ZIP and stamps each new
// match with whether BOTH participants sit in a saturated neighborhood, so
// that flipping CHAT_FREE_LAUNCH_MODE off later turns on real per-match
// paywalls immediately, with no backfill needed for matches created while
// this ran silently underneath the global free mode.
//
// Requiring BOTH sides dense (not either) is deliberate: it's the
// conservative direction for a mistake — a false "free" costs a few cents of
// forgone revenue; a false "must pay" reads as a bait-and-switch to a user
// who just matched. ZIP never leaves this file: it's read from the PRIVATE
// profile doc via the Admin SDK (which bypasses firestore.rules) and only a
// boolean, never the ZIP itself, gets written back to the match doc that
// both participants can read.
const ZIP_DENSITY_THRESHOLD = 20;

function normalizeZip(zip: string | undefined | null): string | null {
  const trimmed = (zip ?? '').trim();
  const match = /^(\d{5})(-\d{4})?$/.exec(trimmed);
  return match ? match[1] : null;
}

async function adjustZipDensity(zip: string, delta: 1 | -1): Promise<void> {
  const zipRef = db.doc(`zipDensity/${zip}`);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(zipRef);
    const current = (snap.data()?.count as number | undefined) ?? 0;
    const next = Math.max(0, current + delta);
    transaction.set(zipRef, { count: next }, { merge: true });
  });
}

export const onPrivateDogProfileWrite = functions.firestore
  .document('users/{uid}/private/dogProfile')
  .onWrite(async (change) => {
    const beforeZip = normalizeZip(change.before.exists ? change.before.data()?.zip as string | undefined : undefined);
    const afterZip = normalizeZip(change.after.exists ? change.after.data()?.zip as string | undefined : undefined);
    if (beforeZip === afterZip) return; // no zip change — nothing to reconcile

    if (beforeZip) await adjustZipDensity(beforeZip, -1);
    if (afterZip) await adjustZipDensity(afterZip, 1);
  });

async function isDenseZip(uid: string): Promise<boolean> {
  try {
    const privateSnap = await db.doc(`users/${uid}/private/dogProfile`).get();
    const zip = normalizeZip(privateSnap.data()?.zip as string | undefined);
    if (!zip) return false; // no ZIP on file — can't confirm density, so don't gate
    const densitySnap = await db.doc(`zipDensity/${zip}`).get();
    return ((densitySnap.data()?.count as number | undefined) ?? 0) >= ZIP_DENSITY_THRESHOLD;
  } catch (error) {
    console.error('isDenseZip: lookup failed, defaulting to not-dense', { uid, error });
    return false;
  }
}

export const onMatchCreatedNotify = functions.firestore
  .document('matches/{matchId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() as MatchData;
    const { matchId } = context.params as { matchId: string };
    const participants = [data.dog1UserId, data.dog2UserId].filter(Boolean) as string[];
    if (participants.length !== 2) return;

    // firestore.rules denies a match across a block; this covers one that was
    // created just before the block landed.
    const blocked = await isBlockedEitherWay(participants[0], participants[1]);

    await Promise.all((blocked ? [] : participants).map(async (uid) => {
      const otherUid = participants.find((p) => p !== uid);
      const otherName = await getDogName(otherUid);
      await sendPushToUser(uid, {
        title: "It's a match! 🐾",
        body: `${otherName} wants to play too. Open it to see their Dogtype.`,
        data: {
          type: 'match',
          matchId,
          link: `https://godoggydate.com/app/messages/${matchId}`,
        },
      });
    }));

    // Stamp density at creation time, once, rather than recomputing on every
    // rules evaluation — see the "Neighborhood density" section above.
    try {
      const [dense1, dense2] = await Promise.all(participants.map(isDenseZip));
      await snap.ref.update({ chatFreeZone: !(dense1 && dense2) });
    } catch (error) {
      console.error('onMatchCreatedNotify: density stamp failed, leaving match unstamped (fails open to free)', { matchId, error });
    }
  });

// ── Content filter: chat messages and dog profiles ─────────────────────────────
// Apple guideline 1.2. Both apps run shared/contentFilter.ts before sending,
// but a modified client can skip that, so the server checks every write again
// (with the mirrored copy in ./contentFilter). What was refused is kept in
// moderationLog/, which has no client rule, so it is Admin-only, like
// safetyEvidence. Alerts carry ids only, never the text.

/**
 * Replaces a refused chat message in place. Does nothing if another run of
 * this trigger (a duplicate delivery) already did it, so the alert goes out
 * once. The playdate card is dropped too: the apps draw it from `playdate`,
 * not `text`, and a proposal with a refused place shouldn't stay acceptable.
 * Admin writes bypass the "messages are never updated" rule.
 */
async function moderateMessage(
  snap: functions.firestore.QueryDocumentSnapshot,
  matchId: string,
  messageId: string,
  reason: string,
): Promise<void> {
  const message = snap.data();
  const logRef = db.doc(`moderationLog/message_${matchId}_${messageId}`);
  const moderated = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(snap.ref);
    if (!fresh.exists || fresh.data()?.moderated === true) return false;
    tx.update(snap.ref, {
      text: MODERATED_MESSAGE_TEXT,
      moderated: true,
      moderationReason: reason,
      moderatedAt: FieldValue.serverTimestamp(),
      type: FieldValue.delete(),
      playdate: FieldValue.delete(),
    });
    tx.set(logRef, {
      kind: 'message',
      uid: message.fromUserId ?? message.senderId ?? null,
      matchId,
      messageId,
      reason,
      original: {
        text: message.text ?? null,
        type: message.type ?? null,
        playdate: message.playdate ?? null,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!moderated) return;

  await sendOpsAlert(
    `GoDoggyDate content filter removed a chat message (${reason}): ` +
    `sender ${message.fromUserId ?? message.senderId ?? 'unknown'}, match ${matchId}, message ${messageId}. ` +
    `Original in ${logRef.path}. Check whether the sender needs action.`,
  );
}

// The same trigger runs the filter and sends the push, so a refused message
// is replaced before anyone is notified and never pushed at all. Replacing it
// is an update, which doesn't fire onCreate again, so there's no second push
// and no loop.
export const onMessageCreatedNotify = functions
  .runWith({ secrets: [opsAlertWebhookUrl] })
  .firestore.document('matches/{matchId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data() as { fromUserId?: string; text?: string; type?: string; playdate?: unknown };
    const { matchId, messageId } = context.params as { matchId: string; messageId: string };

    const verdict = checkMessageContent(message);
    if (!verdict.ok) {
      await moderateMessage(snap, matchId, messageId, verdict.reason);
      return;
    }

    if (!message.fromUserId) return;

    const matchSnap = await db.doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) return;
    const matchData = matchSnap.data() as MatchData;

    const recipient = [matchData.dog1UserId, matchData.dog2UserId]
      .find((uid) => uid && uid !== message.fromUserId);
    if (!recipient) return;
    if (await isBlockedEitherWay(message.fromUserId, recipient)) return;

    const senderName = await getDogName(message.fromUserId);
    const isPlaydate = message.type === 'playdate_proposal' || message.type === 'playdate_confirmed';
    await sendPushToUser(recipient, {
      title: isPlaydate ? `${senderName} 📅` : senderName,
      // Never leak message contents into a lock screen beyond a short preview.
      body: (message.text ?? 'New message').slice(0, 120),
      data: {
        type: 'message',
        matchId,
        link: `https://godoggydate.com/app/messages/${matchId}`,
      },
    });
  });

// Clears only the owner-typed fields that fail (see dogProfileContentFixes for
// which fields), never the AI `ai` fields. Loop-safe: only fields that changed
// in this write are checked, and the cleared values pass, so the trigger fired
// by our own update finds nothing to do. Server-only writes (trust score,
// founding number, Vibe Check) change no text field and return before any read.
//
// The owner is told through users/{uid}/private/moderationNotice
// ({ fields, reason, at }; see moderationNoticeFor), which both apps show and
// delete on dismiss. It's owner-only: the dog doc is readable by every
// signed-in user, so the notice can't go there.
//
// The same trigger also drops photo URLs that aren't this project's own Storage
// files (dogPhotoFixes). photos[] is rendered on the public /d/ page and in the
// server-made share image, so a URL on somebody else's host would make every
// visitor's browser (and our server) fetch it. This is checked on every write,
// not only when photos changed: it is a few string comparisons, and it cleans a
// legacy document the first time anything touches it. Dropped URLs are kept in
// moderationLog (kind dog_photo_url); the owner is not sent a notice, because
// the notice's reasons are only slur, sexual and threat.
export const onDogProfileWriteModerate = functions
  .runWith({ secrets: [opsAlertWebhookUrl] })
  .firestore.document('dogs/{uid}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const { uid } = context.params as { uid: string };
    const before = change.before.exists ? change.before.data() : undefined;
    const policy = photoUrlPolicy();
    const afterData = change.after.data() ?? {};
    if (
      dogProfileContentFixes(before, afterData).problems.length === 0 &&
      dogPhotoFixes(afterData, policy) === null
    ) {
      return;
    }

    // Re-check against the current doc inside a transaction, so an owner who
    // has already re-saved clean text (or edited a list since) keeps it.
    const ref = change.after.ref;
    const noticeRef = db.doc(`users/${uid}/private/moderationNotice`);
    const applied = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return null;
      const freshData = fresh.data() ?? {};
      const fixes = dogProfileContentFixes(before, freshData);
      const photoFix = dogPhotoFixes(freshData, policy);
      if (fixes.problems.length === 0 && photoFix === null) return null;
      // A notice the owner hasn't dismissed yet is merged, not replaced. (All
      // reads come before the first write.)
      const pending = fixes.problems.length > 0 ? await tx.get(noticeRef) : null;
      tx.update(ref, { ...fixes.updates, ...(photoFix ? { photos: photoFix.photos } : {}) });
      let contentLogPath: string | null = null;
      if (fixes.problems.length > 0) {
        const logRef = db.collection('moderationLog').doc();
        contentLogPath = logRef.path;
        tx.set(logRef, {
          kind: 'dog_profile',
          uid,
          problems: fixes.problems,
          original: fixes.original,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(noticeRef, {
          ...moderationNoticeFor(fixes.problems, pending?.exists ? pending.data() : undefined),
          at: FieldValue.serverTimestamp(),
        });
      }
      let photoLogPath: string | null = null;
      if (photoFix) {
        const logRef = db.collection('moderationLog').doc();
        photoLogPath = logRef.path;
        tx.set(logRef, {
          kind: 'dog_photo_url',
          uid,
          dropped: photoFix.dropped,
          keptCount: photoFix.photos.length,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return { fixes, photoFix, contentLogPath, photoLogPath };
    });
    if (!applied) return;

    if (applied.contentLogPath) {
      const summary = applied.fixes.problems.map((p) => `${p.field} (${p.reason})`).join(', ');
      await sendOpsAlert(
        `GoDoggyDate content filter cleared dog profile text: dog ${uid}, ${summary}. ` +
        `Original in ${applied.contentLogPath}. The owner was told (${noticeRef.path}). Check whether they need further action.`,
      );
    }
    if (applied.photoFix && applied.photoLogPath) {
      // At most a few a day per dog: a profile that keeps writing foreign URLs
      // is one account, and the log has every one of them.
      await sendThrottledOpsAlert(
        `dogphoto_${throttleKey(uid)}`,
        3,
        `GoDoggyDate removed ${applied.photoFix.dropped.length} photo URL(s) that are not this project's Storage files: dog ${uid}. ` +
        `The URLs are in ${applied.photoLogPath}. Check whether the account is trying to point visitors at another site.`,
        `GoDoggyDate keeps removing foreign photo URLs from dog ${uid}'s profile; further alerts for it are held back this hour. ` +
        'Every removal is in moderationLog (kind "dog_photo_url").',
      );
    }
  });

// ── Safety: reports and blocks ─────────────────────────────────────────────────

const REPORT_EVIDENCE_MESSAGES = 50;

// Report alerts are throttled (see "Alert throttling" above): a reporter can
// page ops this many times an hour, and reporting the same person again within
// the hour is a duplicate. Every report is still stored in reports/ and written
// to moderationLog/report_<id>, whatever happens to its alert.
const REPORT_ALERTS_PER_REPORTER_PER_HOUR = 5;

// The parts of a Pack Day a moderator needs to judge a report about it. The
// event doc is deleted when its host deletes their account, so this is copied
// at report time, the same as a chat thread.
function packDayEvidence(event: FirebaseFirestore.DocumentData): Record<string, unknown> {
  const startsAtMs = typeof event.startsAtMs === 'number' ? event.startsAtMs : null;
  return {
    title: event.title ?? null,
    note: event.note ?? null,
    placeName: event.placeName ?? null,
    city: event.city ?? null,
    state: event.state ?? null,
    hostUid: event.hostUid ?? null,
    hostDogName: event.hostDogName ?? null,
    startsAtMs,
    startsAt: startsAtMs !== null ? new Date(startsAtMs).toISOString() : null,
    localDate: event.localDate ?? null,
    localTime: event.localTime ?? null,
    status: event.status ?? null,
  };
}

// Snapshot the thread (for a chat or match report) or the event (for a Pack
// Day report) at report time: deleteAccount removes shared threads and hosted
// events, so without this a reported user could erase the evidence by deleting
// their account. safetyEvidence has no client rule, so it is Admin-only. The
// alert carries ids only — message and event text stay in Firestore, not in a
// chat tool.
export const onReportCreated = functions
  .runWith({ secrets: [opsAlertWebhookUrl] })
  .firestore.document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const { reportId } = context.params as { reportId: string };
    const report = snap.data() as {
      reporterId?: string;
      targetUserId?: string;
      matchId?: string;
      eventId?: string;
      messageId?: string;
      reason?: string;
      source?: string;
    };
    // Both ids are client-written and go into document paths.
    const matchId = isSafeDocId(report.matchId) ? report.matchId : null;
    const eventId = isSafeDocId(report.eventId) ? report.eventId : null;

    // Decide the alert first. The same reporter reporting the same person
    // again within the hour is a duplicate and gets no alert of its own. The
    // evidence snapshot below is still taken for every report: it is capped at
    // REPORT_EVIDENCE_MESSAGES reads, and a later snapshot of an ongoing thread
    // is exactly what a moderator may need.
    const reporterKey = throttleKey('reporter', String(report.reporterId ?? ''));
    const pairClaim = await claimThrottleSlot(
      `reportpair_${throttleKey('pair', String(report.reporterId ?? ''), String(report.targetUserId ?? ''))}`,
      1,
    );
    const reporterClaim = pairClaim.allowed
      ? await claimThrottleSlot(`reporter_${reporterKey}`, REPORT_ALERTS_PER_REPORTER_PER_HOUR)
      : null;
    const alertDecision: 'alert' | 'summary' | 'suppressed_duplicate' | 'suppressed_cap' =
      !pairClaim.allowed ? 'suppressed_duplicate'
        : reporterClaim?.allowed ? 'alert'
          : reporterClaim?.firstOverflow ? 'summary'
            : 'suppressed_cap';

    // Persist the report in moderationLog whatever happens to its alert, so
    // "50 reports, 5 alerts" can always be reconciled.
    const shorten = (value: unknown) => (typeof value === 'string' ? value.slice(0, 200) : null);
    try {
      await db.doc(`moderationLog/report_${reportId}`).set({
        kind: 'report',
        reportId,
        uid: shorten(report.targetUserId),
        reporterId: shorten(report.reporterId),
        targetUserId: shorten(report.targetUserId),
        matchId,
        eventId,
        reason: shorten(report.reason),
        source: shorten(report.source),
        alert: alertDecision,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('onReportCreated: moderationLog write failed', { reportId, error });
    }

    const evidence: Record<string, unknown> = {};
    if (matchId) {
      try {
        const messages = await db
          .collection(`matches/${matchId}/messages`)
          .orderBy('createdAt', 'desc')
          .limit(REPORT_EVIDENCE_MESSAGES)
          .get();
        evidence.messages = messages.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.error('onReportCreated: thread snapshot failed', { reportId, error });
      }
    }
    let eventFound = false;
    let eventCancelled = false;
    if (eventId) {
      try {
        const eventSnap = await db.doc(`packDays/${eventId}`).get();
        eventFound = eventSnap.exists;
        eventCancelled = eventSnap.data()?.status === 'cancelled';
        evidence.packDay = eventSnap.exists ? packDayEvidence(eventSnap.data() ?? {}) : null;
        // A single chat message being reported (Pack Day group chat).
        if (isSafeDocId((report as { messageId?: unknown }).messageId)) {
          const msgSnap = await db.doc(`packDays/${eventId}/messages/${(report as { messageId: string }).messageId}`).get();
          evidence.packDayMessage = msgSnap.exists ? { id: msgSnap.id, ...msgSnap.data() } : null;
        }
      } catch (error) {
        console.error('onReportCreated: Pack Day snapshot failed', { reportId, eventId, error });
      }
    }

    let evidenceSaved = false;
    if (Object.keys(evidence).length > 0) {
      try {
        await db.doc(`safetyEvidence/${reportId}`).set({
          ...report,
          ...evidence,
          capturedAt: FieldValue.serverTimestamp(),
        });
        evidenceSaved = true;
      } catch (error) {
        console.error('onReportCreated: evidence write failed', { reportId, error });
      }
    }

    const where = eventId
      ? `Pack Day ${eventId}${eventFound ? (eventCancelled ? ' (already cancelled)' : '') : ' (event not found)'}`
      : `match ${matchId ?? 'none'}`;
    // Only for an event that exists, so the id is a server-made packDays id
    // and safe to paste into a shell. The script does a dry run unless
    // --confirm is added. See PRODUCTION-LAUNCH-CHECKS.md.
    const takeDown = eventId && eventFound && !eventCancelled
      ? ` To take the event down: node scripts/admin-remove-packday.cjs ${eventId} ` +
        '--reason "Broke the Pack Day rules" (dry run; add --confirm to apply).'
      : '';
    if (alertDecision === 'alert') {
      await sendOpsAlert(
        `GoDoggyDate report (${report.reason ?? 'no reason'}, source ${report.source ?? 'not given'}): ` +
        `reporter ${report.reporterId}, target ${report.targetUserId}, ` +
        `${where}, report ${reportId}, ` +
        `evidence ${evidenceSaved ? 'saved' : 'NOT saved'}. Please review.${takeDown}`,
      );
    } else if (alertDecision === 'summary') {
      // The one summary per reporter per hour. The reports themselves are all
      // saved, so nothing is lost, but a human should look at who is filing them.
      await sendOpsAlert(
        `GoDoggyDate report burst: reporter ${report.reporterId} has filed more than ` +
        `${REPORT_ALERTS_PER_REPORTER_PER_HOUR} reports this hour (latest report ${reportId}, target ${report.targetUserId}). ` +
        'Further report alerts from this reporter are held back until the next hour. Every report is saved in ' +
        'reports/ and in moderationLog/ (kind "report", look for reporterId). Check whether they are spamming or in real trouble.',
      );
    } else {
      console.warn(
        alertDecision === 'suppressed_duplicate'
          ? '[ops-alert suppressed] duplicate report within the hour'
          : '[ops-alert suppressed] report over the hourly alert limit',
        { reportId },
      );
    }
  });

// Reverse index so the blocked person's own feed can hide the blocker: they
// can't read the blocker's list, and shouldn't. Enforcement itself lives in
// firestore.rules and doesn't depend on this trigger.
export const onBlockWrite = functions.firestore
  .document('blocks/{uid}/blocked/{targetId}')
  .onWrite(async (change, context) => {
    const { uid, targetId } = context.params as { uid: string; targetId: string };
    const reverseRef = db.doc(`blocks/${targetId}/blockedBy/${uid}`);
    if (change.after.exists) {
      await reverseRef.set({ createdAt: FieldValue.serverTimestamp() });
    } else {
      await reverseRef.delete();
    }
  });

// ── Cleanup: delete matches older than 180 days with no chat activity ──────────
// Widened from 30 days: a short window was silently destroying paywalled
// revenue opportunities (a user returning after 30 days found the match gone).

export const cleanupStaleMatches = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const snap = await db
      .collection('matches')
      .where('chatUnlocked', '==', false)
      .where('createdAt', '<', cutoff)
      .get();

    // Never delete a conversation with activity: Founding Members chat via
    // entitlement without ever flipping chatUnlocked, so lastMessage is the
    // real signal. recursiveDelete also clears the messages subcollection
    // (a plain batch delete would orphan it).
    let deleted = 0;
    for (const d of snap.docs) {
      if (d.data().lastMessage != null) continue;
      await db.recursiveDelete(d.ref);
      deleted += 1;
    }
    console.log(`Deleted ${deleted} stale matches (${snap.size - deleted} skipped for activity)`);
  });

// ── Cadence: reminder notifications ─────────────────────────────────────────
// This backend's first scheduled job that CREATES a notification instead of
// deleting something — see the strategy research from 2026-07-25: a
// reminder calendar is the one feature identified as genuinely recurring,
// as opposed to the one-shot document generators proposed alongside it.
//
// Fires once per due date, not once per day it's overdue — a reminder that
// nags every day it's overdue is exactly the "notification guilt" pattern
// the Gen Z research explicitly flagged as a retention killer. notifiedAt
// records which due-date value already fired; it's cleared whenever
// completeReminder() advances a recurring reminder, so the next occurrence
// notifies again on its own schedule.
//
// dogId doubles as the owning user's uid today (see dogs/{uid} elsewhere in
// this file) — sendPushToUser expects a uid, and this collection lives
// under that same dog/user id.
export const sendReminderNotifications = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now = Date.now();
    const windowEnd = Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);

    const snap = await db.collectionGroup('reminders')
      .where('dueDate', '<=', windowEnd)
      .get();

    let sent = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as {
        dueDate?: FirebaseFirestore.Timestamp;
        notifiedAt?: FirebaseFirestore.Timestamp;
        recurrenceDays?: number;
        label?: string;
        type?: string;
      };
      const dogId = doc.ref.parent.parent?.id;
      if (!dogId || !data.dueDate) continue;

      const dueMs = data.dueDate.toMillis();
      const alreadyNotified = data.notifiedAt
        && Math.abs(data.notifiedAt.toMillis() - dueMs) < 60_000;

      if (alreadyNotified) {
        // A recurring reminder only advanced when the user pressed "Done", so
        // ignoring one notification silenced it FOREVER — a monthly heartworm
        // reminder fired once, ever, and then sat overdue in perpetuity. The
        // schedule is the schedule; pressing Done is acknowledgement, not a
        // precondition for the next cycle. Once an occurrence is a full day
        // past due, roll forward to the next one so the cadence survives an
        // ignored notification without ever nagging daily.
        const recurrence = typeof data.recurrenceDays === 'number' && data.recurrenceDays > 0
          ? data.recurrenceDays
          : null;
        if (recurrence && dueMs < now - 24 * 60 * 60 * 1000) {
          const intervalMs = recurrence * 24 * 60 * 60 * 1000;
          let nextDue = dueMs + intervalMs;
          while (nextDue <= now) nextDue += intervalMs;
          // Reaching here means this occurrence was notified and then never
          // completed — completeReminder() clears notifiedAt when it advances
          // a reminder, so a completed one can't take this branch. The user
          // let the occurrence lapse, and currentStreak counts CONSECUTIVE
          // on-time completions (the single definition lives in
          // web/lib/reminders.ts), so a lapse breaks it. Without this reset
          // the stale count survived the miss and both clients went on
          // showing a streak that hadn't been earned.
          await doc.ref.update({
            dueDate: Timestamp.fromMillis(nextDue),
            notifiedAt: FieldValue.delete(),
            currentStreak: 0,
          });
        }
        continue;
      }

      // Daily medicine rings on the phone itself at the dose time
      // (mobile/lib/medAlarms.ts). A push at whatever hour this job runs would
      // be a second, mistimed ping, so only mark it notified: that keeps the
      // roll-forward above working for a missed dose.
      if (data.type === 'medication') {
        await doc.ref.update({ notifiedAt: data.dueDate });
        continue;
      }

      const dogName = await getDogName(dogId);
      const overdue = dueMs < now;
      await sendPushToUser(dogId, {
        title: overdue ? `${dogName} has something overdue` : `${dogName} has something due`,
        body: data.label ?? 'Check your reminders',
        data: { type: 'reminder', dogId, link: 'https://godoggydate.com/app/profile' },
      });
      await doc.ref.update({ notifiedAt: data.dueDate });
      sent += 1;
    }
    console.log(`Sent ${sent} reminder notifications`);
  });

// ── Milestones: birthday / Gotcha Day / anniversary celebrations ────────────
// The retention loop: a warm, earned reason to come back on a real date the
// owner told us about. Fires ONCE per occasion via a server-only dedup marker
// (dogs/{uid}/celebrations/{kind}_{year}) so a birthday MONTH never nags daily.
// Only REAL stored dates trigger it — birthMonth, adoptionDate, and the profile
// createdAt anniversary — mirroring shared/milestones.ts. There is deliberately
// no monthaversary: manufacturing a monthly occasion is the fabricated cadence
// the product forbids.
//
// Full dogs scan is fine at launch scale (same assumption as the discover feed);
// paginate if the collection grows large.

interface CelebrationHit {
  kind: 'birthday' | 'gotcha' | 'godoggy_anniversary';
  year: number;
  title: string;
  body: string;
}

function toMillisMaybe(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof (value as FirebaseFirestore.Timestamp).toMillis === 'function') {
    return (value as FirebaseFirestore.Timestamp).toMillis();
  }
  return null;
}

function activeCelebrations(dog: FirebaseFirestore.DocumentData, now: Date): CelebrationHit[] {
  const name = typeof dog.name === 'string' && dog.name.trim() ? dog.name.trim() : 'Your dog';
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  const hits: CelebrationHit[] = [];

  // Birthday. When the owner gave an exact birthDay this fires on the DAY;
  // otherwise it falls back to the whole birth month. This mirrors
  // shared/milestones.ts, which already upgrades to an exact-day celebration
  // when birthDay is set — without this branch the push said "birthday month"
  // all month while the profile card said "today", and now that a single
  // MM/DD/YYYY box makes exact days easy to enter, that mismatch would be the
  // common case rather than a rarity.
  if (typeof dog.birthMonth === 'number' && dog.birthMonth >= 1 && dog.birthMonth <= 12) {
    const turning = typeof dog.birthYear === 'number' ? year - dog.birthYear : null;
    // Requires birthYear too, matching shared/milestones.ts's exact-day branch
    // (`validDay(birthDay) && typeof birthYear === 'number'`) — otherwise the
    // push and the in-app card would disagree about which mode a legacy doc is in.
    const hasExactDay =
      typeof dog.birthDay === 'number' && dog.birthDay >= 1 && dog.birthDay <= 31 &&
      typeof dog.birthYear === 'number';

    if (hasExactDay) {
      // Same Feb-29 rollover the Gotcha Day branch below uses, so a leap-day
      // birthday still fires and fires on the day the card shows.
      const occ = new Date(year, dog.birthMonth - 1, dog.birthDay);
      if (occ.getMonth() === month && occ.getDate() === day) {
        hits.push({
          kind: 'birthday',
          year,
          title: `🎂 It's ${name}'s birthday!`,
          body: turning != null && turning >= 1
            ? `${name} turns ${turning} today. Make it a good one.`
            : `Give ${name} some extra treats today.`,
        });
      }
    } else if (month === dog.birthMonth - 1) {
      hits.push({
        kind: 'birthday',
        year,
        title: `🎂 It's ${name}'s birthday month!`,
        body: turning != null && turning >= 1
          ? `${name} turns ${turning} this month. Make it a good one.`
          : `Give ${name} some extra treats this month.`,
      });
    }
  }

  // Gotcha Day — exact month/day, with the same Feb-29 rollover the profile
  // card uses (new Date rolls Feb 29 to Mar 1 in a non-leap year), so a
  // leap-day Gotcha Day still fires — and fires on the same day the card shows.
  if (typeof dog.adoptionDate === 'string') {
    const text = dog.adoptionDate.trim();
    const exact = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    // adoptionDate is deliberately polymorphic — 'YYYY-MM' is the documented
    // month-only form the profile form actively teaches ("Month and year is
    // enough"). This branch used to demand full ISO, so every month-only
    // Gotcha Day silently never fired a push while the profile card happily
    // celebrated it. Month-only fires on the 1st, matching shared/milestones.ts.
    const monthOnly = exact ? null : /^(\d{4})-(\d{2})$/.exec(text);

    if (exact) {
      const ay = Number(exact[1]); const am = Number(exact[2]); const ad = Number(exact[3]);
      const occ = new Date(year, am - 1, ad);
      if (am >= 1 && am <= 12 && occ.getMonth() === month && occ.getDate() === day) {
        const years = year - ay;
        if (years >= 1) {
          hits.push({
            kind: 'gotcha', year,
            title: `🏡 ${name}'s Gotcha Day`,
            body: `${years} year${years === 1 ? '' : 's'} since ${name} came home.`,
          });
        }
      }
    } else if (monthOnly) {
      const ay = Number(monthOnly[1]); const am = Number(monthOnly[2]);
      if (am >= 1 && am <= 12 && month === am - 1 && day === 1) {
        const years = year - ay;
        if (years >= 1) {
          hits.push({
            kind: 'gotcha', year,
            title: `🏡 ${name}'s Gotcha Day month`,
            body: `${years} year${years === 1 ? '' : 's'} since ${name} came home.`,
          });
        }
      }
    }
  }

  // GoDoggyDate anniversary — exact month/day of profile creation.
  const createdMs = toMillisMaybe(dog.createdAt);
  if (createdMs) {
    const c = new Date(createdMs);
    const occ = new Date(year, c.getMonth(), c.getDate());
    if (occ.getMonth() === month && occ.getDate() === day) {
      const years = year - c.getFullYear();
      if (years >= 1) {
        hits.push({
          kind: 'godoggy_anniversary', year,
          title: `🐾 ${name}'s GoDoggyDate anniversary`,
          body: `${years} year${years === 1 ? '' : 's'} on GoDoggyDate. Here's to more walks.`,
        });
      }
    }
  }

  return hits;
}

// Runs mid-morning US Pacific rather than "every 24 hours". Two reasons, both
// load-bearing now that a birthday can fire on an EXACT day:
//  1. activeCelebrations derives today's month/day from `new Date()`, and the
//     Functions runtime clock is UTC. At 9am Pacific it is 16:00/17:00 UTC on
//     the SAME calendar date, so the UTC date the function reads matches the
//     owner's calendar date across the whole continental US. On the old
//     unpinned schedule a run near UTC midnight would judge "today" as the next
//     day for western owners — and because the dedup marker is once-per-year,
//     that off-by-one would be permanent, not merely late.
//  2. A celebration push lands at a humane hour instead of overnight.
// The timeout is raised for the same reason as onRatingCreated: this walks the
// whole dogs collection sequentially, and the month-only Gotcha Day branch
// concentrates those hits on the 1st of each month.
export const sendCelebrationNotifications = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('0 9 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const now = new Date();
    const snap = await db.collection('dogs').get();

    let sent = 0;
    for (const doc of snap.docs) {
      const dogId = doc.id;
      const hits = activeCelebrations(doc.data(), now);
      for (const hit of hits) {
        // One marker per occasion per year — create() fails if it already
        // exists, which is exactly the once-only dedup (same trick as
        // markStripeEventStarted). Nothing else reads these; server-only.
        const markerRef = db.doc(`dogs/${dogId}/celebrations/${hit.kind}_${hit.year}`);
        try {
          await markerRef.create({ sentAt: FieldValue.serverTimestamp() });
        } catch {
          continue; // already celebrated this occasion this year
        }
        try {
          await sendPushToUser(dogId, {
            title: hit.title,
            body: hit.body,
            data: { type: 'celebration', kind: hit.kind, dogId, link: 'https://godoggydate.com/app/profile' },
          });
        } catch (err) {
          // The marker is claimed BEFORE sending (that ordering is what makes
          // the dedup safe against concurrent runs), so a failed send would
          // otherwise burn this occasion's only chance for the whole year.
          // Release it so the next run can retry.
          console.error(`Celebration push failed for ${dogId} (${hit.kind}); releasing marker`, err);
          await markerRef.delete().catch(() => {});
          continue;
        }
        sent += 1;
      }
    }
    console.log(`Sent ${sent} celebration notifications`);
  });

// ── Founding ladder: free spots #1–50 ───────────────────────────────────────
// The first FOUNDING_FREE_CAP dogs with a FINISHED profile become Founding
// Members for free: a permanent number on the dog doc (the public "⭐ Founding
// Member #N" badge) plus the same lifetime entitlement a $39 buyer gets, marked
// foundingFree so the refund logic never touches it. After #50 this hands out
// nothing; numbers #51–150 come only from the Stripe webhook.
//
// "Finished" is foundingProfileGaps (./founding, mirrored from shared/founding.ts):
// name, breed, age, sex, size, energy, a personality chip, a public location and
// at least three REAL photos, meaning this project's own Storage files in the
// owner's upload folder, never the '_placeholder_' padding. The first version
// numbered any dogs/{uid} document the moment it was created, so a hollow
// { name: 'x' } doc from a throwaway account took a free spot. Together with
// the firestore.rules requirement that dogs/{uid} can only be created by a
// Google or Apple account (not an anonymous guest), that closes the drain.
//
// It runs on every write to dogs/{uid} (onWrite, not onCreate) and awards on the
// first write that leaves the profile finished. Idempotent: a dog that already
// has a number returns before anything is read, and the award re-checks inside
// the transaction. Counter, badge and entitlement are written in ONE
// transaction, so concurrent signups never collide, a retry never double-counts
// and the numbers stay gapless (the counter only moves with an award). Someone
// who bought Founding before making a profile gets their PURCHASED number copied
// onto the dog doc whenever it appears (no finished profile needed: they paid).
//
// A dog doc written for a user that no longer exists (a stale ID token still
// works for up to an hour after deleteAccount) or that has been banned
// (scripts/admin-ban-user.cjs disables the Auth user) is deleted, and nothing is
// awarded. A failure anywhere here goes to the ops channel instead of vanishing:
// a lost award would otherwise be invisible.
//
// This function replaced onDogProfileCreated (an onCreate trigger). Firebase
// can't change a deployed function's trigger type in place, so it has a new
// name; deploy removes the old one (see PRODUCTION-LAUNCH-CHECKS.md).

async function awardFoundingNumber(
  uid: string,
  dogRef: FirebaseFirestore.DocumentReference,
  dogData: FirebaseFirestore.DocumentData,
  isCreate: boolean,
): Promise<void> {
  if (asNumber(dogData.foundingPackNumber) !== null) return; // already numbered

  if (isCreate && !(await authUserIsActive(uid))) {
    await db.recursiveDelete(dogRef);
    await db.collection('moderationLog').add({
      kind: 'orphan_dog_deleted',
      uid,
      reason: 'dog document written for a user that no longer exists or is banned',
      createdAt: FieldValue.serverTimestamp(),
    });
    await sendThrottledOpsAlert(
      'orphan_dog',
      5,
      `GoDoggyDate removed a dog profile written for a deleted or banned account: uid ${uid}. ` +
      'A stale sign-in token recreated it after the account was deleted or disabled. No founding number was awarded.',
      'GoDoggyDate keeps removing dog profiles written for deleted or banned accounts; further alerts are held back this hour. ' +
      'Every removal is in moderationLog (kind "orphan_dog_deleted").',
    );
    return;
  }

  const policy = photoUrlPolicy();
  const isRealPhoto = (photo: unknown) => isOwnStoragePhotoUrl(photo, uid, policy);
  const entitlementRef = db.doc(`users/${uid}/private/entitlements`);
  const counterRef = db.doc('counters/foundingPack');

  // Cheap checks outside the transaction, so a write that can never earn a
  // number (an unfinished profile, or all 50 free spots gone) doesn't lock the
  // counter. The counter only counts up, so "full" can't become "free" again.
  const entBefore: FirebaseFirestore.DocumentData = (await entitlementRef.get()).data() ?? {};
  const hasPurchasedNumber = entBefore.lifetimeChatUnlocks === true && asNumber(entBefore.foundingNumber) !== null;
  if (!hasPurchasedNumber) {
    if (foundingProfileGaps(dogData, isRealPhoto).length > 0) return;
    if (entBefore.revokedAt || entBefore.revokedReason) return; // refunded or disputed: never a free number
    const counterNow = asNumber((await counterRef.get()).data()?.count) ?? 0;
    if (counterNow >= FOUNDING_FREE_CAP) return; // free spots are gone: founding is $39 now
  }

  await db.runTransaction(async (tx) => {
    const [dogSnap, counterSnap, entSnap] = await Promise.all([
      tx.get(dogRef),
      tx.get(counterRef),
      tx.get(entitlementRef),
    ]);
    if (!dogSnap.exists) return;
    const dog = dogSnap.data() ?? {};
    if (asNumber(dog.foundingPackNumber) !== null) return; // numbered while we waited
    const ent: FirebaseFirestore.DocumentData = entSnap.data() ?? {};

    // Bought founding before making a profile: the webhook numbered the
    // purchase but had no dog doc to put the badge on yet. A member whose dog
    // doc was deleted and made again gets the same number back.
    const boughtNumber = asNumber(ent.foundingNumber);
    if (ent.lifetimeChatUnlocks === true && boughtNumber !== null) {
      tx.set(dogRef, { foundingPackNumber: boughtNumber }, { merge: true });
      return;
    }

    // Re-check against the document as it is now, not as the trigger saw it.
    if (foundingProfileGaps(dog, isRealPhoto).length > 0) return;
    if (ent.revokedAt || ent.revokedReason) return;
    const current = asNumber(counterSnap.data()?.count) ?? 0;
    if (current >= FOUNDING_FREE_CAP) return;
    const next = current + 1;
    tx.set(counterRef, { count: next }, { merge: true });
    tx.set(dogRef, { foundingPackNumber: next }, { merge: true });
    tx.set(entitlementRef, {
      lifetimeChatUnlocks: true,
      foundingFree: true,
      foundingNumber: next,
      // Someone who bought before the ladder existed keeps their purchase as the source.
      source: ent.lifetimeChatUnlocks === true ? (ent.source ?? 'founding_member') : 'founding_free',
      freeGrantedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }, { maxAttempts: 15 });
}

export const onDogProfileFounding = functions
  .runWith({ secrets: [opsAlertWebhookUrl] })
  .firestore.document('dogs/{uid}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const uid = context.params.uid as string;
    try {
      await awardFoundingNumber(uid, change.after.ref, change.after.data() ?? {}, !change.before.exists);
    } catch (error) {
      console.error('onDogProfileFounding failed', { uid, error });
      const message = error instanceof Error ? error.message : String(error);
      await sendThrottledOpsAlert(
        'founding_failure',
        5,
        `GoDoggyDate could not check the founding number for dog ${uid}: ${message.slice(0, 300)}. ` +
        'If they have a finished profile and free spots are left, they have no number yet. ' +
        'The check runs again on their next profile save; compare counters/foundingPack with the dogs that hold a foundingPackNumber.',
        'GoDoggyDate founding-number checks keep failing; further alerts are held back this hour. Look at the onDogProfileFounding logs.',
      );
    }
  });

// ── Household ────────────────────────────────────────────────────────────────
// The only viral/retention mechanic identified in this week's strategy
// research that genuinely works at four total users: it needs no other dog
// owner, doubles the humans actively using the product per dog, and turns
// "I'll cancel this" into a conversation ("wait, I use this to remind you to
// give her the pill"). Free — no payment gating.
//
// Invites are entirely server-mediated (no direct client Firestore access to
// householdInvites at all — see firestore.rules) so a code can't be
// enumerated or guessed via a read. Membership itself lives on the dog doc
// as householdMemberIds, which the OWNER already exclusively controls via
// the existing dogs/{dogId} update rule (request.auth.uid == dogId) — no
// additional guard is needed there since a household member's own writes to
// the dog doc are already blocked by that same rule.

const HOUSEHOLD_MAX_MEMBERS = 4; // owner + up to 3 more, per the research's "up to 4 humans"
const HOUSEHOLD_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Open (unused, unexpired) invites one dog may have at a time. A full household
// takes at most 3 more people, so a handful of spare codes is plenty; without a
// cap one account could mint codes without limit.
const HOUSEHOLD_MAX_OPEN_INVITES = 5;
const INVITE_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — easier to type from a screen

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_CHARS[crypto.randomInt(INVITE_CODE_CHARS.length)];
  }
  return code;
}

export const createHouseholdInvite = functions.https.onCall(async (_data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to invite someone.');
  }

  const dogSnap = await db.doc(`dogs/${uid}`).get();
  if (!dogSnap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Create your dog profile first.');
  }
  const currentMembers = (dogSnap.data()?.householdMemberIds as string[] | undefined) ?? [];
  if (currentMembers.length + 1 >= HOUSEHOLD_MAX_MEMBERS) {
    throw new functions.https.HttpsError('resource-exhausted', `Household is full (max ${HOUSEHOLD_MAX_MEMBERS} people).`);
  }

  // Cap the open invites. Used and expired ones don't count (and expired ones
  // are cleared while we're here, so the collection doesn't fill up with them).
  const mine = await db.collection('householdInvites').where('createdBy', '==', uid).get();
  const nowMs = Date.now();
  let openInvites = 0;
  for (const invite of mine.docs) {
    const data = invite.data() as { used?: boolean; expiresAt?: FirebaseFirestore.Timestamp };
    const expired = (data.expiresAt?.toMillis?.() ?? 0) < nowMs;
    if (expired) {
      await invite.ref.delete().catch(() => undefined);
    } else if (data.used !== true) {
      openInvites += 1;
    }
  }
  if (openInvites >= HOUSEHOLD_MAX_OPEN_INVITES) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `You already have ${openInvites} open invites. Share one of those, or wait for them to expire (7 days).`,
    );
  }

  // Retry on the (very unlikely) collision of a freshly generated code.
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateInviteCode();
    const existing = await db.doc(`householdInvites/${candidate}`).get();
    if (!existing.exists) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new functions.https.HttpsError('internal', 'Could not generate an invite — try again.');
  }

  const now = Date.now();
  await db.doc(`householdInvites/${code}`).set({
    dogId: uid,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + HOUSEHOLD_INVITE_TTL_MS),
    used: false,
  });

  return { code, expiresAt: now + HOUSEHOLD_INVITE_TTL_MS };
});

export const acceptHouseholdInvite = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to join a household.');
  }
  const code = typeof data?.code === 'string' ? data.code.trim().toUpperCase() : '';
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'Enter an invite code.');
  }

  const inviteRef = db.doc(`householdInvites/${code}`);

  const dogId = await db.runTransaction(async (transaction) => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'That code doesn\'t match an invite.');
    }
    const invite = inviteSnap.data() as {
      dogId: string;
      used: boolean;
      expiresAt: FirebaseFirestore.Timestamp;
    };
    if (invite.used) {
      throw new functions.https.HttpsError('failed-precondition', 'That invite has already been used.');
    }
    if (invite.expiresAt.toMillis() < Date.now()) {
      throw new functions.https.HttpsError('failed-precondition', 'That invite has expired.');
    }

    const dogRef = db.doc(`dogs/${invite.dogId}`);
    const dogSnap = await transaction.get(dogRef);
    if (!dogSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'That dog no longer exists.');
    }
    const currentMembers = (dogSnap.data()?.householdMemberIds as string[] | undefined) ?? [];
    if (currentMembers.includes(uid) || invite.dogId === uid) {
      // Already a member (or the owner themself) — treat as a harmless no-op
      // rather than erroring, since a re-tapped invite link is easy to hit.
      // The invite is NOT consumed: an owner opening their own link to check
      // it works would otherwise burn the code, and the person they actually
      // sent it to would be told "That invite has already been used."
      return invite.dogId;
    }
    if (currentMembers.length + 1 >= HOUSEHOLD_MAX_MEMBERS) {
      throw new functions.https.HttpsError('resource-exhausted', `That household is full (max ${HOUSEHOLD_MAX_MEMBERS} people).`);
    }

    // users/{uid} is owner-read-only (see firestore.rules), so the dog's
    // owner has no way to look up a member's display name themselves — the
    // token's name claim is captured here, once, at accept-time, purely for
    // display.
    //
    // Deliberately does NOT fall back to token.email. This value is stored on
    // the dog document, which is readable by every signed-in user and is the
    // source for the public /d/[slug] page — an email fallback published a
    // real address to anyone who looked, including crawlers. A generic label
    // is the correct degradation when a provider supplies no display name.
    const rawName = typeof context.auth?.token.name === 'string' ? context.auth.token.name.trim() : '';
    const displayLabel = rawName ? rawName.slice(0, 60) : 'Household member';

    transaction.update(dogRef, {
      householdMemberIds: FieldValue.arrayUnion(uid),
    });
    // The real display name goes in a private subcollection (readable only by
    // the owner + household — see firestore.rules), NOT on the world-readable
    // dog doc. householdMemberIds stays on the doc because the rules depend on it.
    transaction.set(dogRef.collection('householdNames').doc(uid), { name: displayLabel });
    transaction.update(inviteRef, { used: true, usedBy: uid });
    return invite.dogId;
  });

  return { dogId };
});

export const removeHouseholdMember = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const memberUid = typeof data?.memberUid === 'string' ? data.memberUid : '';
  if (!memberUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing memberUid.');
  }
  // It goes into a document path: an id with a slash (or an absurd length) used
  // to throw inside the path builder and come back as HTTP 500 "internal".
  if (!isSafeDocId(memberUid)) {
    throw new functions.https.HttpsError('invalid-argument', 'That is not a valid member id.');
  }

  // Only the dog's owner may remove a household member — dogId === uid for
  // the caller's OWN dog, so this rejects anyone trying to edit a household
  // they were merely invited into.
  const ownDog = await db.doc(`dogs/${uid}`).get();
  if (!ownDog.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Create your dog profile first.');
  }
  await ownDog.ref.update({
    householdMemberIds: FieldValue.arrayRemove(memberUid),
  });
  await db.doc(`dogs/${uid}/householdNames/${memberUid}`).delete().catch(() => {});

  return { removed: memberUid };
});

// ── Pack Day: open group playdates ─────────────────────────────────────────────
// All writes to packDays/ go through these callables (firestore.rules is
// read-only for clients). See ./packDay.ts.
const packDay = makePackDayFunctions({ db, sendPushToUser, isBlockedEitherWay });
export const createPackDay = packDay.createPackDay;
export const rsvpPackDay = packDay.rsvpPackDay;
export const cancelPackDay = packDay.cancelPackDay;
export const onPackDayCancelled = packDay.onPackDayCancelled;
export const sendPackDayReminders = packDay.sendPackDayReminders;
export const { sendPlaydateReminders } = (require('./playdates') as typeof import('./playdates')).makePlaydateFunctions({ db, sendPushToUser, isBlockedEitherWay }); // playdate reminders, see ./playdates.ts
export const { onPackDayMessageCreated, packDayChatHost, postPackDayHeadsUps } = (require('./packDayChat') as typeof import('./packDayChat')).makePackDayChatFunctions({ db, sendOpsAlert, secrets: [opsAlertWebhookUrl] }); // Pack Day group chat, see ./packDayChat.ts
export * from './ownerNames'; // owner first names on matches (D4), see ./ownerNames.ts

// Local waitlist (joinWaitlist, leaveWaitlist, neighbor-joined push). See ./waitlist.ts
export * from './waitlist';

// Lost dog alert (free): alert pushes, thank-yous and sighting pushes, see ./lostDog.ts
export const { onLostAlertCreated, onLostAlertUpdated, onLostSightingCreated } = (require('./lostDog') as typeof import('./lostDog')).makeLostDogFunctions({ db, sendPushToUser, isBlockedEitherWay, photoUrlPolicy });
