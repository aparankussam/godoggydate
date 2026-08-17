// mobile/lib/pro.ts
// Client helpers to start a goDoggyDate Pro checkout / Founding Member purchase
// and open the billing portal — the MOBILE counterpart of web/lib/pro.ts.
//
// APP STORE POSTURE: like the existing Founding Member flow (lib/entitlements
// getFoundingMemberLink), checkout is a Stripe Checkout page opened in an
// EXTERNAL browser (expo-web-browser), never a native in-app purchase and never
// an in-app webview form. The webhook (Firebase) is the sole writer of the
// entitlement; when the user returns, the realtime entitlements listener flips
// the UI to Pro on its own. We reuse the already-deployed web API routes
// (/api/stripe/checkout, /api/stripe/portal) so there is one source of truth
// for pricing, trial-abuse guards, and customer de-duplication.

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getFirebase } from './firebase';
import type { ProTier } from '../../shared/pro';

export type CheckoutTier = ProTier | 'founding';

/**
 * App Store Guideline 3.1.1: digital-goods purchases inside the iOS app must use
 * Apple's in-app purchase. Until StoreKit IAP (or an approved External Purchase
 * entitlement) is wired, we do NOT sell Pro or the Founding Member unlock
 * in-app on iOS — those CTAs render a compliant, no-steering note instead.
 * Android and the web are unaffected. This is the ONE switch to flip if/when the
 * entitlement lands or IAP ships. (Managing/cancelling an existing plan is not a
 * sale, so the billing-portal + active/founding states stay available on iOS.)
 */
export function canOfferInAppPurchase(): boolean {
  return Platform.OS !== 'ios';
}

function webBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim().replace(/\/$/, '') ||
    null
  );
}

/**
 * Pro CTAs only go live once the founder has created the Stripe Prices and set
 * EXPO_PUBLIC_PRO_ENABLED=true (mirrors the web NEXT_PUBLIC_PRO_ENABLED gate).
 * Until then the value prop still renders, but the button shows "coming soon"
 * instead of a link that 503s. Also requires a web API base to call.
 */
export function isProConfigured(): boolean {
  return process.env.EXPO_PUBLIC_PRO_ENABLED === 'true' && Boolean(webBase());
}

async function currentIdToken(): Promise<string> {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error('You need to be signed in.');
  return user.getIdToken();
}

async function checkoutUrl(tier: CheckoutTier): Promise<string> {
  const base = webBase();
  if (!base) throw new Error('goDoggyDate Pro is not configured for this build.');
  const idToken = await currentIdToken();
  const res = await fetch(`${base}/api/stripe/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tier }),
  });
  const data = await res.json().catch(() => ({} as { url?: string; error?: string }));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Could not start checkout. Try again.');
  }
  return data.url as string;
}

/**
 * Starts a Stripe Checkout session for the chosen tier and opens it in the
 * external browser. Resolves when the browser is dismissed; the entitlements
 * listener is what actually flips the UI to Pro once the webhook lands.
 */
export async function startProCheckout(tier: CheckoutTier): Promise<void> {
  const url = await checkoutUrl(tier);
  await WebBrowser.openBrowserAsync(url);
}

/** Founding Member ($39 one-time = Pro for life) via the same Checkout route. */
export async function startFoundingCheckout(): Promise<void> {
  return startProCheckout('founding');
}

/** Opens the Stripe billing portal for managing/cancelling an active plan. */
export async function openProPortal(): Promise<void> {
  const base = webBase();
  if (!base) throw new Error('Billing is not configured for this build.');
  const idToken = await currentIdToken();
  const res = await fetch(`${base}/api/stripe/portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({} as { url?: string; error?: string }));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Could not open billing. Try again.');
  }
  await WebBrowser.openBrowserAsync(data.url as string);
}
