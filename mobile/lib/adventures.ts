// mobile/lib/adventures.ts
// Completion state for the Adventure Passport. Owner-logged — the checklist is
// the user's own, so nothing is asserted about the dog. Saved in AsyncStorage
// and synced with the website by lib/progressSync. The screens see a
// questId -> doneAt (unix ms) map; storage keeps a small per-quest toggle
// ledger (shared/progress.ts) so an unstamp on one device wins over the older
// stamp on another instead of coming back on the next sync.

import {
  adventuresFromLocal,
  adventuresToLocal,
  applyCompletedChange,
  completedFromLedger,
  progressKeys,
} from '../../shared/progress';
import { markProgressDirty, readStoredJSON, updateStoredJSON } from './progressSync';

export type CompletedMap = Record<string, number>;

const KEY = progressKeys.adventures;

// The map the screen last loaded or saved, per dog. A save applies only the
// quests the screen changed since then, so a stamp that arrived by sync while
// the screen was open isn't undone by the screen's older copy.
const lastSeen = new Map<string, CompletedMap>();

export async function loadCompleted(dogId: string): Promise<CompletedMap> {
  try {
    const map = completedFromLedger(adventuresFromLocal(await readStoredJSON(KEY(dogId))));
    lastSeen.set(dogId, { ...map });
    return map;
  } catch {
    return {};
  }
}

export async function saveCompleted(dogId: string, map: CompletedMap): Promise<void> {
  // Taken now, in call order, so back-to-back saves each apply only their own toggle.
  const before = lastSeen.get(dogId);
  lastSeen.set(dogId, { ...map });
  const now = Date.now();
  try {
    await updateStoredJSON(KEY(dogId), (raw) => {
      const ledger = adventuresFromLocal(raw);
      const next = applyCompletedChange(ledger, before ?? completedFromLedger(ledger), map, now);
      return next ? adventuresToLocal(next) : undefined;
    });
    markProgressDirty(dogId);
  } catch {
    /* non-critical — live in-memory state is the source of truth this session */
  }
}
