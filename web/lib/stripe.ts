// web/lib/stripe.ts
// Stripe server-side helper — singleton Stripe instance.
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is exposed to the client.
// STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET stay server-only (no NEXT_PUBLIC_ prefix).

import Stripe from 'stripe';

// ── Singleton ─────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY env var is not set.');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Monthly subscription price — create this in Stripe Dashboard and paste the price ID. */
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? 'price_placeholder';

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

// ── Free-tier limits ──────────────────────────────────────────────────────────

/** Free users get this many swipes per day before the paywall. */
export const FREE_DAILY_SWIPES = 10;

// ── Firestore paths ───────────────────────────────────────────────────────────

/** Subscription status stored at users/{uid}/subscription (sub-collection doc). */
export const subscriptionDocPath = (uid: string) => `users/${uid}/private/subscription`;

/** Daily swipe counter path. */
export const swipeCountDocPath = (uid: string) => `users/${uid}/private/swipeCount`;
