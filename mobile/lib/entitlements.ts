// mobile/lib/entitlements.ts
// Mirrors web/lib/entitlements.ts. Entitlements live at
// users/{uid}/private/entitlements and are written ONLY by the Stripe
// webhook (firestore.rules blocks client writes). Founding Members get
// lifetimeChatUnlocks, which opens every match's chat without a per-match
// unlock payment.

import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from './firebase';

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

/**
 * Founding Member payment link with the uid attached for webhook
 * attribution. Opened in an external browser (Linking.openURL) — never
 * in-app — so this stays clear of Apple's in-app-purchase requirements.
 */
export function getFoundingMemberLink(userId: string): string | null {
  const base = process.env.EXPO_PUBLIC_FOUNDING_MEMBER_PAYMENT_LINK?.trim();
  if (!base) return null;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}client_reference_id=${encodeURIComponent(userId)}`;
}
