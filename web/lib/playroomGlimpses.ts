// web/lib/playroomGlimpses.ts
// The small, honest previews on the Playroom cards: counts and dates read from
// the owner's own data (boops, stamps, Barkle history, the next occasion). Twin of
// mobile/lib/playroomGlimpses.ts. A card with nothing to show says what would
// start it, never a made-up number.

import { useEffect, useState } from 'react';
import { loadAllTime, nextMilestone, unlockedStickers } from './boops';
import { loadAdventures } from './progressSync';
import { pickLetterMilestone } from './letter';
import { adventuresFor } from '../../shared/adventures';
import { puzzleNumberForDate } from '../../shared/barkle';
import { barkleStreak, normalizeBarkle, progressKeys } from '../../shared/progress';
import type { SavedDogProfile } from './auth';

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

function readHistory(uid: string): unknown {
  try {
    const raw = window.localStorage.getItem(progressKeys.barkleHistory(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function usePlayroomGlimpses(uid: string | undefined, profile: SavedDogProfile | null): PlayroomGlimpses {
  const [data, setData] = useState<PlayroomGlimpses>(EMPTY);

  useEffect(() => {
    if (!uid || !profile) return;
    const boops = loadAllTime(uid);
    const next = nextMilestone(boops);
    setData({
      boops,
      stickers: unlockedStickers(boops).length,
      nextStickerAt: next ? next.count : null,
      stamped: Object.keys(loadAdventures(uid) ?? {}).length,
      stampTotal: adventuresFor(profile).length,
      streak: barkleStreak(normalizeBarkle(readHistory(uid)), puzzleNumberForDate()),
      letterLine: letterLineFor(profile),
    });
  }, [uid, profile]);

  return data;
}
