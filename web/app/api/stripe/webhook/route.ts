import { NextResponse } from 'next/server';

// Subscription webhook handling is not part of the launch pricing model.
// One-time unlock verification is handled by the deployed Firebase Function.
export async function POST() {
  return NextResponse.json(
    { error: 'Inactive for launch. Use the deployed Firebase Function stripeWebhook instead.' },
    { status: 410 },
  );
}
