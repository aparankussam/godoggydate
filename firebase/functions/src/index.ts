import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';

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
        // Founding Member lifetime purchase via a Stripe Payment Link.
        // The marketing site appends ?client_reference_id=<uid> to the link,
        // so the session carries the purchasing user's Firebase uid.
        // Guards: must actually be paid, and must be at least the Founding
        // Member price — a cheaper product on this Stripe account must never
        // grant the entitlement.
        const session = event.data.object as Stripe.Checkout.Session;
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

    for (const r of ratings) {
      const ageMs = now - (r.createdAt?.toMillis?.() ?? now);
      const weight = Math.pow(0.5, ageMs / HALF_LIFE_MS);
      weightedSum += r.stars * weight;
      weightTotal += weight;
      if (r.wouldMeetAgain) meetAgainCount++;
    }

    const avgStars = weightTotal > 0 ? weightedSum / weightTotal : 0;
    const normalizedScore = avgStars / 5;
    const confidenceBonus = Math.min(ratings.length / 30, 1) * 0.1;
    const trustScore = Math.min(Math.round((normalizedScore + confidenceBonus) * 100) / 100, 1);
    const meetAgainRate = ratings.length > 0 ? meetAgainCount / ratings.length : 0;

    await db.doc(`dogs/${dogId}`).update({
      trustScore,
      ratingCount: ratings.length,
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
    await db.doc(`dogs/${uid}`).delete();

    // payments/matchUnlocks/stripeEvents are retained: financial records
    // needed for refund/dispute defense (legitimate-interest retention).

    await admin.auth().deleteUser(uid);

    return { deleted: true };
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
