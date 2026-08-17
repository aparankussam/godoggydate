import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import * as crypto from 'crypto';

admin.initializeApp();
const db = admin.firestore();
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// Founding Member lifetime tier — checkout sessions below this amount never
// grant the entitlement ($39.00).
const FOUNDING_MEMBER_MIN_CENTS = 3900;

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

async function markStripeEventStarted(event: Stripe.Event): Promise<boolean> {
  try {
    await db.collection('stripeEvents').doc(event.id).create({
      type: event.type,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      livemode: event.livemode,
    });
    return true;
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

    if (code === '6' || code === 'already-exists') {
      return false;
    }

    throw error;
  }
}

async function finalizeStripeEvent(eventId: string, status: 'processed' | 'ignored', extra?: Record<string, unknown>) {
  await db.collection('stripeEvents').doc(eventId).set({
    status,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      unlockedAt: nextFieldValue ? admin.firestore.FieldValue.serverTimestamp() : matchData.unlockedAt ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(unlockRef, {
      matchId,
      userId,
      unlockField: field,
      paymentIntentId,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extra,
    }, { merge: true });

    transaction.set(paymentRef, {
      matchId,
      userId,
      unlockId: `${matchId}_${userId}`,
      unlockField: field,
      paymentIntentId,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

// ── Stripe Webhook ─────────────────────────────────────────────────────────────

export const stripeWebhook = functions
  .runWith({ secrets: [stripeSecretKey, stripeWebhookSecret] })
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
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

        if (paymentIntentId) {
          const paymentSnap = await db.doc(`payments/${paymentIntentId}`).get();
          if (paymentSnap.exists) {
            const paymentData = paymentSnap.data() as StoredPaymentDoc & { type?: string };

            // Founding Member refund/dispute → revoke the lifetime entitlement.
            if (paymentData.type === 'founding_member' && paymentData.userId) {
              await db.doc(`users/${paymentData.userId}/private/entitlements`).set({
                lifetimeChatUnlocks: false,
                revokedAt: admin.firestore.FieldValue.serverTimestamp(),
                revokedReason: event.type === 'charge.refunded' ? 'refunded' : 'disputed',
              }, { merge: true });
              await db.doc(`payments/${paymentIntentId}`).set({
                status: event.type === 'charge.refunded' ? 'refunded' : 'disputed',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            }

            if (paymentData.matchId && paymentData.userId && paymentData.unlockField) {
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
            }
          }
        }

        await finalizeStripeEvent(event.id, 'processed', {
          paymentIntentId,
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
        // Guards: must actually be paid, and must be at least the Founding
        // Member price — a cheaper product on this Stripe account must never
        // grant the entitlement.
        const uid = session.client_reference_id;
        const paidEnough =
          session.payment_status === 'paid' &&
          (session.amount_total ?? 0) >= FOUNDING_MEMBER_MIN_CENTS &&
          session.currency === 'usd';
        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : '';

        if (uid && paidEnough) {
          await db.doc(`users/${uid}/private/entitlements`).set({
            lifetimeChatUnlocks: true,
            source: 'founding_member',
            checkoutSessionId: session.id,
            paymentIntentId: paymentIntentId || null,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          // Record the payment so charge.refunded / dispute events can find
          // and revoke this entitlement (they look up payments/{paymentIntentId}).
          if (paymentIntentId) {
            await db.doc(`payments/${paymentIntentId}`).set({
              type: 'founding_member',
              userId: uid,
              checkoutSessionId: session.id,
              status: 'succeeded',
              amount: session.amount_total ?? null,
              currency: session.currency ?? null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }

        await finalizeStripeEvent(event.id, uid && paidEnough ? 'processed' : 'ignored', {
          checkoutSessionId: session.id,
          hasClientReference: Boolean(uid),
          paidEnough,
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
        trustScore: admin.firestore.FieldValue.delete(),
        ratingCount: admin.firestore.FieldValue.delete(),
        meetAgainRate: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

// ── Account deletion (GDPR/CCPA + App Store requirement) ──────────────────────
// Deletes all of the caller's data, then the auth user itself. Client signs
// the user out after this resolves. Matches the user participates in are
// removed (including message subcollections) so the counterpart doesn't see
// a ghost thread.

export const deleteAccount = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in to delete your account.');
    }

    // Matches in every participant slot, including legacy userAId/userBId docs.
    const matchQueries = await Promise.all([
      db.collection('matches').where('dog1UserId', '==', uid).get(),
      db.collection('matches').where('dog2UserId', '==', uid).get(),
      db.collection('matches').where('userAId', '==', uid).get(),
      db.collection('matches').where('userBId', '==', uid).get(),
    ]);
    const matchRefs = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const snap of matchQueries) {
      for (const d of snap.docs) matchRefs.set(d.id, d.ref);
    }
    for (const ref of matchRefs.values()) {
      await db.recursiveDelete(ref);
    }

    // Other users' swipe decisions that target this user (collection-group;
    // requires the decisions.targetUserId COLLECTION_GROUP index).
    try {
      const targeting = await db
        .collectionGroup('decisions')
        .where('targetUserId', '==', uid)
        .get();
      const batch = db.batch();
      targeting.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      // Missing index must not strand the rest of the deletion.
      console.error('deleteAccount: could not delete targeting decisions', { uid, error });
    }

    // Ratings written by this user and reports they filed.
    for (const [col, field] of [['ratings', 'raterId'], ['reports', 'reporterId']] as const) {
      const snap = await db.collection(col).where(field, '==', uid).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await db.recursiveDelete(db.doc(`swipes/${uid}`));
    await db.recursiveDelete(db.doc(`blocks/${uid}`));
    await db.recursiveDelete(db.doc(`users/${uid}`));
    // recursiveDelete, not delete(): a plain delete removed the dog document
    // but ORPHANED its subcollections. dogs/{uid}/reminders holds medication,
    // rabies and vet dates, and sendReminderNotifications would keep sweeping
    // those orphans daily forever.
    await db.recursiveDelete(db.doc(`dogs/${uid}`));

    // Remove this user from every OTHER dog's household. Without this, a
    // deleted user's uid and display label stay embedded in a third party's
    // world-readable dog document indefinitely.
    try {
      const households = await db
        .collection('dogs')
        .where('householdMemberIds', 'array-contains', uid)
        .get();
      for (const d of households.docs) {
        await d.ref.update({
          householdMemberIds: admin.firestore.FieldValue.arrayRemove(uid),
        });
        await d.ref.collection('householdNames').doc(uid).delete().catch(() => {});
      }
    } catch (error) {
      // A missing index must not strand the rest of the deletion.
      console.error('deleteAccount: could not clear household memberships', { uid, error });
    }

    // Invites this user created (they carry dogId + createdBy).
    try {
      const invites = await db.collection('householdInvites').where('createdBy', '==', uid).get();
      const batch = db.batch();
      invites.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      console.error('deleteAccount: could not delete household invites', { uid, error });
    }

    // Uploaded images. Firestore deletion alone left every photo permanently
    // fetchable: Storage download URLs carry their own ?alt=media&token=,
    // which bypasses storage.rules entirely, so "delete my account" was
    // leaving photographs public on the open internet.
    for (const prefix of [`dogs/${uid}/`, `avatars/${uid}/`]) {
      try {
        await admin.storage().bucket().deleteFiles({ prefix });
      } catch (error) {
        console.error('deleteAccount: could not delete storage prefix', { uid, prefix, error });
      }
    }

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
        ? { expoPushTokens: admin.firestore.FieldValue.arrayRemove(...staleExpo) }
        : {}),
      ...(staleWeb.length > 0
        ? { fcmWebTokens: admin.firestore.FieldValue.arrayRemove(...staleWeb) }
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

    await Promise.all(participants.map(async (uid) => {
      const otherUid = participants.find((p) => p !== uid);
      const otherName = await getDogName(otherUid);
      await sendPushToUser(uid, {
        title: "It's a match! 🐾",
        body: `${otherName} wants to play too. Say hello and set up a playdate!`,
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

export const onMessageCreatedNotify = functions.firestore
  .document('matches/{matchId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data() as { fromUserId?: string; text?: string; type?: string };
    const { matchId } = context.params as { matchId: string };
    if (!message.fromUserId) return;

    const matchSnap = await db.doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) return;
    const matchData = matchSnap.data() as MatchData;

    const recipient = [matchData.dog1UserId, matchData.dog2UserId]
      .find((uid) => uid && uid !== message.fromUserId);
    if (!recipient) return;

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
    const windowEnd = admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);

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
            dueDate: admin.firestore.Timestamp.fromMillis(nextDue),
            notifiedAt: admin.firestore.FieldValue.delete(),
            currentStreak: 0,
          });
        }
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

  // Birthday — the whole birth month (birthYear is year-only, so no exact day).
  if (typeof dog.birthMonth === 'number' && dog.birthMonth >= 1 && dog.birthMonth <= 12) {
    if (month === dog.birthMonth - 1) {
      const turning = typeof dog.birthYear === 'number' ? year - dog.birthYear : null;
      hits.push({
        kind: 'birthday',
        year,
        title: `🎂 It's ${name}'s birthday month!`,
        body: turning != null && turning >= 0
          ? `${name} turns ${turning} this month. Make it a good one.`
          : `Give ${name} some extra treats this month.`,
      });
    }
  }

  // Gotcha Day — exact month/day, with the same Feb-29 rollover the profile
  // card uses (new Date rolls Feb 29 to Mar 1 in a non-leap year), so a
  // leap-day Gotcha Day still fires — and fires on the same day the card shows.
  if (typeof dog.adoptionDate === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dog.adoptionDate.trim());
    if (m) {
      const ay = Number(m[1]); const am = Number(m[2]); const ad = Number(m[3]);
      const occ = new Date(year, am - 1, ad);
      if (occ.getMonth() === month && occ.getDate() === day) {
        const years = year - ay;
        if (years >= 1) {
          hits.push({
            kind: 'gotcha', year,
            title: `🏡 ${name}'s Gotcha Day`,
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

export const sendCelebrationNotifications = functions.pubsub
  .schedule('every 24 hours')
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
          await markerRef.create({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch {
          continue; // already celebrated this occasion this year
        }
        await sendPushToUser(dogId, {
          title: hit.title,
          body: hit.body,
          data: { type: 'celebration', kind: hit.kind, dogId, link: 'https://godoggydate.com/app/profile' },
        });
        sent += 1;
      }
    }
    console.log(`Sent ${sent} celebration notifications`);
  });

// ── Founding Pack numbering ─────────────────────────────────────────────────
// Assigns each new dog a permanent, sequential Founding Pack number
// (Dog #137 of the Founding Pack) — real, numbered scarcity for the
// soft-launch pricing story. Runs once, on true first creation of a
// dogs/{uid} doc (Firestore's onCreate only fires the first time a
// document at that path is created). Atomic via a transaction against a
// single counters/foundingPack doc so concurrent signups never collide.
//
// The public copy promises the pack "stops at 500 for good", so this HARD-CAPS
// at 500: dog #501+ simply gets no foundingPackNumber (the badge/CTA render off
// its presence), keeping the scarcity claim literally true in code rather than
// aspirational.
const FOUNDING_PACK_CAP = 500;

export const onDogProfileCreated = functions.firestore
  .document('dogs/{uid}')
  .onCreate(async (snap) => {
    const counterRef = db.doc('counters/foundingPack');

    const number = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const current = (counterSnap.data()?.count as number | undefined) ?? 0;
      if (current >= FOUNDING_PACK_CAP) return null; // pack is full — no number
      const next = current + 1;
      transaction.set(counterRef, { count: next }, { merge: true });
      return next;
    });

    if (number !== null) {
      await snap.ref.set({ foundingPackNumber: number }, { merge: true });
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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(now + HOUSEHOLD_INVITE_TTL_MS),
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
      transaction.update(inviteRef, { used: true, usedBy: uid });
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
      householdMemberIds: admin.firestore.FieldValue.arrayUnion(uid),
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

  // Only the dog's owner may remove a household member — dogId === uid for
  // the caller's OWN dog, so this rejects anyone trying to edit a household
  // they were merely invited into.
  await db.doc(`dogs/${uid}`).update({
    householdMemberIds: admin.firestore.FieldValue.arrayRemove(memberUid),
  });
  await db.doc(`dogs/${uid}/householdNames/${memberUid}`).delete().catch(() => {});

  return { removed: memberUid };
});
