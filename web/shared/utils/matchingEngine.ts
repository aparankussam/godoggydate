// shared/utils/matchingEngine.ts
// GoDoggyDate Compatibility Engine v1.1
// Weights: breed 30% | size 20% | energy 15% | good-with 15% | play style 10% | health 5% | distance 5%

import type { DogProfile, CompatibilityResult, MatchQuality } from '../types';

const SIZE_VALUE: Record<string, number> = { S: 1, M: 2, L: 3, XL: 4 };

// ─── UNSAFE PAIRING DETECTION ─────────────────────────────────────────────────
function detectUnsafePairings(a: DogProfile, b: DogProfile): string[] {
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

  if (aIsSmall  && b.goodWith.includes('small dogs'))         score += 8;
  if (aIsLarge  && b.goodWith.includes('large dogs'))         score += 8;
  if (aIsCalm   && b.goodWith.includes('calm dogs'))          score += 6;
  if (aIsEnergy && b.goodWith.includes('high-energy dogs'))   score += 6;
  if (aIsPuppy  && b.goodWith.includes('puppies'))            score += 6;
  if (b.goodWith.includes('all dogs'))                        score += 4;

  return Math.min(15, score);
}

// ─── PLAY STYLE SCORE (10%) ───────────────────────────────────────────────────
function calcPlayStyleScore(a: DogProfile, b: DogProfile): { score: number; sharedStyles: string[] } {
  const shared = a.playStyles.filter(s => b.playStyles.includes(s));
  let score: number;
  if (shared.length >= 3) score = 10;
  else if (shared.length === 2) score = 9;
  else if (shared.length === 1) score = 7;
  else score = 3;
  return { score, sharedStyles: shared };
}

// ─── BREED SCORE (30%) ────────────────────────────────────────────────────────
// Based on breed group compatibility — simplified for MVP
const BREED_GROUPS: Record<string, string> = {
  'Labrador Retriever':   'sporting', 'Golden Retriever': 'sporting',
  'Vizsla':              'sporting', 'Australian Shepherd': 'herding',
  'Border Collie':       'herding',  'Corgi': 'herding',
  'Beagle':              'hound',    'Dachshund': 'hound',
  'Mini Dachshund':      'hound',    // defensive: matches Kaju's breed string
  'Husky':               'working',  'Bernese Mountain Dog': 'working',
  'Samoyed':             'working',  'Shiba Inu': 'non-sporting',
  'French Bulldog':      'non-sporting', 'Poodle': 'non-sporting',
  'Cavalier King Charles': 'toy',
};

const GROUP_COMPAT: Record<string, string[]> = {
  sporting:     ['sporting', 'herding', 'working', 'hound'],
  herding:      ['herding', 'sporting'],
  hound:        ['hound', 'sporting', 'non-sporting'],
  working:      ['working', 'sporting', 'herding'],
  'non-sporting': ['non-sporting', 'toy', 'hound'],
  toy:          ['toy', 'non-sporting'],
};

function calcBreedScore(a: DogProfile, b: DogProfile): number {
  const ga = BREED_GROUPS[a.breed] || 'mixed';
  const gb = BREED_GROUPS[b.breed] || 'mixed';
  if (ga === gb) return 30; // Same group – excellent
  if (GROUP_COMPAT[ga]?.includes(gb)) return 22;
  return 12; // Different groups – might need introductions
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
  const penalty = allWarnings.length * 15;

  // Raw score
  const raw = breedScore + sizeScore + energyScore +
              goodWithScore + playScore + healthScore + distScore - penalty;

  // Normalize to 0-100
  const maxPossible = 30 + 20 + 15 + 15 + 10 + 5 + 5; // = 100
  const score = Math.round(Math.min(99, Math.max(30, (raw / maxPossible) * 100)));

  // ─── Build reasons (human-readable, shown as ✔ in UI) ───────────────────────
  if (sizeScore >= 18)            reasons.push('Safe size match');
  if (energyScore >= 12)          reasons.push('Same energy level');
  if (breedScore >= 22)           reasons.push('Compatible breed groups');
  if (goodWithScore >= 12)        reasons.push("Good with your dog's type");
  if (sharedStyles.length >= 1)   reasons.push('Similar play style');
  if (candidate.vaccinated)       reasons.push('Both vaccinated');
  if (candidate.vetChecked)       reasons.push('Recently vet checked');
  if (distanceMiles < 0.5)        reasons.push('Very close by');

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
    warnings: allWarnings.slice(0, 2),
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

// ─── TRUST SCORE ─────────────────────────────────────────────────────────────
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
