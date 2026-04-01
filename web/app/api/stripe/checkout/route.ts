// web/app/api/stripe/checkout/route.ts
// Creates a Stripe Checkout session for the $4.99/mo subscription.
// Expects: POST { userId: string }
// Returns: { url: string }  — redirect the client to this URL.

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICE_ID } from '../../../../lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { userId } = (await req.json()) as { userId?: string };
    if (!userId) {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    // If Stripe is not yet configured, return a graceful "coming soon" response
    // instead of letting the Stripe SDK throw and confuse the user.
    if (STRIPE_PRICE_ID === 'price_placeholder' || !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ comingSoon: true });
    }

    const stripe  = getStripe();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode:     'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${baseUrl}/app?checkout=success`,
      cancel_url:  `${baseUrl}/app?checkout=cancelled`,
      metadata:    { userId },
      // Pre-fill email if you store it; omitted here to keep it simple.
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 },
    );
  }
}
