import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getFirebase } from '../../../../shared/utils/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error('[webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const { matchId, userId } = pi.metadata;

    if (!matchId) {
      console.warn('[webhook] No matchId in metadata');
      return NextResponse.json({ received: true });
    }

    try {
      const { db } = getFirebase();
      await updateDoc(doc(db, 'matches', matchId), {
        chatUnlocked: true,
        paymentId: pi.id,
        unlockedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`[webhook] Chat unlocked for match ${matchId}`);
    } catch (err) {
      console.error('[webhook] Firestore update failed:', err);
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
