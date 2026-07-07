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
const DISMISSED_BLOCKED_KEY = 'godoggydate.push.blockedBannerDismissed';

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim());
}

export type PushBannerState = 'none' | 'offer' | 'blocked';

/**
 * What (if anything) the notifications banner should show right now.
 * 'blocked' surfaces a fix-it hint instead of silently disappearing forever
 * — a permission denial otherwise looks identical to "not interested" to
 * the app, and the user has no idea why push never arrives.
 */
export async function getPushBannerState(): Promise<PushBannerState> {
  if (typeof window === 'undefined' || !isPushConfigured()) return 'none';
  if (!('Notification' in window)) return 'none';
  if (!(await isSupported().catch(() => false))) return 'none';

  if (Notification.permission === 'denied') {
    try {
      if (window.localStorage.getItem(DISMISSED_BLOCKED_KEY) === '1') return 'none';
    } catch { /* storage unavailable — still offer */ }
    return 'blocked';
  }

  if (Notification.permission !== 'default') return 'none';
  try {
    if (window.localStorage.getItem(DISMISSED_KEY) === '1') return 'none';
  } catch { /* storage unavailable — still offer */ }
  return 'offer';
}

export function dismissBlockedPushBanner(): void {
  try {
    window.localStorage.setItem(DISMISSED_BLOCKED_KEY, '1');
  } catch { /* best effort */ }
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
