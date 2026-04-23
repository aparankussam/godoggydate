import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

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

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { matchId, userId } = pi.metadata;

      if (matchId) {
        await db.doc(`matches/${matchId}`).update({
          chatUnlocked: true,
          paymentId: pi.id,
          unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Record payment
        await db.collection('payments').add({
          matchId,
          userId,
          paymentIntentId: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: 'succeeded',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    res.json({ received: true });
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
