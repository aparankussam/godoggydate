import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { siteUrl } from '../../../../lib/site';
import { PRO_TRIAL_DAYS, type ProTier } from '../../../../../shared/pro';

// goDoggyDate Pro subscription checkout.
//
// Creates a Stripe Checkout Session in subscription mode for the authenticated
// user and returns its URL. The webhook (firebase/functions stripeWebhook) is
// the SOLE writer of the resulting entitlement — this route never writes
// users/{uid}/private/entitlements, exactly like the one-time flows. It only
// reads entitlements to reuse an already-known Stripe customer so a returning
// user doesn't spawn a duplicate customer.
//
// Env: STRIPE_SECRET_KEY, and one price id per tier —
//   STRIPE_PRO_PRICE_MONTHLY / STRIPE_PRO_PRICE_ANNUAL (create the Product +
//   recurring Prices in the Stripe dashboard). Missing config → 503, and the
//   client hides the upgrade CTA (isProConfigured), so nothing half-works.

function priceIdForTier(tier: ProTier): string | undefined {
  const id =
    tier === 'annual'
      ? process.env.STRIPE_PRO_PRICE_ANNUAL
      : process.env.STRIPE_PRO_PRICE_MONTHLY;
  return id?.trim() || undefined;
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

/** Prefer the caller's own origin (so localhost dev redirects back to dev),
 *  fall back to the canonical site. Only same-shape http(s) origins are used. */
function resolveOrigin(request: Request): string {
  const origin = request.headers.get('origin')?.trim();
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
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
  let email: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(bearerToken);
    uid = decoded.uid;
    email = decoded.email;
  } catch (error) {
    console.error('pro-checkout auth verification failed', error);
    return NextResponse.json({ error: 'Invalid Firebase ID token' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tier: ProTier = (body?.tier === 'annual' ? 'annual' : 'monthly');

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    console.error(`pro-checkout: no price id configured for tier ${tier}`);
    return NextResponse.json({ error: 'goDoggyDate Pro is not configured yet' }, { status: 503 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const origin = resolveOrigin(request);

  try {
    // If the webhook already recorded a Stripe customer for this uid, reuse it
    // so a second checkout doesn't create a duplicate customer record. Its mere
    // presence also means this user has subscribed before — which gates both
    // the trial (below) and the duplicate-subscription guard.
    let existingCustomerId: string | undefined;
    try {
      const entSnap = await getAdminDb().doc(`users/${uid}/private/entitlements`).get();
      const stored = entSnap.exists ? (entSnap.data()?.pro?.stripeCustomerId as unknown) : undefined;
      if (typeof stored === 'string' && stored) existingCustomerId = stored;
    } catch {
      /* non-fatal — just create a fresh customer below */
    }

    // Guard against opening a SECOND parallel subscription for a customer who
    // already has one (e.g. a double-tap during the post-checkout webhook lag).
    // A second subscription would bill the card invisibly and never surface in
    // the portal (which only shows the one entitlements recorded).
    if (existingCustomerId) {
      const existing = await stripe.subscriptions.list({
        customer: existingCustomerId,
        status: 'all',
        limit: 10,
      });
      const hasLiveSub = existing.data.some(
        (s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due',
      );
      if (hasLiveSub) {
        return NextResponse.json(
          { error: 'You already have goDoggyDate Pro. Manage it from your profile.' },
          { status: 409 },
        );
      }
    }

    // Only genuinely NEW customers get the free trial. A returning customer
    // (existingCustomerId present ⇒ they subscribed before) must not be handed
    // a fresh 7-day trial on every re-subscribe — that's a perpetual-free-Pro
    // farm via cancel-before-trial-end + resubscribe. Stripe does not
    // de-duplicate trials per customer, so this has to be enforced here.
    const grantTrial = PRO_TRIAL_DAYS > 0 && !existingCustomerId;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id + metadata both carry the uid: the webhook reads
      // whichever is present, and subscription_data.metadata rides onto the
      // Subscription object so update/delete events can still attribute it.
      client_reference_id: uid,
      metadata: { firebaseUid: uid, tier },
      subscription_data: {
        metadata: { firebaseUid: uid, tier },
        ...(grantTrial ? { trial_period_days: PRO_TRIAL_DAYS } : {}),
      },
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : email
          ? { customer_email: email }
          : {}),
      allow_promotion_codes: true,
      success_url: `${origin}/app/profile?pro=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/profile?pro=cancel`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to start checkout';
    console.error('pro-checkout failed', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
