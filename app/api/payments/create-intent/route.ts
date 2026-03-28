import { NextResponse } from 'next/server';

// Stripe payments are not active in this release.
// This stub keeps the route resolvable so the build succeeds.
export async function POST() {
  return NextResponse.json({ error: 'Payments not yet enabled.' }, { status: 501 });
}
