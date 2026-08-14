'use client';
// web/lib/pro.ts
// Client helpers to start a goDoggyDate Pro checkout and open the billing
// portal. Both attach the caller's Firebase ID token (same pattern as the
// Vibe Check + chat-unlock calls) so the server routes can verify who's
// subscribing without trusting the browser.

import { getFirebase } from '../shared/utils/firebase';
import type { ProTier } from '../../shared/pro';

/**
 * Pro CTAs only go live once the founder has created the Stripe Prices and
 * set NEXT_PUBLIC_PRO_ENABLED=true. Until then the value prop still renders
 * (so the app reads as "this exists"), but the checkout button shows a
 * "coming soon" state instead of a link that 503s. Mirrors the deliberate
 * env-gating already used for the Founding Member link and Gemini key.
 */
export function isProConfigured(): boolean {
  return process.env.NEXT_PUBLIC_PRO_ENABLED === 'true';
}

async function currentIdToken(): Promise<string> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

/**
 * Starts a Stripe Checkout session for the chosen tier and hands back the
 * redirect URL. The caller redirects the browser to it; on return, the
 * entitlements listener flips the UI to Pro the moment the webhook lands.
 */
export async function startProCheckout(tier: ProTier): Promise<string> {
  const idToken = await currentIdToken();
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tier }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Could not start checkout. Try again.');
  }
  return data.url as string;
}

/** Opens the Stripe billing portal for managing/cancelling an active plan. */
export async function openProPortal(): Promise<string> {
  const idToken = await currentIdToken();
  const res = await fetch('/api/stripe/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Could not open billing. Try again.');
  }
  return data.url as string;
}
