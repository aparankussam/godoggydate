// web/lib/dogtypeDiscovery.ts
// Which Dogtypes this owner has met. Twin of mobile/lib/dogtypeDiscovery.ts and
// stored in the same synced progress doc, so the iPhone and the website show one
// collection. Your own dog's type always counts; any other type is discovered
// only by mutually matching a dog of that type. Never throws.

import { computeDogtype } from '../../shared/dogtype';
import {
  addDiscovery,
  markSeen,
  normalizeDogtypes,
  progressKeys,
  setOwnType,
  type DogtypeLedger,
} from '../../shared/progress';
import { markProgressDirty, onProgressChange } from './progressSync';

const key = (uid: string) => progressKeys.dogtypes(uid);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function onDiscoveriesChange(listener: () => void): () => void {
  listeners.add(listener);
  const off = onProgressChange(() => listener());
  return () => {
    listeners.delete(listener);
    off();
  };
}

export function loadDiscoveries(uid: string): DogtypeLedger {
  if (!hasStorage() || !uid) return {};
  try {
    const raw = window.localStorage.getItem(key(uid));
    return raw ? normalizeDogtypes(JSON.parse(raw)) ?? {} : {};
  } catch {
    return {};
  }
}

function write(uid: string, fn: (ledger: DogtypeLedger | undefined, firstFill: boolean) => DogtypeLedger | undefined): void {
  if (!hasStorage() || !uid) return;
  try {
    const current = loadDiscoveries(uid);
    const hasCurrent = Object.keys(current).length > 0;
    const firstFill = !hasCurrent || !Object.values(current).some((e) => e.dogId !== null);
    const next = fn(hasCurrent ? current : undefined, firstFill);
    if (next === undefined) return;
    window.localStorage.setItem(key(uid), JSON.stringify(next));
    markProgressDirty(uid);
    notify();
  } catch {
    /* private mode / quota: the collection degrades to nothing */
  }
}

export function discoverOwnType(uid: string, ownCode: string): void {
  if (!ownCode) return;
  write(uid, (l) => (l?.[ownCode]?.own ? undefined : setOwnType(l, ownCode, Date.now())));
}

/** Existing matches: the first fill is saved as seen; later ones are unseen. */
export function discoverFromMatches(
  uid: string,
  dogs: { code: string; dogId: string; dogName: string; at: number }[],
): void {
  if (dogs.length === 0) return;
  write(uid, (l, firstFill) => {
    let next = l;
    let changed = false;
    for (const d of dogs) {
      if (next?.[d.code]?.dogId) continue;
      next = addDiscovery(next, d.code, { at: d.at, dogId: d.dogId, dogName: d.dogName, seen: firstFill });
      changed = true;
    }
    return changed ? next : undefined;
  });
}

export function discoverFromProfiles(
  uid: string,
  rows: { dogId: string; profile: Parameters<typeof computeDogtype>[0] | null; name?: string; createdAtMs?: number }[],
): void {
  const dogs: { code: string; dogId: string; dogName: string; at: number }[] = [];
  for (const r of rows) {
    const code = r.profile ? computeDogtype(r.profile)?.code : undefined;
    if (code) dogs.push({ code, dogId: r.dogId, dogName: r.name ?? 'A dog', at: r.createdAtMs ?? Date.now() });
  }
  discoverFromMatches(uid, dogs);
}

export function markDiscoverySeen(uid: string, code: string): void {
  write(uid, (l) => (l?.[code] && !l[code].seen ? markSeen(l, code) : undefined));
}
