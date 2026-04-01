/**
 * Stripe payment scaffold.
 * Replace placeholder logic with real Stripe calls once keys are configured.
 *
 * Mobile:  uses @stripe/stripe-react-native
 * Web:     uses @stripe/stripe-js + @stripe/react-stripe-js
 */

export const CHAT_UNLOCK_PRICE_CENTS = 499; // $4.99
export const CHAT_UNLOCK_CURRENCY = 'usd';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaymentIntent {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

// ── Server-side (called from Next.js API route / Firebase Function) ───────────

/**
 * Called from: /api/payments/create-intent (Next.js) or Firebase CF
 * Requires STRIPE_SECRET_KEY in env.
 */
export async function createChatUnlockIntent(
  matchId: string,
  userId: string,
): Promise<PaymentIntent> {
  const res = await fetch('/api/payments/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, userId }),
  });
  if (!res.ok) throw new Error('Failed to create payment intent');
  return res.json();
}

// ── Client helpers ────────────────────────────────────────────────────────────

/** Validates that Stripe publishable key is present */
export function getStripePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error('STRIPE_PUBLISHABLE_KEY not configured');
  return key;
}

/** Formats price for display, e.g. 499 → "$4.99" */
export function formatPrice(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
