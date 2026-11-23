// mobile/lib/dogtypeDiscovery.ts
// Which Dogtypes this owner has met. Your own dog's type always counts; any
// other type is discovered only when your dog mutually matches a dog of that
// type. Stored in the synced progress doc (shared/progress.ts `dogtypes`), so
// the website sees the same collection. Every function is quiet on failure.

import { computeDogtype } from '../../shared/dogtype';
import {
  addDiscovery,
  markSeen,
  normalizeDogtypes,
  progressKeys,
  setOwnType,
  type DogtypeLedger,
} from '../../shared/progress';
import { markProgressDirty, onProgressChange, readStoredJSON, updateStoredJSON } from './progressSync';
import { trackEvent } from './analytics';
import type { MatchItem } from './matches';

const key = (uid: string) => progressKeys.dogtypes(uid);
// Set once the existing matches have been folded in. A live match made before that
// must not turn the first fill into a wave of "New Dogtype" tags.
const filledKey = (uid: string) => `godoggydate.dogtypes.filled.${uid}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Fires after any local discovery change or a sync that may have changed the ledger. */
export function onDiscoveriesChange(listener: () => void): () => void {
  listeners.add(listener);
  const off = onProgressChange(() => listener());
  return () => {
    listeners.delete(listener);
    off();
  };
}

export async function loadDiscoveries(uid: string): Promise<DogtypeLedger> {
  if (!uid) return {};
  try {
    return normalizeDogtypes(await readStoredJSON(key(uid))) ?? {};
  } catch {
    return {};
  }
}

async function write(uid: string, fn: (ledger: DogtypeLedger | undefined) => DogtypeLedger | undefined) {
  try {
    await updateStoredJSON(key(uid), (raw) => {
      const current = normalizeDogtypes(raw);
      const next = fn(current);
      return next === undefined ? undefined : next;
    });
    markProgressDirty(uid);
    notify();
  } catch {
    /* best effort: the next load retries */
  }
}

export async function discoverOwnType(uid: string, ownCode: string): Promise<void> {
  if (!uid || !ownCode) return;
  await write(uid, (l) => (l?.[ownCode]?.own ? undefined : setOwnType(l, ownCode, Date.now())));
}

/** A live match. Returns whether this type is new to you. The entry is saved as seen so no later sheet repeats it. */
export async function discoverFromMatch(
  uid: string,
  d: { code: string; dogId: string; dogName: string; at: number },
): Promise<{ isNew: boolean }> {
  if (!uid || !d.code) return { isNew: false };
  const before = await loadDiscoveries(uid);
  const isNew = !before[d.code] || before[d.code].dogId === null;
  await write(uid, (l) => addDiscovery(l, d.code, { at: d.at, dogId: d.dogId, dogName: d.dogName, seen: true }));
  if (isNew) trackEvent('dogtype_discovered', { source: 'live' });
  return { isNew };
}

/** Existing matches. The very first fill (no met-dog entries yet; the own type doesn't count) is saved as seen (no pop-ups); later ones surface as "New Dogtype". */
export async function discoverFromMatches(
  uid: string,
  dogs: { code: string; dogId: string; dogName: string; at: number }[],
): Promise<void> {
  if (!uid || dogs.length === 0) return;
  let filled = false;
  try {
    filled = (await readStoredJSON(filledKey(uid))) === true;
  } catch {
    filled = false;
  }
  await write(uid, (l) => {
    const firstFill = !filled;
    let next = l;
    let changed = false;
    for (const d of dogs) {
      if (next?.[d.code]?.dogId) continue;
      next = addDiscovery(next, d.code, { at: d.at, dogId: d.dogId, dogName: d.dogName, seen: firstFill });
      changed = true;
      trackEvent('dogtype_discovered', { source: firstFill ? 'first_fill' : 'matches' });
    }
    return changed ? next : undefined;
  });
  if (!filled) {
    try {
      await updateStoredJSON(filledKey(uid), () => true);
    } catch {
      /* the next load fills again, still quietly */
    }
  }
}

export function discoverFromItems(uid: string, items: MatchItem[]): void {
  const dogs: { code: string; dogId: string; dogName: string; at: number }[] = [];
  for (const m of items) {
    const code = m.dog.profile ? computeDogtype(m.dog.profile)?.code : undefined;
    if (code) dogs.push({ code, dogId: m.dog.id, dogName: m.dog.name, at: m.createdAt ?? Date.now() });
  }
  void discoverFromMatches(uid, dogs);
}

export async function markDiscoverySeen(uid: string, code: string): Promise<void> {
  if (!uid) return;
  await write(uid, (l) => (l?.[code] && !l[code].seen ? markSeen(l, code) : undefined));
}
