import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { getChatUnlockFieldForUserId, isUserChatUnlocked } from '../../../../../shared/matchAccess';
import { CHAT_UNLOCK_CURRENCY, CHAT_UNLOCK_PRICE_CENTS } from '../../../../../shared/utils/stripe';

interface MatchDoc {
  dog1UserId?: string;
  dog2UserId?: string;
  userAId?: string;
  userBId?: string;
  chatUnlocked?: boolean;
  dog1ChatUnlocked?: boolean | null;
  dog2ChatUnlocked?: boolean | null;
}

interface MatchUnlockDoc {
  paymentIntentId?: string;
  status?: string;
  attemptCount?: number;
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isMatchParticipant(matchData: MatchDoc, userId: string): boolean {
  return [
    matchData.dog1UserId,
    matchData.dog2UserId,
    matchData.userAId,
    matchData.userBId,
  ].includes(userId);
}

function getUnlockId(matchId: string, userId: string): string {
  return `${matchId}_${userId}`;
}

function isReusablePaymentIntentStatus(status: Stripe.PaymentIntent.Status): boolean {
  return [
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
  ].includes(status);
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY is required' },
      { status: 500 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json(
      { error: 'Missing Firebase ID token' },
      { status: 401 },
    );
  }

  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(bearerToken);
  } catch (error) {
    console.error('create-intent auth verification failed', error);
    return NextResponse.json(
      { error: 'Invalid Firebase ID token' },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { matchId } = body as { matchId?: string };

  if (!matchId) {
    return NextResponse.json(
      { error: 'matchId is required' },
      { status: 400 },
    );
  }

  try {
    const matchSnap = await getAdminDb().doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 },
      );
    }

    const matchData = matchSnap.data() as MatchDoc;
    if (!isMatchParticipant(matchData, decodedToken.uid)) {
      return NextResponse.json(
        { error: 'You are not allowed to unlock this match' },
        { status: 403 },
      );
    }

    if (isUserChatUnlocked(matchData, decodedToken.uid)) {
      return NextResponse.json(
        { error: 'Chat is already unlocked for this user' },
        { status: 409 },
      );
    }

    const unlockField = getChatUnlockFieldForUserId(matchData, decodedToken.uid);
    if (!unlockField) {
      return NextResponse.json(
        { error: 'Could not determine unlock target for this user' },
        { status: 400 },
      );
    }

    const unlockId = getUnlockId(matchId, decodedToken.uid);
    const unlockRef = getAdminDb().doc(`matchUnlocks/${unlockId}`);
    const unlockSnap = await unlockRef.get();
    const unlockData = unlockSnap.exists ? unlockSnap.data() as MatchUnlockDoc : null;

    if (unlockData?.status === 'succeeded') {
      return NextResponse.json(
        { error: 'Payment already received for this match unlock' },
        { status: 409 },
      );
    }

    if (unlockData?.paymentIntentId) {
      try {
        const existingIntent = await stripe.paymentIntents.retrieve(unlockData.paymentIntentId);
        if (isReusablePaymentIntentStatus(existingIntent.status) && existingIntent.client_secret) {
          return NextResponse.json({
            clientSecret: existingIntent.client_secret,
            paymentIntentId: existingIntent.id,
          });
        }
      } catch (error) {
        console.warn('Could not reuse existing payment intent', {
          unlockId,
          paymentIntentId: unlockData.paymentIntentId,
          error,
        });
      }
    }

    const attemptCount = (unlockData?.attemptCount ?? 0) + 1;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: CHAT_UNLOCK_PRICE_CENTS,
      currency: CHAT_UNLOCK_CURRENCY,
      description: `GoDoggyDate chat unlock for ${matchId}`,
      metadata: {
        matchId,
        userId: decodedToken.uid,
        unlockId,
        unlockField,
      },
      automatic_payment_methods: { enabled: true },
    }, {
      idempotencyKey: `match-unlock:${unlockId}:attempt:${attemptCount}`,
    });

    await unlockRef.set({
      matchId,
      userId: decodedToken.uid,
      unlockField,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      attemptCount,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: unlockSnap.exists
        ? unlockSnap.data()?.createdAt ?? FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!paymentIntent.client_secret) {
      return NextResponse.json(
        { error: 'Stripe did not return a reusable client secret for this unlock' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err: any) {
    console.error('create-intent failed', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unable to create payment intent' },
      { status: 500 },
    );
  }
}
