// web/lib/founding.ts
// Live founding-ladder state for the web app: the public counters/foundingPack
// count (written only by Cloud Functions) and which step of the ladder that
// puts us on. Every $39 offer reads this, so the button only appears once the
// 50 free spots are gone, and never after #150.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { foundingPhase, type FoundingPhase } from '../../shared/founding';

export {
  FOUNDING_FREE_SPOTS,
  FOUNDING_PAID_SPOTS,
  FOUNDING_TOTAL,
  foundingPhase,
  foundingSpotsLeft,
  foundingBadgeLabel,
  type FoundingPhase,
} from '../../shared/founding';

export interface FoundingState {
  /** null while loading, or if the counter can't be read. */
  count: number | null;
  /** null whenever count is null, so a failed read never shows the $39 offer. */
  phase: FoundingPhase | null;
}

export function useFoundingState(): FoundingState {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(
      doc(db, 'counters', 'foundingPack'),
      (snap) => {
        const raw = snap.data()?.count;
        setCount(typeof raw === 'number' && Number.isFinite(raw) ? raw : 0);
      },
      () => setCount(null),
    );
  }, []);

  return { count, phase: count === null ? null : foundingPhase(count) };
}
