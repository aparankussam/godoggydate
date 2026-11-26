// mobile/lib/charms.ts
// The Collar of Charms: every Playroom toy you try puts its charm on your dog's
// collar. Locked charms show as blanks, which is the nudge to go try the rest.
// A charm marks only that you opened the toy, nothing about the dog.
// shortcut: kept in AsyncStorage on this device, not synced; move into shared/progress if owners switch phones.

import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, type Href } from 'expo-router';
import { trackEvent } from './analytics';
import { CHARM_LIST, charmLabel, charmVoiceLine, nextCharm as pickNext, pickOfDay, type CharmInfo } from '../../shared/charms';

export interface Charm extends CharmInfo {
  href: Href;
}

const treat = (id: string): Href => ({ pathname: '/(tabs)/playroom', params: { treat: id } });
const panel = (id: string): Href => ({ pathname: '/(tabs)/playroom', params: { panel: id } });

const HREFS: Record<string, Href> = {
  barkle: '/fun/barkle',
  snoot: '/fun/snoot',
  'sticker-studio': '/fun/sticker-studio',
  roast: treat('roast'),
  wanted: '/fun/wanted',
  texts: treat('texts'),
  card: panel('card'),
  apology: treat('apology'),
  adventures: '/fun/adventures',
  review: treat('review'),
  excuse: '/fun/excuse',
  quiz: treat('quiz'),
  plaque: treat('plaque'),
  letter: panel('letter'),
  lifestage: treat('lifestage'),
};

export const CHARMS: Charm[] = CHARM_LIST.map((c) => ({ ...c, href: HREFS[c.id] }));

export { charmLabel, charmVoiceLine };

export const nextCharm = (earned: string[], skip?: string): Charm | null => pickNext(CHARMS, earned, skip);

/** The toy featured on today's Today card: one untried toy, same for every
 *  owner today. `barkle` is excluded since it already has its own row. */
export const todaysPick = (earned: string[]): Charm | null => pickOfDay(CHARMS, earned, ['barkle']);

const key = (uid: string) => `charms:${uid}`;

async function load(uid: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Earned charm ids, reloaded each time the screen comes into focus, plus a way to earn one. */
export function useCharms(uid: string | undefined) {
  const [earned, setEarned] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return undefined;
      let cancelled = false;
      load(uid).then((ids) => { if (!cancelled) setEarned(ids); });
      return () => { cancelled = true; };
    }, [uid]),
  );

  const earn = useCallback(async (id: string) => {
    if (!uid) return;
    const ids = await load(uid);
    if (ids.includes(id)) return;
    const next = [...ids, id];
    setEarned(next);
    trackEvent('charm_earned', { charm: id, total: next.length });
    AsyncStorage.setItem(key(uid), JSON.stringify(next)).catch(() => {});
  }, [uid]);

  /** Earns the charm and opens its toy. */
  const go = useCallback((charm: Charm) => {
    void earn(charm.id);
    router.push(charm.href);
  }, [earn]);

  return { earned, earn, go };
}
