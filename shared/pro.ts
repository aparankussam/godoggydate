// shared/pro.ts
// "goDoggyDate Pro" — the recurring subscription that gates the compounding,
// amplification, and memory features (daily Pet Twin, stage alerts, Year in
// Dog, the Legacy Vault export, unlimited Dogtype compatibility).
//
// This module is framework-agnostic on purpose: the SAME isProActive() is the
// single source of truth for the client (web/lib/useProEntitlement), the
// server AI routes (web/app/api/ai/*), and — mirrored, since rules can't
// import TS — firestore.rules' hasProSubscription(). Nothing here imports
// firebase; it operates on a plain entitlements object.
//
// AUTHORITY MODEL (identical to the $39 Founding Member lifetime unlock):
// entitlements live at users/{uid}/private/entitlements and are written ONLY
// by the Stripe webhook Cloud Function (firestore.rules blocks every client
// write to that doc). A client-set `pro` flag must never be trusted — the
// gate is a server read, never the browser's word.

import { formatPrice } from './utils/stripe';

// Impulse-priced monthly, with an annual plan that pulls users onto the far
// stickier yearly commitment (pet-subscription annual churn runs ~6-9%/yr vs
// ~18-22%/yr monthly, so annual is where retention lives). These are the only
// numbers to change to re-price — every surface derives its copy from them.
export const PRO_MONTHLY_PRICE_CENTS = 699; // $6.99/mo
export const PRO_ANNUAL_PRICE_CENTS = 5999; // $59.99/yr (~28% off, "nearly 4 months free")
export const PRO_CURRENCY = 'usd';
export const PRO_TRIAL_DAYS = 7; // 7-day trials outperform 30-day for consumer conversion

export const PRO_PRODUCT_NAME = 'goDoggyDate Pro';

export type ProTier = 'monthly' | 'annual';

// Mirrors Stripe's subscription.status values we care about. `active` and
// `trialing` grant access; everything else does not (past_due gets a short
// grace via PRO_GRACE_MS so a failed-then-retried invoice doesn't yank access
// mid-cycle).
export type ProStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface ProEntitlement {
  /** Webhook-authoritative: true while access should be granted. The one field
   *  the gate ultimately trusts; the rest is for display/management. */
  active: boolean;
  tier?: ProTier;
  status?: ProStatus;
  /** Unix ms. Access is honored until this + a grace window, so a missed
   *  cancellation webhook still expires access rather than granting forever. */
  currentPeriodEndMs?: number;
  /** Stripe set this to cancel at period end — access stays until then. */
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  updatedAtMs?: number;
}

export interface Entitlements {
  /** Founding Member ($39 one-time) — grants every chat forever AND, now,
   *  lifetime Pro (see isProActive). Existing early buyers are grandfathered
   *  into Pro rather than re-paywalled. */
  lifetimeChatUnlocks: boolean;
  pro?: ProEntitlement | null;
}

export const NO_ENTITLEMENTS: Entitlements = { lifetimeChatUnlocks: false, pro: null };

// Tolerate webhook lag and clock skew: a subscription whose period technically
// ended a day ago but whose renewal webhook hasn't landed must not flicker Pro
// off. Kept small so a genuinely lapsed sub still expires quickly.
const PRO_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

export function isFoundingMember(ent: Entitlements | null | undefined): boolean {
  return Boolean(ent?.lifetimeChatUnlocks);
}

/**
 * The single source of truth for "does this user have Pro right now".
 * Founding Members (lifetime) always pass. A subscription passes only while
 * the webhook says active/trialing AND we're inside the paid period (+grace).
 */
export function isProActive(
  ent: Entitlements | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!ent) return false;
  if (ent.lifetimeChatUnlocks === true) return true; // Founding = lifetime Pro
  const pro = ent.pro;
  if (!pro || pro.active !== true) return false;
  if (typeof pro.currentPeriodEndMs === 'number') {
    return pro.currentPeriodEndMs + PRO_GRACE_MS > nowMs;
  }
  // active with no known period end — trust the webhook flag rather than
  // locking a paying user out on a missing field.
  return true;
}

export type ProSource = 'founding' | 'subscription' | null;

export function proSource(ent: Entitlements | null | undefined): ProSource {
  if (isFoundingMember(ent)) return 'founding';
  if (ent?.pro?.active === true) return 'subscription';
  return null;
}

// ── Display helpers (derive all copy from the price constants) ───────────────

export function proMonthlyLabel(): string {
  return `${formatPrice(PRO_MONTHLY_PRICE_CENTS, PRO_CURRENCY)}/mo`;
}

export function proAnnualLabel(): string {
  return `${formatPrice(PRO_ANNUAL_PRICE_CENTS, PRO_CURRENCY)}/yr`;
}

/** Annual billed monthly-equivalent, e.g. "$5.00/mo billed yearly". */
export function proAnnualPerMonthLabel(): string {
  const perMonth = Math.round(PRO_ANNUAL_PRICE_CENTS / 12);
  return `${formatPrice(perMonth, PRO_CURRENCY)}/mo billed yearly`;
}

/** Whole-percent savings of annual vs paying monthly for a year. */
export function proAnnualSavingsPercent(): number {
  const monthlyYear = PRO_MONTHLY_PRICE_CENTS * 12;
  if (monthlyYear <= 0) return 0;
  return Math.round((1 - PRO_ANNUAL_PRICE_CENTS / monthlyYear) * 100);
}

/** One-liner for the Pro upsell surfaces. */
export function getProPitch(): string {
  return `${PRO_PRODUCT_NAME} keeps your dog's whole life in one place — a new card from them every day, their life story as it happens, and a record you'd never want to lose. ${proMonthlyLabel()}, or ${proAnnualLabel()} (save ${proAnnualSavingsPercent()}%).`;
}
