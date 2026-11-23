// mobile/lib/dogtypeDiscovery.ts
// Which Dogtypes this owner has met. Your own dog's type always counts; any
// other type is discovered only when your dog mutually matches a dog of that
// type (or you were at the same Pack Day). Stored in the synced progress doc
// (shared/progress.ts: `dogtypes`, `dogtypeDogs`, `dogtypeRevealed`), so the
// website sees the same collection. Every function is quiet on failure.
//
// A matched dog's type is SNAPSHOT the first time we see it (`dogtypeDogs`) and
// that snapshot is what counts: if the other owner later edits their profile
// and the dog's type changes, it neither discovers a new type for you nor
// changes one you already have.

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
import { markProgressDirty, onProgressChange, readStoredJSON, updateStoredJSON } from './progressSync';
import { trackEvent } from './analytics';
import type { MatchItem } from './matches';
import type { SavedDogProfile } from './profile';

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

/** The Dogtype each matched dog had the first time we saw it. */
export async function loadDogSnapshots(uid: string): Promise<DogtypeDogMap> {
  if (!uid) return {};
  try {
    return normalizeDogtypeDogs(await readStoredJSON(progressKeys.dogtypeDogs(uid))) ?? {};
  } catch {
    return {};
  }
}

/** The type to treat a matched dog as: its snapshot when we have one, else its current profile. */
export function effectiveCode(
  snapshots: DogtypeDogMap,
  dogId: string,
  profile: SavedDogProfile | null | undefined,
): string | null {
  return snapshots[dogId]?.code ?? (profile ? computeDogtype(profile)?.code ?? null : null);
}

/** Matched dogs whose type (by snapshot) is `code`. */
export function matchedDogsOfCode(items: MatchItem[], snapshots: DogtypeDogMap, code: string): MatchItem[] {
  const ids = new Set(matchedDogsOfType(snapshots, code));
  return items.filter((m) => ids.has(m.dog.id));
}

async function write(uid: string, fn: (ledger: DogtypeLedger | undefined) => DogtypeLedger | undefined) {
  try {
    await updateStoredJSON(key(uid), (raw) => fn(normalizeDogtypes(raw)));
    markProgressDirty(uid);
    notify();
  } catch {
    /* best effort: the next load retries */
  }
}

type Seen = { code: string; dogId: string; dogName: string; at: number };

/** Snapshot each dog (first sight wins) and return it with the code that now counts. */
async function snapshotAll(uid: string, dogs: Seen[]): Promise<Seen[]> {
  let effective: Record<string, string> = {};
  // A dog already discovered under an older type keeps that type: seed from the ledger first.
  const ledger = await loadDiscoveries(uid);
  try {
    await updateStoredJSON(progressKeys.dogtypeDogs(uid), (raw) => {
      let map = normalizeDogtypeDogs(raw);
      let changed = false;
      for (const [code, e] of Object.entries(ledger)) {
        if (e.dogId && !map?.[e.dogId]) {
          map = snapshotDog(map, e.dogId, code, e.at);
          changed = true;
        }
      }
      for (const d of dogs) {
        const before = map?.[d.dogId];
        map = snapshotDog(map, d.dogId, d.code, d.at);
        if (!before) changed = true;
      }
      effective = Object.fromEntries(dogs.map((d) => [d.dogId, map?.[d.dogId]?.code ?? d.code]));
      return changed ? map : undefined;
    });
  } catch {
    effective = Object.fromEntries(dogs.map((d) => [d.dogId, d.code]));
  }
  markProgressDirty(uid);
  return dogs.map((d) => ({ ...d, code: effective[d.dogId] ?? d.code }));
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
  const [snap] = await snapshotAll(uid, [d]);
  const before = await loadDiscoveries(uid);
  const isNew = !before[snap.code] || before[snap.code].dogId === null;
  await write(uid, (l) => addDiscovery(l, snap.code, { at: snap.at, dogId: snap.dogId, dogName: snap.dogName, seen: true }));
  if (isNew) trackEvent('dogtype_discovered', { source: 'live' });
  return { isNew };
}

/** Existing matches. The very first fill is saved as seen (no pop-ups); later ones surface as "New Dogtype". */
export async function discoverFromMatches(uid: string, dogs: Seen[]): Promise<void> {
  if (!uid || dogs.length === 0) return;
  let filled = false;
  try {
    filled = (await readStoredJSON(filledKey(uid))) === true;
  } catch {
    filled = false;
  }
  const counted = await snapshotAll(uid, dogs);
  await write(uid, (l) => {
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
  if (!filled) {
    try {
      await updateStoredJSON(filledKey(uid), () => true);
    } catch {
      /* the next load fills again, still quietly */
    }
  }
}

export function discoverFromItems(uid: string, items: MatchItem[]): void {
  const dogs: Seen[] = [];
  for (const m of items) {
    const code = m.dog.profile ? computeDogtype(m.dog.profile)?.code : undefined;
    if (code) dogs.push({ code, dogId: m.dog.id, dogName: m.dog.name, at: m.createdAt ?? Date.now() });
  }
  void discoverFromMatches(uid, dogs);
}

/** Dogs you shared a finished Pack Day with. Saved as seen: there is no match row to tag. */
export async function discoverFromPackDay(uid: string, dogs: Seen[]): Promise<void> {
  if (!uid || dogs.length === 0) return;
  const counted = await snapshotAll(uid, dogs);
  await write(uid, (l) => {
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

export async function markDiscoverySeen(uid: string, code: string): Promise<void> {
  if (!uid) return;
  await write(uid, (l) => (l?.[code] && !l[code].seen ? markSeen(l, code) : undefined));
}

// ── The owner's own reveal ───────────────────────────────────────────────────

export async function loadRevealed(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    return normalizeRevealed(await readStoredJSON(progressKeys.dogtypeRevealed(uid))) === true;
  } catch {
    return false;
  }
}

export async function markRevealed(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await updateStoredJSON(progressKeys.dogtypeRevealed(uid), (raw) => (normalizeRevealed(raw) ? undefined : true));
    markProgressDirty(uid);
    notify();
    trackEvent('dogtype_first_reveal');
  } catch {
    /* the reveal can be watched again */
  }
}
