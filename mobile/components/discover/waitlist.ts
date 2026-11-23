// mobile/components/discover/waitlist.ts
// Client side of the local waitlist (firebase/functions/src/waitlist.ts): "Tell me
// when neighbors join". Same callables as web/lib/waitlist.ts. The callable records
// waitlist/{uid} server-side (the collection has no client access at all); this file
// only calls it and remembers on this device that the person joined, so the empty
// state can say so instead of offering the button again.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebase } from '../../lib/firebase';

export interface WaitlistResult {
  /** 1 = first in line for this city. */
  position: number;
  total: number;
  city: string;
  state: string;
  alreadyJoined: boolean;
}

export interface WaitlistMemo {
  uid: string;
  city: string;
  state: string;
  position: number;
  at: number;
}

const MEMO_KEY = 'gdd.waitlist.v1';

export async function readWaitlistMemo(uid: string): Promise<WaitlistMemo | null> {
  try {
    const raw = await AsyncStorage.getItem(MEMO_KEY);
    if (!raw) return null;
    const memo = JSON.parse(raw) as WaitlistMemo;
    return memo && memo.uid === uid && typeof memo.position === 'number' ? memo : null;
  } catch {
    return null; // storage unavailable: the person just sees the button again
  }
}

async function writeWaitlistMemo(memo: WaitlistMemo | null): Promise<void> {
  try {
    if (memo) await AsyncStorage.setItem(MEMO_KEY, JSON.stringify(memo));
    else await AsyncStorage.removeItem(MEMO_KEY);
  } catch {
    /* best effort */
  }
}

/** Join (or re-join: idempotent) the waitlist for the city on the person's own dog profile. */
export async function joinLocalWaitlist(uid: string): Promise<WaitlistResult> {
  const { app } = getFirebase();
  const callable = httpsCallable<Record<string, never>, WaitlistResult>(
    getFunctions(app, 'us-central1'),
    'joinWaitlist',
  );
  const result = (await callable({})).data;
  await writeWaitlistMemo({
    uid,
    city: result.city,
    state: result.state,
    position: result.position,
    at: Date.now(),
  });
  return result;
}

export async function leaveLocalWaitlist(): Promise<void> {
  const { app } = getFirebase();
  await httpsCallable(getFunctions(app, 'us-central1'), 'leaveWaitlist')({});
  await writeWaitlistMemo(null);
}
