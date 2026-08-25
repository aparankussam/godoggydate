// shared/utils/matchingEngine.ts
// GoDoggyDate Compatibility Engine v1.1
// Weights: breed 30% | size 20% | energy 15% | good-with 15% | play style 10% | health 5% | distance 5%

import type { DogProfile, CompatibilityResult, MatchQuality } from '../types';
import { resolveBreed, type BreedGroup } from '../types/breeds';

const SIZE_VALUE: Record<string, number> = { S: 1, M: 2, L: 3, XL: 4 };

// ─── UNSAFE PAIRING DETECTION ─────────────────────────────────────────────────
// Exported so the pre-meetup Heads-Up card can show the SAME crossings the score
// was computed from, rather than a second, hand-maintained list that drifts.
export function detectUnsafePairings(a: DogProfile, b: DogProfile): string[] {
  const warnings: string[] = [];

  // Check notGoodWith crossings
  const aSize = a.size;
  if (b.notGoodWith.includes('small dogs') && aSize === 'S') {
    warnings.push('Not ideal with small dogs');
  }
  if (b.notGoodWith.includes('large dogs') && (aSize === 'L' || aSize === 'XL')) {
    warnings.push('Not ideal with large dogs');
  }
  if (b.notGoodWith.includes('high-energy dogs') && a.energyLevel > 80) {
    warnings.push('Prefers calmer dogs');
  }
  if (b.notGoodWith.includes('puppies') && a.age === 'puppy') {
    warnings.push('Not ideal with puppies');
  }
  if (b.behaviorFlags?.includes('needs slow introduction') && a.energyLevel > 75) {
    warnings.push('Needs a slow introduction');
  }
  if (b.behaviorFlags?.includes('resource guarding') && a.playStyles?.includes('loves fetch 🎾')) {
    warnings.push('May have resource guarding – no toy sharing');
  }

  return warnings;
}

// ─── SIZE SCORE (20%) ─────────────────────────────────────────────────────────
function calcSizeScore(a: DogProfile, b: DogProfile): number {
  const diff = Math.abs(SIZE_VALUE[a.size] - SIZE_VALUE[b.size]);
  if (diff === 0) return 20;
  if (diff === 1) return 15;
  if (diff === 2) return 8;
  return 2; // XL vs S – potential safety concern
}

// ─── ENERGY SCORE (15%) ───────────────────────────────────────────────────────
function calcEnergyScore(a: DogProfile, b: DogProfile): number {
  const diff = Math.abs(a.energyLevel - b.energyLevel);
  if (diff < 10) return 15;
  if (diff < 20) return 12;
  if (diff < 35) return 9;
  if (diff < 50) return 5;
  return 2;
}

// ─── GOOD-WITH SCORE (15%) ────────────────────────────────────────────────────
function calcGoodWithScore(a: DogProfile, b: DogProfile): number {
  let score = 7; // neutral baseline

  // Check if b is explicitly good with a's type
  const aIsSmall  = a.size === 'S';
  const aIsLarge  = a.size === 'L' || a.size === 'XL';
  const aIsCalm   = a.energyLevel < 40;
  const aIsEnergy = a.energyLevel > 75;
  const aIsPuppy  = a.age === 'puppy';

  // Coalesce to [] defensively — a malformed/legacy doc missing this array must
  // never throw here and take down the whole feed (see calcPlayStyleScore).
  const bGoodWith = b.goodWith ?? [];
  if (aIsSmall  && bGoodWith.includes('small dogs'))         score += 8;
  if (aIsLarge  && bGoodWith.includes('large dogs'))         score += 8;
  if (aIsCalm   && bGoodWith.includes('calm dogs'))          score += 6;
  if (aIsEnergy && bGoodWith.includes('high-energy dogs'))   score += 6;
  if (aIsPuppy  && bGoodWith.includes('puppies'))            score += 6;
  if (bGoodWith.includes('all dogs'))                        score += 4;

  return Math.min(15, score);
}

// ─── PLAY STYLE SCORE (10%) ───────────────────────────────────────────────────
function calcPlayStyleScore(a: DogProfile, b: DogProfile): { score: number; sharedStyles: string[] } {
  const aStyles = a.playStyles ?? [];
  const bStyles = b.playStyles ?? [];
  const shared = aStyles.filter(s => bStyles.includes(s));
  let score: number;
  if (shared.length >= 3) score = 10;
  else if (shared.length === 2) score = 9;
  else if (shared.length === 1) score = 7;
  else score = 3;
  return { score, sharedStyles: shared };
}

// ─── BREED SCORE (30%) ────────────────────────────────────────────────────────
// Resolves each dog's free-text breed string against the full shared/types/breeds.ts
// catalogue (via resolveBreed's exact/substring matching — see there for why a plain
// Record<string,string> lookup silently mis-scored most real breeds and every mix).
const GROUP_COMPAT: Record<BreedGroup, BreedGroup[]> = {
  sporting:       ['sporting', 'herding', 'working', 'hound'],
  herding:        ['herding', 'sporting', 'working'],
  hound:          ['hound', 'sporting', 'non-sporting'],
  working:        ['working', 'sporting', 'herding'],
  'non-sporting': ['non-sporting', 'toy', 'hound'],
  toy:            ['toy', 'non-sporting'],
  terrier:        ['terrier', 'hound', 'mixed'],
  mixed:          ['mixed', 'sporting', 'herding', 'hound', 'working', 'non-sporting', 'toy', 'terrier'],
};

function calcBreedScore(a: DogProfile, b: DogProfile): number {
  const ga = resolveBreed(a.breed).group;
  const gb = resolveBreed(b.breed).group;
  if (ga === gb) return 30; // Same group (or same exact breed) – excellent
  if (GROUP_COMPAT[ga]?.includes(gb)) return 22;
  return 12; // Different, non-adjacent groups – might need introductions
}

// ─── HEALTH SCORE (5%) ────────────────────────────────────────────────────────
function calcHealthScore(b: DogProfile): number {
  let score = 0;
  if (b.vaccinated) score += 3;
  if (b.vetChecked) score += 2;
  return score;
}

// ─── DISTANCE SCORE (5%) ─────────────────────────────────────────────────────
function calcDistanceScore(distanceMiles: number): number {
  // discover.ts's milesBetween returns the sentinel -1 when either dog has no
  // lat/lng (coords only arrive via an optional geolocation prompt, and BOTH
  // dogs need them — so "unknown" is the common path, not the edge case).
  // Without this guard -1 falls through to `< 0.3` and scores the MAXIMUM:
  // an unknown distance was scoring as "closer than 0.3 miles".
  if (!(distanceMiles >= 0)) return 0;
  if (distanceMiles < 0.3)  return 5;
  if (distanceMiles < 0.75) return 4;
  if (distanceMiles < 1.5)  return 3;
  if (distanceMiles < 3)    return 2;
  return 1;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function calculateCompatibility(
  userDog: DogProfile,
  candidate: DogProfile,
  distanceMiles: number = 1
): CompatibilityResult {
  const reasons: string[] = [];

  // Scores
  const breedScore    = calcBreedScore(userDog, candidate);
  const sizeScore     = calcSizeScore(userDog, candidate);
  const energyScore   = calcEnergyScore(userDog, candidate);
  const goodWithScore = calcGoodWithScore(userDog, candidate);
  const { score: playScore, sharedStyles } = calcPlayStyleScore(userDog, candidate);
  const healthScore   = calcHealthScore(candidate);
  const distScore     = calcDistanceScore(distanceMiles);

  // Penalty from unsafe pairings
  const warnings = detectUnsafePairings(userDog, candidate);
  // Also check reverse
  const reverseWarnings = detectUnsafePairings(candidate, userDog);
  const allWarnings = [...new Set([...warnings, ...reverseWarnings])];
  // Diminishing, not linear. A flat −15 each is a tax on honesty: the owner who
  // truthfully declares three things about their dog was scored 45 points below
  // the one who declared nothing, and at this density that can empty their feed.
  // The first crossing carries most of the signal; later ones add less. Still
  // monotonic (more crossings always scores lower), just not a spiral — and the
  // warnings themselves are now surfaced in full by every consumer, so the score
  // no longer has to be the thing that carries the caution.
  const penalty = allWarnings.length === 0 ? 0 : 15 + (allWarnings.length - 1) * 8;

  // Raw score
  const raw = breedScore + sizeScore + energyScore +
              goodWithScore + playScore + healthScore + distScore - penalty;

  // The axes are weighted to sum to 100, so `raw` is already on a 0-100 scale.
  // The old line divided by that sum (an identity op) and then clamped to 30-99 —
  // the clamp was its only real effect. Since `penalty` is 15 per warning, raw goes
  // deeply negative, and a raw of -4 and a raw of 30 both displayed as "30". That
  // floor existed purely to make bad numbers look presentable. Clamp to the honest
  // range instead. (This does not move the `score < 45` blocked boundary: everything
  // the floor used to lift to 30 was already below 45.)
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  // ─── Build reasons (human-readable, shown as ✔ in UI) ───────────────────────
  // Each string below says only what its threshold actually establishes. Previously
  // "Safe size match" asserted safety from an identical size bucket, and "Same energy
  // level" fired at a 19-point gap on a self-reported slider.
  if (sizeScore >= 18)            reasons.push('Same size class');
  const energyDiff = Math.abs(userDog.energyLevel - candidate.energyLevel);
  if (energyDiff < 10)            reasons.push('Same energy level');
  else if (energyDiff < 20)       reasons.push(`Energy within ${energyDiff} points`);
  if (breedScore >= 30)           reasons.push('Same breed group');
  else if (breedScore >= 22)      reasons.push('Related breed groups');
  if (goodWithScore >= 12)        reasons.push("Good with your dog's type");
  // Naming the shared style is both more honest and more useful than "Similar".
  if (sharedStyles.length >= 1)   reasons.push(`Both listed ${sharedStyles.join(' and ')}`);
  // Leash reactivity is a walking-route problem, not a playdate problem — most
  // matches here happen off-leash (parks, yards), so this flag is reassuring
  // rather than a warning. Surfaced as a reason, not an 8th scoring axis, so it
  // doesn't reshuffle the existing 100-point weight balance. Placed ahead of
  // the vaccinated/vetChecked/distance reasons (administrative facts, not
  // insight) so it isn't the first thing bumped off by the 4-reason cap below.
  if (candidate.behaviorFlags?.includes('reactive on leash only')) {
    reasons.push('Great off-leash, even if leash walks are tough');
  }
  // "Both vaccinated" was asserted from the CANDIDATE's flag alone — userDog.vaccinated
  // is never read here — so an owner whose own dog is unvaccinated was still told
  // "both". "marked" is load-bearing in all of these: vaccinated is a checkbox that
  // defaults to true (DogProfileForm), not a record anyone verified.
  if (userDog.vaccinated && candidate.vaccinated) reasons.push('Both marked vaccinated');
  else if (candidate.vaccinated)  reasons.push(`${candidate.name} is marked vaccinated`);
  // vetChecked carries no recency — lastVetVisit is a separate field this never reads.
  if (candidate.vetChecked)       reasons.push('Vet check on file');
  if (distanceMiles >= 0 && distanceMiles < 0.5) reasons.push('Very close by');

  // ─── Vaccination blocker ──────────────────────────────────────────────────
  if (candidate.vaccinated === false) {
    allWarnings.unshift('Vaccination status not current');
  }

  // ─── Quality tier ─────────────────────────────────────────────────────────
  // 🟢 perfect: high score, no warnings, vaccinated
  // 🔴 blocked: low score OR unvaccinated
  // 🟡 good:    everything between
  let quality: MatchQuality;
  if (score < 45 || candidate.vaccinated === false) {
    quality = 'blocked';
  } else if (score >= 80 && allWarnings.length === 0) {
    quality = 'perfect';
  } else {
    quality = 'good';
  }

  const label =
    quality === 'perfect' ? 'Perfect play buddy' :
    quality === 'blocked' ? 'Safety mismatch'    :
    allWarnings.length > 0 ? 'Good fit, slow intro' : 'Good fit';

  const microcopy =
    quality === 'perfect' ? 'Perfect play buddy! Same energy + safe match 🐾' :
    quality === 'blocked' ? 'Safety mismatch — try another match 🔒'          :
    allWarnings.length > 0 ? 'Good fit, slow intro recommended ⚠️'            :
    'Good match — worth a closer look 🐾';

  return {
    score,
    quality,
    label,
    microcopy,
    reasons: reasons.slice(0, 4),
    // NOT capped. The vaccination blocker is unshift()ed to the front above, so a
    // 2-item cap silently dropped the third warning off the end — and a pairing with
    // a vaccination problem plus two behavioral crossings is exactly the case where
    // the dropped one matters most. Dropping a positive is a cosmetic loss; dropping
    // a warning is a safety event. Consumers scroll instead of truncating.
    warnings: allWarnings,
    breakdown: {
      breedScore,
      sizeScore,
      energyScore,
      goodWithScore,
      playStyleScore: playScore,
      healthScore,
      distanceScore: distScore,
      penalty,
    },
  };
}

// ─── SORT FEED ────────────────────────────────────────────────────────────────
export function sortFeed(
  userDog: DogProfile,
  candidates: Array<DogProfile & { distanceMiles: number }>,
  alreadySeen: string[] = []
): Array<DogProfile & { distanceMiles: number; compat: CompatibilityResult }> {
  return candidates
    .filter(c => !alreadySeen.includes(c.id) && c.id !== userDog.id)
    .map(c => ({
      ...c,
      compat: calculateCompatibility(userDog, c, c.distanceMiles),
    }))
    .sort((a, b) => {
      // Penalize unsafe pairings to bottom of feed
      if (a.compat.warnings.length > 0 && b.compat.warnings.length === 0) return 1;
      if (b.compat.warnings.length > 0 && a.compat.warnings.length === 0) return -1;
      return b.compat.score - a.compat.score;
    });
}

// ─── TRUST SCORE (UNUSED) ───────────────────────────────────────────────────
// Not called anywhere in this codebase and uses a DIFFERENT scale (0-100,
// baseline 70) than the real trust engine actually deployed in
// firebase/functions/src/index.ts's onRatingCreated (0-1, no baseline —
// trustScore is simply absent until a dog's first rating). Kept only for
// reference; do not wire this into new code without reconciling the scales.
export function calculateTrustScore(ratings: Array<{
  stars: number;
  wouldMeetAgain: boolean;
  createdAt: number;
}>): number {
  if (ratings.length === 0) return 70; // new dog baseline

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of ratings) {
    // More recent ratings count more (half-life = 90 days)
    const ageMs = now - r.createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-ageDays / 90);

    const ratingValue = (r.stars / 5) * 80 + (r.wouldMeetAgain ? 20 : 0);
    weightedSum += ratingValue * weight;
    totalWeight += weight;
  }

  const base = totalWeight > 0 ? weightedSum / totalWeight : 70;

  // Confidence bonus for more ratings (caps at +10)
  const confidenceBonus = Math.min(10, ratings.length * 0.5);

  return Math.round(Math.min(100, base + confidenceBonus));
}
