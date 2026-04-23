import { NextResponse } from 'next/server';

// Subscription checkout is not part of the launch pricing model.
// Launch uses one-time match unlocks instead.
export async function POST() {
  return NextResponse.json(
    { error: 'Inactive for launch. Use the one-time chat unlock flow instead.' },
    { status: 410 },
  );
}
