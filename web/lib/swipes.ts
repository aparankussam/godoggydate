// web/lib/swipes.ts
// Client-side daily swipe counter + subscription check backed by Firestore.
// Paths:
//   users/{uid}/private/swipeCount  → { date: 'YYYY-MM-DD', count: number }
//   users/{uid}/private/subscription → { status: string }

import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { FREE_DAILY_SWIPES } from './stripe';

// ── Date helper ───────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// ── Swipe counter ─────────────────────────────────────────────────────────────

interface SwipeCountDoc {
  date:  string;
  count: number;
}

/**
 * Returns how many swipes the user has used today.
 * Returns 0 on any error (fail open so UX isn't broken by Firestore being offline).
 */
export async function getTodaySwipeCount(uid: string): Promise<number> {
  try {
    const { db } = getFirebase();
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'swipeCount'));
    if (!snap.exists()) return 0;
    const data = snap.data() as SwipeCountDoc;
    // Reset counter if it's a new day
    if (data.date !== today()) return 0;
    return data.count;
  } catch {
    return 0; // fail open — don't gate on Firestore errors
  }
}

/**
 * Increments today's swipe count by 1. Resets if it's a new day.
 */
export async function incrementSwipeCount(uid: string): Promise<void> {
  try {
    const { db } = getFirebase();
    const ref    = doc(db, 'users', uid, 'private', 'swipeCount');
    const snap   = await getDoc(ref);

    if (!snap.exists() || (snap.data() as SwipeCountDoc).date !== today()) {
      // New day (or first ever) — reset
      await setDoc(ref, { date: today(), count: 1 });
    } else {
      await updateDoc(ref, { count: increment(1) });
    }
  } catch {
    // Fail silently — don't break the swipe UX if Firestore is slow
  }
}

// ── Subscription check ────────────────────────────────────────────────────────

interface SubscriptionDoc {
  status?: string;
}

/**
 * Returns true if the user has an active subscription.
 * Fails open (returns false) on any error.
 */
export async function isSubscribed(uid: string): Promise<boolean> {
  try {
    const { db } = getFirebase();
    const snap   = await getDoc(doc(db, 'users', uid, 'private', 'subscription'));
    if (!snap.exists()) return false;
    const data = snap.data() as SubscriptionDoc;
    return data.status === 'active' || data.status === 'trialing';
  } catch {
    return false;
  }
}

// ── Gate check ────────────────────────────────────────────────────────────────

/**
 * Returns true if the user has hit the free daily limit AND is not subscribed.
 * Fails open (returns false) so Firestore errors never block swiping.
 */
export async function isSwipeLimitReached(uid: string): Promise<boolean> {
  try {
    const [count, subscribed] = await Promise.all([
      getTodaySwipeCount(uid),
      isSubscribed(uid),
    ]);
    return !subscribed && count >= FREE_DAILY_SWIPES;
  } catch {
    return false;
  }
}
