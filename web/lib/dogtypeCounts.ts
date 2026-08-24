'use client';
// web/lib/dogtypeCounts.ts
// Client-side Dogtype census: fetch every dog once, compute each one's
// deterministic Dogtype (shared/dogtype.ts computeDogtype), and tally counts by
// 4-letter code. This powers the honest "density" hook in the Compat Explorer —
// a real, usually-small nationwide number per type, never a fabricated one.
//
// HONESTY: counts come from real documents only. Dogs whose profile is too thin
// to compute a type (computeDogtype -> null, e.g. no energyLevel) are simply not
// counted — they inflate nothing. A code with zero real dogs stays zero, and the
// UI shows "None yet — you'd be the first" rather than inventing a number.
//
// SCALE NOTE: this reads the whole `dogs` collection in one getDocs, mirroring
// what web/lib/discover.ts already does (getRealCandidateDogs). It's correct and
// cheap at launch scale (tens/hundreds of dogs) and needs no index or extra
// rules — firestore.rules already allows `dogs` read when signed in. At large
// scale this should move to a maintained per-code counter (e.g. a
// `dogtypeCounts` aggregate doc updated on write) instead of an all-dogs fetch.

import { collection, getDocs } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { computeDogtype } from '../../shared/dogtype';
import type { SavedDogProfile } from './auth';

export interface DogtypeCounts {
  /** Real dogs per 4-letter code. Codes with zero dogs may be absent. */
  byCode: Record<string, number>;
  /** Total dogs that resolved to any Dogtype (the sum of byCode values). */
  total: number;
}

const EMPTY: DogtypeCounts = { byCode: {}, total: 0 };

/**
 * Fetch all dogs once and tally real Dogtype counts client-side.
 * SSR-safe (returns empty on the server) and never throws — on any failure it
 * resolves to an empty census so the caller degrades to "None yet" copy rather
 * than breaking the page.
 */
export async function fetchDogtypeCounts(): Promise<DogtypeCounts> {
  if (typeof window === 'undefined') return EMPTY;

  try {
    const { db } = getFirebase();
    const snap = await getDocs(collection(db, 'dogs'));

    const byCode: Record<string, number> = {};
    let total = 0;

    for (const docSnap of snap.docs) {
      const saved = docSnap.data() as SavedDogProfile;
      const dogtype = computeDogtype(saved);
      if (!dogtype) continue; // too thin to type — counts for nothing
      byCode[dogtype.code] = (byCode[dogtype.code] ?? 0) + 1;
      total += 1;
    }

    return { byCode, total };
  } catch {
    return EMPTY;
  }
}

/** Real count for one code (0 when absent). Handy, honest accessor. */
export function countForCode(counts: DogtypeCounts, code: string): number {
  return counts.byCode[code.toUpperCase()] ?? 0;
}
