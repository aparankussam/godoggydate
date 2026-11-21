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
// SCALE NOTE: counting every dog's type needs every dog document, so this is the
// expensive read it always was — but it used to run on EVERY Profile visit and
// every Compat Explorer mount. The census barely moves in a day, so the result is
// cached in localStorage for CENSUS_TTL_MS (and shared between components that ask
// at the same time), and the read is capped at CENSUS_DOC_LIMIT documents. Past
// the cap `capped` is set and callers say "at least N" instead of presenting a
// partial tally as a total. At large scale this should move to a maintained
// per-code counter (a `dogtypeCounts` aggregate doc updated on write).

import { collection, getDocs, limit, query } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { computeDogtype } from '../../shared/dogtype';
import { isProfileComplete } from './auth';
import type { SavedDogProfile } from './auth';

/** Placeholder/seed docs the swipe feed excludes — must not inflate the census. */
function isSeededDogId(id: string): boolean {
  return id.startsWith('UID_') || id.startsWith('user_seed_');
}

export interface DogtypeCounts {
  /** Real dogs per 4-letter code. Codes with zero dogs may be absent. */
  byCode: Record<string, number>;
  /** Total dogs that resolved to any Dogtype (the sum of byCode values). */
  total: number;
  /** True when the read hit CENSUS_DOC_LIMIT: the numbers are "at least", not exact. */
  capped?: boolean;
}

const EMPTY: DogtypeCounts = { byCode: {}, total: 0 };

export const CENSUS_TTL_MS = 12 * 60 * 60 * 1000;
export const CENSUS_DOC_LIMIT = 1000;
const CACHE_KEY = 'gdd.dogtypeCounts.v1';

let inflight: Promise<DogtypeCounts> | null = null;
let memo: { at: number; counts: DogtypeCounts } | null = null;

function readCached(): { at: number; counts: DogtypeCounts } | null {
  if (memo) return memo;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; counts?: DogtypeCounts };
    if (typeof parsed.at !== 'number' || !parsed.counts || typeof parsed.counts.total !== 'number') return null;
    memo = { at: parsed.at, counts: parsed.counts };
    return memo;
  } catch {
    return null; // storage blocked or corrupt: just read fresh
  }
}

function writeCached(counts: DogtypeCounts): void {
  memo = { at: Date.now(), counts };
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(memo));
  } catch { /* storage blocked: the in-memory copy still serves this tab */ }
}

/**
 * Tally real Dogtype counts client-side, from a cache that lasts CENSUS_TTL_MS.
 * SSR-safe (returns empty on the server) and never throws — on any failure it
 * resolves to an empty census so the caller degrades to "None yet" copy rather
 * than breaking the page.
 */
export function fetchDogtypeCounts(): Promise<DogtypeCounts> {
  if (typeof window === 'undefined') return Promise.resolve(EMPTY);
  const cached = readCached();
  if (cached && Date.now() - cached.at < CENSUS_TTL_MS) return Promise.resolve(cached.counts);
  if (!inflight) {
    inflight = readCensus()
      .then((counts) => {
        // A failed read is not cached: the next visit tries again.
        if (counts !== EMPTY) writeCached(counts);
        return counts;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

async function readCensus(): Promise<DogtypeCounts> {
  try {
    const { db } = getFirebase();
    const snap = await getDocs(query(collection(db, 'dogs'), limit(CENSUS_DOC_LIMIT)));
    // Answered from the offline cache only: not a census.
    if (snap.metadata.fromCache) return EMPTY;

    const byCode: Record<string, number> = {};
    let total = 0;

    for (const docSnap of snap.docs) {
      // Mirror the discover feed's real-dog filter so the census counts only
      // dogs a user could actually meet — never seeded/placeholder docs (which
      // would fabricate "N on GoDoggyDate" if prod is ever seeded) and never
      // incomplete profiles that don't appear in anyone's deck.
      if (isSeededDogId(docSnap.id)) continue;
      const saved = docSnap.data() as SavedDogProfile;
      if (!isProfileComplete(saved)) continue;
      const dogtype = computeDogtype(saved);
      if (!dogtype) continue; // too thin to type — counts for nothing
      byCode[dogtype.code] = (byCode[dogtype.code] ?? 0) + 1;
      total += 1;
    }

    return { byCode, total, ...(snap.size >= CENSUS_DOC_LIMIT ? { capped: true } : {}) };
  } catch {
    return EMPTY;
  }
}

/** Real count for one code (0 when absent). Handy, honest accessor. */
export function countForCode(counts: DogtypeCounts, code: string): number {
  return counts.byCode[code.toUpperCase()] ?? 0;
}
