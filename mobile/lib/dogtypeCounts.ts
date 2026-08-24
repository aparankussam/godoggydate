// mobile/lib/dogtypeCounts.ts
// Client-side Dogtype census — how many dogs of each of the 16 types actually
// exist on GoDoggyDate right now. This powers the honest "density" hook in the
// CompatExplorer: for a revealed type we can say "N {Type}s on GoDoggyDate"
// using a REAL count, never a fabricated number.
//
// HONESTY: every number here is derived from real dog docs. computeDogtype is
// the same deterministic function the profile card uses, so the census matches
// what each owner sees for their own dog. If a type has zero dogs we say so
// ("None yet — you'd be the first"), we never round up or invent.
//
// SCALE NOTE: this fetches the whole `dogs` collection once (mirroring
// lib/discover.ts's existing getDocs(collection(db,'dogs')) — signed-in clients
// are allowed to read dogs per firestore.rules). That is correct + cheap at
// launch scale (tens–hundreds of dogs). At large scale this should move to a
// maintained counter (e.g. counters/dogtypes incremented by a Cloud Function on
// dog create/update) so the client isn't downloading every dog just to tally —
// but it is deliberately the same pattern discover already relies on today.

import { collection, getDocs } from 'firebase/firestore';
import { computeDogtype, DOGTYPE_CODES } from '../../shared/dogtype';
import type { SavedDogProfile } from '../../shared/profile';
import { getFirebase } from './firebase';

/** A tally of dogs per Dogtype code, plus the total dogs counted. */
export interface DogtypeCounts {
  /** code -> number of dogs of that type. Every one of the 16 codes is a key
   *  (0 when none), so callers can index without an existence check. */
  byCode: Record<string, number>;
  /** Total dogs that resolved to a Dogtype (i.e. had enough profile to type). */
  total: number;
}

function isSeedUserId(id: string): boolean {
  return id.startsWith('user_seed_');
}

function emptyCounts(): DogtypeCounts {
  const byCode: Record<string, number> = {};
  for (const code of DOGTYPE_CODES) byCode[code] = 0;
  return { byCode, total: 0 };
}

/**
 * Fetch every dog once and tally how many fall into each Dogtype.
 *
 * Never throws — on any read/permission error it resolves to an all-zero census
 * so the UI can gracefully show "None yet" rather than break. Seed/demo dogs
 * (user_seed_*) are excluded so the numbers reflect real owners, matching how
 * the discover feed already treats them.
 */
export async function fetchDogtypeCounts(): Promise<DogtypeCounts> {
  try {
    const { db } = getFirebase();
    const snap = await getDocs(collection(db, 'dogs'));

    const counts = emptyCounts();
    for (const docSnap of snap.docs) {
      if (isSeedUserId(docSnap.id)) continue;
      const saved = docSnap.data() as SavedDogProfile;
      const dogtype = computeDogtype(saved);
      if (!dogtype) continue; // too little profile to type — don't count
      // Guard against an unexpected code (impossible for valid poles) so we
      // never write a stray key into the tally.
      if (!(dogtype.code in counts.byCode)) continue;
      counts.byCode[dogtype.code] += 1;
      counts.total += 1;
    }
    return counts;
  } catch {
    return emptyCounts();
  }
}
