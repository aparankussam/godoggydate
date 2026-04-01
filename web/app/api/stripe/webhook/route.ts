// web/app/api/stripe/webhook/route.ts
// Handles Stripe webhook events to keep subscription state in Firestore.
// Events handled:
//   checkout.session.completed      → mark user as subscribed
//   customer.subscription.deleted   → remove subscription
//   customer.subscription.updated   → update status
//
// Firestore doc: users/{userId}/private/subscription
//   { status, stripeCustomerId, subscriptionId, currentPeriodEnd }

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe, STRIPE_WEBHOOK_SECRET } from '../../../../lib/stripe';

// App Router: disable body parsing so we can read the raw bytes for Stripe sig verification
export const dynamic = 'force-dynamic';

// Firestore Admin — use a lightweight approach via REST since we're already
// using the client SDK elsewhere. For production, swap to firebase-admin.
// Here we use the Firestore REST API with a service account token from an env var.
async function updateSubscription(
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const token     = process.env.FIREBASE_SERVICE_ACCOUNT_TOKEN; // set in env
  if (!projectId || !token) {
    console.warn('Firestore credentials not set — skipping subscription update.');
    return;
  }

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents` +
    `/users/${userId}/private/subscription`;

  // PATCH with updateMask to avoid overwriting the whole document
  const fields: Record<string, { stringValue?: string; integerValue?: string; booleanValue?: boolean }> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }

  await fetch(`${url}?updateMask.fieldPaths=${Object.keys(data).join('&updateMask.fieldPaths=')}`, {
    method:  'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId  = session.metadata?.userId;
        if (userId && session.subscription) {
          await updateSubscription(userId, {
            status:             'active',
            stripeCustomerId:   String(session.customer ?? ''),
            subscriptionId:     String(session.subscription),
          });
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub     = event.data.object as Stripe.Subscription;
        const userId  = sub.metadata?.userId;
        if (userId) {
          await updateSubscription(userId, { status: sub.status });
        }
        break;
      }

      default:
        // Unhandled events — acknowledged but ignored
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 so Stripe doesn't retry for non-signature errors
  }

  return NextResponse.json({ received: true });
}
