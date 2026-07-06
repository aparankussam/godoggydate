// web/lib/entitlements.ts
// Premium entitlements live at users/{uid}/private/entitlements and are
// written ONLY by the Stripe webhook (firestore.rules blocks client writes).
// Founding Members get lifetimeChatUnlocks, which opens every match's chat
// without a per-match unlock payment.

import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

export interface Entitlements {
  lifetimeChatUnlocks: boolean;
}

const NO_ENTITLEMENTS: Entitlements = { lifetimeChatUnlocks: false };

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const { db } = getFirebase();
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'private', 'entitlements'));
    if (!snap.exists()) return NO_ENTITLEMENTS;
    return { lifetimeChatUnlocks: Boolean(snap.data()?.lifetimeChatUnlocks) };
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
    (snap) => {
      callback(
        snap.exists()
          ? { lifetimeChatUnlocks: Boolean(snap.data()?.lifetimeChatUnlocks) }
          : NO_ENTITLEMENTS,
      );
    },
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
