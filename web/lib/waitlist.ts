'use client';
// web/lib/waitlist.ts
// Client side of the local waitlist (firebase/functions/src/waitlist.ts): "tell me
// when neighbors join". The callable records waitlist/{uid} server-side (the
// collection has no client access at all); this file only calls it and remembers,
// in this browser, that the person already joined so the empty state can say so.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '../shared/utils/firebase';

export interface WaitlistResult {
  /** 1 = first in line for this city. */
  position: number;
  total: number;
  city: string;
  state: string;
  alreadyJoined: boolean;
}

const MEMO_KEY = 'gdd.waitlist.v1';

interface Memo { uid: string; city: string; state: string; position: number; at: number }

export function readWaitlistMemo(uid: string): Memo | null {
  try {
    const raw = window.localStorage.getItem(MEMO_KEY);
    if (!raw) return null;
    const memo = JSON.parse(raw) as Memo;
    return memo && memo.uid === uid && typeof memo.position === 'number' ? memo : null;
  } catch {
    return null; // storage blocked: the person just sees the button again
  }
}

function writeWaitlistMemo(memo: Memo | null): void {
  try {
    if (memo) window.localStorage.setItem(MEMO_KEY, JSON.stringify(memo));
    else window.localStorage.removeItem(MEMO_KEY);
  } catch { /* best effort */ }
}

/** Join (or re-join: idempotent) the waitlist for the city on the person's own dog profile. */
export async function joinLocalWaitlist(uid: string): Promise<WaitlistResult> {
  const { app } = getFirebase();
  const callable = httpsCallable<Record<string, never>, WaitlistResult>(getFunctions(app, 'us-central1'), 'joinWaitlist');
  const result = (await callable({})).data;
  writeWaitlistMemo({ uid, city: result.city, state: result.state, position: result.position, at: Date.now() });
  return result;
}

export async function leaveLocalWaitlist(): Promise<void> {
  const { app } = getFirebase();
  await httpsCallable(getFunctions(app, 'us-central1'), 'leaveWaitlist')({});
  writeWaitlistMemo(null);
}
