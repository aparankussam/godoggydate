import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { siteUrl } from '../../../../lib/site';

// Stripe Billing Portal — lets a Pro subscriber update their card, switch
// monthly/annual, or cancel, all on Stripe's hosted page. Reads the Stripe
// customer id the webhook stored on entitlements.pro; it never writes
// entitlements itself (the webhook reflects any change the user makes here).

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

/** Resolve the billing-portal return base. The caller's Origin header is
 *  attacker-controllable, so it is honoured ONLY when it exactly matches the
 *  canonical site or a localhost dev origin (so dev returns to dev). Anything
 *  else — a crafted Origin pointing at an attacker's host — is ignored in
 *  favour of siteUrl, so the subscriber can never be returned off-site. */
function resolveOrigin(request: Request): string {
  const origin = request.headers.get('origin')?.trim();
  if (origin) {
    try {
      const url = new URL(origin);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        (url.origin === siteUrl || isLocalhost)
      ) {
        return url.origin;
      }
    } catch {
      /* fall through */
    }
  }
  return siteUrl;
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY is required' }, { status: 500 });
  }

  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ error: 'Missing Firebase ID token' }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(bearerToken)).uid;
  } catch (error) {
    console.error('pro-portal auth verification failed', error);
    return NextResponse.json({ error: 'Invalid Firebase ID token' }, { status: 401 });
  }

  let customerId: string | undefined;
  try {
    const entSnap = await getAdminDb().doc(`users/${uid}/private/entitlements`).get();
    const stored = entSnap.exists ? (entSnap.data()?.pro?.stripeCustomerId as unknown) : undefined;
    if (typeof stored === 'string' && stored) customerId = stored;
  } catch (error) {
    console.error('pro-portal entitlements read failed', error);
  }

  if (!customerId) {
    return NextResponse.json(
      { error: 'No subscription to manage yet' },
      { status: 404 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${resolveOrigin(request)}/app/profile`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to open billing portal';
    console.error('pro-portal failed', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
