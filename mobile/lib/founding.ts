// mobile/lib/founding.ts
// Mirrors web/lib/founding.ts: live founding-ladder state from the public
// counters/foundingPack count (written only by Cloud Functions). The $39 offer
// reads this, so it only appears once the 50 free spots are gone, and never
// after #150.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { foundingPhase, type FoundingPhase } from '../../shared/founding';

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
