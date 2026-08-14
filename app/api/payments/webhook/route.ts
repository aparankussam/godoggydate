import { NextResponse } from 'next/server';

// Stripe webhook handler is not active in this release.
// This stub keeps the route resolvable so the build succeeds.
export async function POST() {
  return NextResponse.json({ received: true }, { status: 200 });
}
