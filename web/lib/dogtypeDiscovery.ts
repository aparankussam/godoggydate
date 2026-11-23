// web/lib/dogtypeDiscovery.ts
// Which Dogtypes this owner has met. Twin of mobile/lib/dogtypeDiscovery.ts and
// stored in the same synced progress doc, so the iPhone and the website show one
// collection. Your own dog's type always counts; any other type is discovered
// only by mutually matching a dog of that type (or sharing a finished Pack Day).
// A matched dog's type is snapshotted the first time we see it, so a later
// profile edit on their side never discovers a new type for you. Never throws.

import { computeDogtype } from '../../shared/dogtype';
import {
  addDiscovery,
  markSeen,
  matchedDogsOfType,
  normalizeDogtypeDogs,
  normalizeDogtypes,
  normalizeRevealed,
  progressKeys,
  setOwnType,
  snapshotDog,
  type DogtypeDogMap,
  type DogtypeLedger,
} from '../../shared/progress';
import { markProgressDirty, onProgressChange } from './progressSync';
import { trackEvent } from './analytics';

const key = (uid: string) => progressKeys.dogtypes(uid);
// Set once the existing matches have been folded in (see the mobile twin).
const filledKey = (uid: string) => `godoggydate.dogtypes.filled.${uid}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

type Seen = { code: string; dogId: string; dogName: string; at: number };

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJSON(k: string): unknown {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(k: string, v: unknown): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
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
  return uid ? normalizeDogtypes(readJSON(key(uid))) ?? {} : {};
}

export function loadDogSnapshots(uid: string): DogtypeDogMap {
  return uid ? normalizeDogtypeDogs(readJSON(progressKeys.dogtypeDogs(uid))) ?? {} : {};
}

export function loadRevealed(uid: string): boolean {
  return uid ? normalizeRevealed(readJSON(progressKeys.dogtypeRevealed(uid))) === true : false;
}

/** The type to treat a matched dog as: its snapshot when we have one, else its current profile. */
export function effectiveCode(
  snapshots: DogtypeDogMap,
  dogId: string,
  profile: Parameters<typeof computeDogtype>[0] | null | undefined,
): string | null {
  return snapshots[dogId]?.code ?? (profile ? computeDogtype(profile)?.code ?? null : null);
}

export { matchedDogsOfType };

function write(uid: string, fn: (ledger: DogtypeLedger | undefined) => DogtypeLedger | undefined): void {
  if (!uid) return;
  const current = loadDiscoveries(uid);
  const next = fn(Object.keys(current).length > 0 ? current : undefined);
  if (next === undefined) return;
  if (writeJSON(key(uid), next)) {
    markProgressDirty(uid);
    notify();
  }
}

/** Snapshot each dog (first sight wins) and return it with the code that now counts. */
function snapshotAll(uid: string, dogs: Seen[]): Seen[] {
  let map: DogtypeDogMap | undefined = loadDogSnapshots(uid);
  if (Object.keys(map).length === 0) map = undefined;
  let changed = false;
  for (const d of dogs) {
    if (!map?.[d.dogId]) changed = true;
    map = snapshotDog(map, d.dogId, d.code, d.at);
  }
  if (changed && map) writeJSON(progressKeys.dogtypeDogs(uid), map);
  return dogs.map((d) => ({ ...d, code: map?.[d.dogId]?.code ?? d.code }));
}

export function discoverOwnType(uid: string, ownCode: string): void {
  if (!ownCode) return;
  write(uid, (l) => (l?.[ownCode]?.own ? undefined : setOwnType(l, ownCode, Date.now())));
}

/** A live match. Returns whether this type is new to you. Saved as seen so no later card repeats it. */
export function discoverFromMatch(uid: string, d: Seen): { isNew: boolean } {
  if (!uid || !d.code) return { isNew: false };
  const [snap] = snapshotAll(uid, [d]);
  const before = loadDiscoveries(uid);
  const isNew = !before[snap.code] || before[snap.code].dogId === null;
  write(uid, (l) => addDiscovery(l, snap.code, { at: snap.at, dogId: snap.dogId, dogName: snap.dogName, seen: true }));
  if (isNew) trackEvent('dogtype_discovered', { source: 'live' });
  return { isNew };
}

/** Existing matches: the first fill is saved as seen; later ones are unseen. */
export function discoverFromMatches(uid: string, dogs: Seen[]): void {
  if (!uid || dogs.length === 0) return;
  const filled = hasStorage() && window.localStorage.getItem(filledKey(uid)) === 'true';
  const counted = snapshotAll(uid, dogs);
  write(uid, (l) => {
    const firstFill = !filled;
    let next = l;
    let changed = false;
    for (const d of counted) {
      if (next?.[d.code]?.dogId) continue;
      next = addDiscovery(next, d.code, { at: d.at, dogId: d.dogId, dogName: d.dogName, seen: firstFill });
      changed = true;
      trackEvent('dogtype_discovered', { source: firstFill ? 'first_fill' : 'matches' });
    }
    return changed ? next : undefined;
  });
  if (!filled && hasStorage()) {
    try {
      window.localStorage.setItem(filledKey(uid), 'true');
    } catch {
      /* the next load fills again, still quietly */
    }
  }
}

export function discoverFromProfiles(
  uid: string,
  rows: { dogId: string; profile: Parameters<typeof computeDogtype>[0] | null; name?: string; createdAtMs?: number }[],
): void {
  const dogs: Seen[] = [];
  for (const r of rows) {
    const code = r.profile ? computeDogtype(r.profile)?.code : undefined;
    if (code) dogs.push({ code, dogId: r.dogId, dogName: r.name ?? 'A dog', at: r.createdAtMs ?? Date.now() });
  }
  discoverFromMatches(uid, dogs);
}

/** Dogs you shared a finished Pack Day with. Saved as seen: there is no match row to tag. */
export function discoverFromPackDay(uid: string, dogs: Seen[]): void {
  if (!uid || dogs.length === 0) return;
  const counted = snapshotAll(uid, dogs);
  write(uid, (l) => {
    let next = l;
    let changed = false;
    for (const d of counted) {
      if (next?.[d.code]?.dogId) continue;
      next = addDiscovery(next, d.code, { at: d.at, dogId: d.dogId, dogName: d.dogName, seen: true });
      changed = true;
      trackEvent('dogtype_discovered', { source: 'packday' });
    }
    return changed ? next : undefined;
  });
}

export function markDiscoverySeen(uid: string, code: string): void {
  write(uid, (l) => (l?.[code] && !l[code].seen ? markSeen(l, code) : undefined));
}

export function markRevealed(uid: string): void {
  if (!uid || loadRevealed(uid)) return;
  if (writeJSON(progressKeys.dogtypeRevealed(uid), true)) {
    markProgressDirty(uid);
    notify();
    trackEvent('dogtype_first_reveal');
  }
}
