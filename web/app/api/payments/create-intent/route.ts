import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY is required' },
      { status: 500 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const body = await request.json().catch(() => ({}));
  const { matchId, userId } = body as { matchId?: string; userId?: string };

  if (!matchId || !userId) {
    return NextResponse.json(
      { error: 'matchId and userId are required' },
      { status: 400 },
    );
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499,
      currency: 'usd',
      metadata: {
        matchId,
        userId,
      },
      automatic_payment_methods: { enabled: true },
    });

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
