// mobile/lib/adventures.ts
// Local (AsyncStorage) completion state for the Adventure Passport. Owner-logged
// and on-device — the checklist is the user's own, so there's no server write,
// no rules change, and nothing asserted about the dog. Map is questId -> doneAt
// (unix ms).

import AsyncStorage from '@react-native-async-storage/async-storage';

export type CompletedMap = Record<string, number>;

const KEY = (dogId: string) => `godoggydate.adventures.${dogId}`;

export async function loadCompleted(dogId: string): Promise<CompletedMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY(dogId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: CompletedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveCompleted(dogId: string, map: CompletedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(dogId), JSON.stringify(map));
  } catch {
    /* non-critical — live in-memory state is the source of truth this session */
  }
}
