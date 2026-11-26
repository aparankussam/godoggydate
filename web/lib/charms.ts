'use client';
// web/lib/charms.ts
// Which charms this browser has earned. Mirrors mobile/lib/charms.ts.
// shortcut: kept in localStorage per browser, not synced with the app; move into shared/progress if owners ask.

import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from './analytics';

const key = (uid: string) => `charms:${uid}`;

function load(uid: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(uid)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useCharms(uid: string | undefined) {
  const [earned, setEarned] = useState<string[]>([]);

  useEffect(() => { setEarned(uid ? load(uid) : []); }, [uid]);

  const earn = useCallback((id: string) => {
    if (!uid) return;
    const ids = load(uid);
    if (ids.includes(id)) return;
    const next = [...ids, id];
    setEarned(next);
    trackEvent('charm_earned', { charm: id, total: next.length });
    try { window.localStorage.setItem(key(uid), JSON.stringify(next)); } catch { /* private window */ }
  }, [uid]);

  return { earned, earn };
}
