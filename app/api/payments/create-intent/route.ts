import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getFirebase } from '../../../../shared/utils/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

export async function POST(req: NextRequest) {
  try {
    const { matchId, userId } = await req.json();

    if (!matchId || !userId) {
      return NextResponse.json({ error: 'matchId and userId are required' }, { status: 400 });
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499, // $4.99
      currency: 'usd',
      metadata: { matchId, userId },
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (err) {
    console.error('[create-intent]', err);
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 });
  }
}
