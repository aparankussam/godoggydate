import { NextResponse } from 'next/server';

// This endpoint is intentionally inactive for launch.
// Mobile one-time unlocks are verified by the Firebase Function webhook instead.
export async function POST() {
  return NextResponse.json(
    { error: 'Inactive webhook endpoint. Use the deployed Firebase Function stripeWebhook instead.' },
    { status: 410 },
  );
}
