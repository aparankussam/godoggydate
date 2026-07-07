'use client';
// Web push via FCM. Tokens are stored at users/{uid}/private/push
// (fcmWebTokens) and consumed by the Cloud Function push triggers, which
// prune stale tokens on send. Requires NEXT_PUBLIC_FIREBASE_VAPID_KEY
// (Firebase console → Project settings → Cloud Messaging → Web Push
// certificates) — everything no-ops gracefully without it.

import { arrayUnion, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getFirebase } from '../shared/utils/firebase';

const DISMISSED_KEY = 'godoggydate.push.bannerDismissed';

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim());
}

/** Whether to offer the enable-notifications banner right now. */
export async function shouldOfferPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !isPushConfigured()) return false;
  if (!('Notification' in window) || Notification.permission !== 'default') return false;
  try {
    if (window.localStorage.getItem(DISMISSED_KEY) === '1') return false;
  } catch { /* storage unavailable — still offer */ }
  return isSupported().catch(() => false);
}

export function dismissPushBanner(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch { /* best effort */ }
}

/**
 * Request permission and register this browser's FCM token.
 * Returns true when a token was stored.
 */
export async function enablePushNotifications(userId: string): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey || !(await isSupported().catch(() => false))) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const { app, db } = getFirebase();
    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    await setDoc(doc(db, 'users', userId, 'private', 'push'), {
      fcmWebTokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.warn('Web push registration failed', error);
    return false;
  }
}
