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
          [`householdMemberNames.${uid}`]: admin.firestore.FieldValue.delete(),
        });
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
          await doc.ref.update({
            dueDate: admin.firestore.Timestamp.fromMillis(nextDue),
            notifiedAt: admin.firestore.FieldValue.delete(),
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

// ── Founding Pack numbering ─────────────────────────────────────────────────
// Assigns each new dog a permanent, sequential Founding Pack number
// (Dog #137 of the Founding Pack) — real, numbered scarcity for the
// soft-launch pricing story. Runs once, on true first creation of a
// dogs/{uid} doc (Firestore's onCreate only fires the first time a
// document at that path is created). Atomic via a transaction against a
// single counters/foundingPack doc so concurrent signups never collide.

export const onDogProfileCreated = functions.firestore
  .document('dogs/{uid}')
  .onCreate(async (snap) => {
    const counterRef = db.doc('counters/foundingPack');

    const number = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const next = ((counterSnap.data()?.count as number | undefined) ?? 0) + 1;
      transaction.set(counterRef, { count: next }, { merge: true });
      return next;
    });

    await snap.ref.set({ foundingPackNumber: number }, { merge: true });
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
      [`householdMemberNames.${uid}`]: displayLabel,
    });
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
    [`householdMemberNames.${memberUid}`]: admin.firestore.FieldValue.delete(),
  });

  return { removed: memberUid };
});
