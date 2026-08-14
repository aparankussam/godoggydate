// web/lib/entitlements.ts
// Premium entitlements live at users/{uid}/private/entitlements and are
// written ONLY by the Stripe webhook (firestore.rules blocks client writes).
//   • Founding Members ($39 one-time) get lifetimeChatUnlocks — every match's
//     chat opens without a per-match unlock, AND they are grandfathered into
//     Pro for life (see isProActive in shared/pro).
//   • goDoggyDate Pro subscribers get a `pro` object the webhook keeps in sync
//     with their Stripe subscription.
// The client may READ this doc (its own), never write it — so the browser can
// react instantly to a grant, but the gate itself is always server-authored.

import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import {
  NO_ENTITLEMENTS,
  isFoundingMember,
  isProActive,
  proSource,
  type Entitlements,
  type ProEntitlement,
  type ProStatus,
  type ProTier,
} from '../../shared/pro';

export type { Entitlements, ProEntitlement } from '../../shared/pro';
export { isProActive, isFoundingMember, proSource } from '../../shared/pro';

const PRO_TIERS: ProTier[] = ['monthly', 'annual'];
const PRO_STATUSES: ProStatus[] = [
  'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid',
];

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Defensive parse — a hand-edited or partial doc must never crash the gate. */
function parsePro(raw: unknown): ProEntitlement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tier = PRO_TIERS.includes(r.tier as ProTier) ? (r.tier as ProTier) : undefined;
  const status = PRO_STATUSES.includes(r.status as ProStatus) ? (r.status as ProStatus) : undefined;
  return {
    active: r.active === true,
    tier,
    status,
    currentPeriodEndMs: num(r.currentPeriodEndMs),
    cancelAtPeriodEnd: r.cancelAtPeriodEnd === true,
    stripeCustomerId: typeof r.stripeCustomerId === 'string' ? r.stripeCustomerId : undefined,
    stripeSubscriptionId: typeof r.stripeSubscriptionId === 'string' ? r.stripeSubscriptionId : undefined,
    updatedAtMs: num(r.updatedAtMs),
  };
}

function parseEntitlements(data: unknown): Entitlements {
  if (!data || typeof data !== 'object') return NO_ENTITLEMENTS;
  const d = data as Record<string, unknown>;
  return {
    lifetimeChatUnlocks: Boolean(d.lifetimeChatUnlocks),
    pro: parsePro(d.pro),
  };
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const { db } = getFirebase();
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'private', 'entitlements'));
    if (!snap.exists()) return NO_ENTITLEMENTS;
    return parseEntitlements(snap.data());
  } catch {
    return NO_ENTITLEMENTS;
  }
}

/** Realtime entitlement listener — fires immediately and on webhook grants. */
export function onEntitlements(
  userId: string,
  callback: (entitlements: Entitlements) => void,
): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, 'users', userId, 'private', 'entitlements'),
    (snap) => callback(snap.exists() ? parseEntitlements(snap.data()) : NO_ENTITLEMENTS),
    () => callback(NO_ENTITLEMENTS),
  );
}

/** Founding Member payment link with the uid attached for webhook attribution. */
export function getFoundingMemberLink(userId: string): string | null {
  const base = process.env.NEXT_PUBLIC_FOUNDING_MEMBER_PAYMENT_LINK?.trim();
  if (!base) return null;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}client_reference_id=${encodeURIComponent(userId)}`;
}
