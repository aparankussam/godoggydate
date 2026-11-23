// mobile/lib/playroomGlimpses.ts
// The small, honest previews on the Playroom cards: counts and dates read from
// the owner's own data (boops, stamps, Barkle history, the next occasion). A card
// with nothing to show says what would start it, never a made-up number.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { loadBoopAllTime, nextMilestone, unlockedStickers } from './boops';
import { loadCompleted } from './adventures';
import { pickLetterMilestone } from './letter';
import { readStoredJSON } from './progressSync';
import { adventuresFor } from '../../shared/adventures';
import { puzzleNumberForDate } from '../../shared/barkle';
import { barkleStreak, normalizeBarkle, progressKeys } from '../../shared/progress';
import type { SavedDogProfile } from './profile';

export interface PlayroomGlimpses {
  boops: number;
  stickers: number;
  nextStickerAt: number | null;
  stamped: number;
  stampTotal: number;
  streak: { current: number; best: number; yesterdaySolved: boolean | null };
  letterLine: string;
}

const EMPTY: PlayroomGlimpses = {
  boops: 0,
  stickers: 0,
  nextStickerAt: null,
  stamped: 0,
  stampTotal: 0,
  streak: { current: 0, best: 0, yesterdaySolved: null },
  letterLine: '',
};

function letterLineFor(profile: SavedDogProfile): string {
  const name = profile.name?.trim() || 'Your dog';
  const m = pickLetterMilestone(profile);
  if (!m) return 'Add Gotcha Day or a birthday to get one';
  const kind = m.kind === 'gotcha' ? 'Gotcha Day' : 'birthday';
  const when = m.isActive ? 'today' : m.daysUntil === 1 ? 'tomorrow' : `in ${m.daysUntil} days`;
  return `${name}'s ${kind} letter is ready ${when}`;
}

export function usePlayroomGlimpses(uid: string | undefined, profile: SavedDogProfile | null): PlayroomGlimpses {
  const [data, setData] = useState<PlayroomGlimpses>(EMPTY);

  useFocusEffect(
    useCallback(() => {
      if (!uid || !profile) return undefined;
      let cancelled = false;
      (async () => {
        const [boops, done, history] = await Promise.all([
          loadBoopAllTime(uid).catch(() => 0),
          loadCompleted(uid).catch(() => ({}) as Record<string, number>),
          readStoredJSON(progressKeys.barkleHistory(uid)).catch(() => null),
        ]);
        if (cancelled) return;
        const next = nextMilestone(boops);
        setData({
          boops,
          stickers: unlockedStickers(boops).length,
          nextStickerAt: next ? next.count : null,
          stamped: Object.keys(done ?? {}).length,
          stampTotal: adventuresFor(profile).length,
          streak: barkleStreak(normalizeBarkle(history), puzzleNumberForDate()),
          letterLine: letterLineFor(profile),
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [uid, profile]),
  );

  return data;
}
