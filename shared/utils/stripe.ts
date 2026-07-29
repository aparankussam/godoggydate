/**
 * Stripe payment scaffold.
 * Replace placeholder logic with real Stripe calls once keys are configured.
 *
 * Mobile:  uses @stripe/stripe-react-native
 * Web:     uses @stripe/stripe-js + @stripe/react-stripe-js
 */

import { CHAT_FREE_LAUNCH_MODE } from '../matchAccess';

// SOFT-LAUNCH "FOUNDING PACK" PRICING: 50 (Stripe's $0.50 USD minimum
// charge) instead of the normal 499 ($4.99), framed as real, numbered
// scarcity (see FOUNDING_PACK_SIZE / getFoundingPackPitch below) rather
// than a fake countdown. Revert to 499 once the Founding Pack fills or
// launch broadens beyond the soft-launch neighborhood.
//
// NOTE: CHAT_FREE_LAUNCH_MODE (shared/matchAccess.ts) currently makes chat
// itself free regardless of this price — see getChatUnlockPitch below. This
// constant stays live because the create-intent route and ChatUnlockPanel
// still exist ready to re-enable, and formatPrice(CHAT_UNLOCK_PRICE_CENTS)
// is still what a re-enabled unlock would charge.
export const CHAT_UNLOCK_PRICE_CENTS = 50;
export const CHAT_UNLOCK_CURRENCY = 'usd';

// Number of "Founding Pack" dogs the soft-launch price is honored for.
export const FOUNDING_PACK_SIZE = 500;

/** Standalone paywall pitch line, reused across every unlock surface. */
export function getChatUnlockPitch(): string {
  if (CHAT_FREE_LAUNCH_MODE) {
    return 'Chat is free right now — say hi. No unlock, no card, nothing.';
  }
  const price = formatPrice(CHAT_UNLOCK_PRICE_CENTS);
  return CHAT_UNLOCK_PRICE_CENTS <= 100
    ? `${price} unlocks this chat forever. Less than a poop bag. One of you pays, both of you talk.`
    : `${price} unlocks this chat forever. No subscription, no auto-renew. One of you pays, both of you talk.`;
}

/**
 * Founding Pack scarcity framing.
 *
 * This used to return null whenever CHAT_FREE_LAUNCH_MODE was on, because the
 * pitch was written around chat pricing. That silently removed the ONLY
 * remaining purchase path in the product the moment chat went free — the
 * homepage section and the in-chat CTA both early-return on a null pitch.
 *
 * The Founding Pack is a numbered, capped membership; its scarcity has nothing
 * to do with what chat costs. So the pitch now stands on its own, and only the
 * price-anchored variant depends on chat pricing.
 */
export function getFoundingPackPitch(): string | null {
  if (CHAT_FREE_LAUNCH_MODE) {
    return `Only ${FOUNDING_PACK_SIZE} dogs ever get a Founding Pack number. Yours is permanent, and it stops at ${FOUNDING_PACK_SIZE} for good.`;
  }
  if (CHAT_UNLOCK_PRICE_CENTS > 100) {
    return `Only ${FOUNDING_PACK_SIZE} dogs ever get a Founding Pack number. Yours is permanent, and it stops at ${FOUNDING_PACK_SIZE} for good.`;
  }
  return `${formatPrice(CHAT_UNLOCK_PRICE_CENTS)} chats until the Founding Pack hits ${FOUNDING_PACK_SIZE} dogs. After that, ${formatPrice(499)}. Your number never expires — the price does.`;
}

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
