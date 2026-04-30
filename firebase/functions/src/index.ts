import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

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
            const paymentData = paymentSnap.data() as StoredPaymentDoc;
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

      await finalizeStripeEvent(event.id, 'ignored');
      res.json({ received: true, ignored: true });
    } catch (error) {
      console.error('Stripe webhook processing failed', {
        eventId: event.id,
        eventType: event.type,
        error,
      });
      await finalizeStripeEvent(event.id, 'ignored', {
        error: error instanceof Error ? error.message : 'Unknown webhook processing error',
      });
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

// ── Cleanup: delete matches older than 30 days with no chat activity ───────────

export const cleanupStaleMatches = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const snap = await db
      .collection('matches')
      .where('chatUnlocked', '==', false)
      .where('createdAt', '<', cutoff)
      .get();

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Deleted ${snap.size} stale matches`);
  });
