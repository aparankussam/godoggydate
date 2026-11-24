// mobile/lib/charms.ts
// The Collar of Charms: every Playroom toy you try puts its charm on your dog's
// collar. Locked charms show as blanks, which is the nudge to go try the rest.
// A charm marks only that you opened the toy, nothing about the dog.
// shortcut: kept in AsyncStorage on this device, not synced; move into shared/progress if owners switch phones.

import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, type Href } from 'expo-router';
import { trackEvent } from './analytics';

export interface Charm {
  id: string;
  emoji: string;
  /** `{name}` is replaced with the dog's name. */
  label: string;
  href: Href;
}

const treat = (id: string): Href => ({ pathname: '/(tabs)/playroom', params: { treat: id } });
const panel = (id: string): Href => ({ pathname: '/(tabs)/playroom', params: { panel: id } });

// Order is the order "next charm" suggests them in: quick toys first.
export const CHARMS: Charm[] = [
  { id: 'barkle', emoji: '🧩', label: 'Barkle', href: '/fun/barkle' },
  { id: 'snoot', emoji: '👃', label: 'Snoot Boop', href: '/fun/snoot' },
  { id: 'sticker-studio', emoji: '🎨', label: 'Sticker Studio', href: '/fun/sticker-studio' },
  { id: 'roast', emoji: '🔥', label: 'Roast {name}', href: treat('roast') },
  { id: 'wanted', emoji: '🤠', label: 'Wanted Poster', href: '/fun/wanted' },
  { id: 'texts', emoji: '💬', label: 'Texts from {name}', href: treat('texts') },
  { id: 'card', emoji: '🃏', label: 'Trading card', href: panel('card') },
  { id: 'apology', emoji: '🙏', label: 'Notes-App Apology', href: treat('apology') },
  { id: 'adventures', emoji: '🗺️', label: 'Adventure Passport', href: '/fun/adventures' },
  { id: 'review', emoji: '⭐', label: 'My Human Review', href: treat('review') },
  { id: 'excuse', emoji: '📝', label: 'Excuse Note', href: '/fun/excuse' },
  { id: 'quiz', emoji: '❓', label: 'Dog quiz', href: treat('quiz') },
  { id: 'plaque', emoji: '🏅', label: 'Employee of the Month', href: treat('plaque') },
  { id: 'letter', emoji: '💌', label: 'A letter from {name}', href: panel('letter') },
  { id: 'lifestage', emoji: '🎂', label: 'Life stage', href: treat('lifestage') },
];

export const charmLabel = (charm: Charm, dogName: string) => charm.label.replace('{name}', dogName);

/** The first charm not yet on the collar, skipping the toy you're in. */
export function nextCharm(earned: string[], skip?: string): Charm | null {
  return CHARMS.find((c) => c.id !== skip && !earned.includes(c.id)) ?? null;
}

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
