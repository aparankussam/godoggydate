'use client';
// web/lib/ratings.ts
// Post-playdate ratings — the missing client half of the deployed
// onRatingCreated trust-score engine (firebase/functions). Doc id matches
// what firestore.rules expects for the duplicate-rating check:
// ratings/{raterId}_{matchId}.

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

export interface SubmitRatingInput {
  matchId: string;
  raterId: string;
  dogId: string; // the OTHER dog being rated
  stars: number; // 1-5
  wouldMeetAgain: boolean;
}

function ratingDocId(raterId: string, matchId: string): string {
  return `${raterId}_${matchId}`;
}

export async function hasRatedPlaydate(raterId: string, matchId: string): Promise<boolean> {
  const { db } = getFirebase();
  try {
    const snap = await getDoc(doc(db, 'ratings', ratingDocId(raterId, matchId)));
    return snap.exists();
  } catch {
    return false; // fail open — worst case we offer to rate again
  }
}

export async function submitPlaydateRating(input: SubmitRatingInput): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'ratings', ratingDocId(input.raterId, input.matchId)), {
    raterId: input.raterId,
    matchId: input.matchId,
    dogId: input.dogId,
    stars: input.stars,
    wouldMeetAgain: input.wouldMeetAgain,
    createdAt: serverTimestamp(),
  });
}
