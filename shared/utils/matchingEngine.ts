// shared/utils/matchingEngine.ts
// GoDoggyDate Compatibility Engine v1.2
// Weights: breed 30% | size 20% | energy 15% | good-with 15% | play style 10% | health 5% | distance 5%
//
// HONESTY: everything this engine reads is what the owners TYPED IN. Nobody verifies
// breed, size, vaccination, temperament or any declared limit, so every sentence it
// produces is worded as "what owners shared", never as a safety guarantee.

import type {
  DogProfile,
  CompatibilityResult,
  MatchQuality,
  LimitItem,
  LimitAnalysis,
} from '../types';
import { resolveBreed, type BreedGroup } from '../types/breeds';

const SIZE_VALUE: Record<string, number> = { S: 1, M: 2, L: 3, XL: 4 };
const sizeValue = (d: { size?: string }): number => SIZE_VALUE[d.size ?? ''] ?? 2;
const SIZE_WORD: Record<string, string> = { S: 'small', M: 'medium', L: 'large', XL: 'extra large' };

// ─── DECLARED LIMITS ──────────────────────────────────────────────────────────
// The profile form offers 6 "not a good match with" chips (notGoodWith) and 7
// "good to know before meeting" chips (behaviorFlags). Each one below says what it
// means against the OTHER dog. These are the owner's stated limits, not verified
// facts, and only ever shown as such ("Moose's owner prefers no puppies").
//
// Three outcomes per chip, per pair of dogs:
//   caution  - the limit is tripped by the other dog. Costs score, sinks in the deck.
//   note     - relevant to ANY first meeting (kids, off-leash, slow introduction...).
//              Shown as a warning, never costs score.
//   declared - a conditional limit the other dog does not trip. Shown so limits are
//              visible up front, but not counted as a warning.
//
// Semantics (holder = the dog whose owner declared it, other = the dog it is read against):
//   small dogs ................. other is Small
//   large dogs ................. other is Large or XL
//   puppies .................... other is a puppy
//   high-energy dogs ........... other is high-energy (slider >= 75, or lists "high-energy runner")
//   rough play ................. other lists wrestling
//   off-leash dogs ............. note only (we don't know who is off-leash)
//   needs slow introduction .... caution if other is high-energy; otherwise a note
//   easily overstimulated ...... caution if other is rowdy (high-energy, wrestling or runner)
//   resource guarding .......... caution if other loves fetch (toys); otherwise a note
//   anxious with dogs .......... caution if other is rowdy, or 2+ size classes bigger
//   prefers calm dogs .......... caution if other is not calm (slider >= 65, wrestling or runner)
//   not comfortable with kids .. note only
//   not comfortable with strangers / reactive on leash only ... note only
//   (older/other values) overstimulated = easily overstimulated;
//   resource guarding dogs = caution if other's owner flagged resource guarding.

const energyOf = (d: DogProfile): number =>
  typeof d.energyLevel === 'number' && Number.isFinite(d.energyLevel) ? d.energyLevel : 50;

const hasStyle = (d: DogProfile, word: string): boolean =>
  (d.playStyles ?? []).some((s) => typeof s === 'string' && s.toLowerCase().includes(word));

const HIGH_ENERGY_AT = 75; // matches the card's "High energy" label
const NOT_CALM_AT = 65;

function highEnergyWhy(d: DogProfile): string | null {
  if (energyOf(d) >= HIGH_ENERGY_AT) return 'listed as high-energy';
  if (hasStyle(d, 'high-energy runner')) return 'a high-energy runner';
  return null;
}

function rowdyWhy(d: DogProfile): string | null {
  return highEnergyWhy(d) ?? (hasStyle(d, 'wrestl') ? 'a wrestler' : null);
}

type Subject = { kind: 'owner' | 'you'; dogName?: string | null };

interface ChipRule {
  concern: string;
  /** Wording; {who} "Moose's owner" or "You", {s} "s" for the third person, {dog} the dog's name. */
  template: string;
  /** Why the OTHER dog trips this limit (a clause naming that dog), or null. Absent = never trips. */
  trips?: (holder: DogProfile, other: DogProfile) => string | null;
  /** A note even when not tripped. Chips with no `trips` are always notes. */
  alwaysNote?: boolean;
  /** The fixed warning detectUnsafePairings() has always returned for this chip. */
  legacy?: string;
}

const NOT_GOOD_WITH_RULES: Record<string, ChipRule> = {
  'small dogs': {
    concern: 'size', template: '{who} prefer{s} no small dogs', legacy: 'Not ideal with small dogs',
    trips: (_h, o) => (o.size === 'S' ? `${nameOf(o)} is small` : null),
  },
  'large dogs': {
    concern: 'size', template: '{who} prefer{s} no large dogs', legacy: 'Not ideal with large dogs',
    trips: (_h, o) => (o.size === 'L' || o.size === 'XL' ? `${nameOf(o)} is ${SIZE_WORD[o.size]}` : null),
  },
  puppies: {
    concern: 'age', template: '{who} prefer{s} no puppies', legacy: 'Not ideal with puppies',
    trips: (_h, o) => (o.age === 'puppy' ? `${nameOf(o)} is a puppy` : null),
  },
  'high-energy dogs': {
    concern: 'energy', template: '{who} prefer{s} no high-energy dogs', legacy: 'Prefers calmer dogs',
    trips: (_h, o) => { const w = highEnergyWhy(o); return w ? `${nameOf(o)} is ${w}` : null; },
  },
  'rough play': {
    concern: 'rough', template: '{who} prefer{s} no rough play', legacy: 'Not ideal with rough play',
    trips: (_h, o) => (hasStyle(o, 'wrestl') ? `${nameOf(o)} lists wrestling` : null),
  },
  'off-leash dogs': {
    concern: 'leash', template: '{who} prefer{s} no off-leash dogs',
  },
  overstimulated: {
    concern: 'energy', template: '{who} prefer{s} no overstimulated dogs', legacy: 'Easily overstimulated',
    trips: (_h, o) => { const w = rowdyWhy(o); return w ? `${nameOf(o)} is ${w}` : null; },
  },
  'resource guarding dogs': {
    concern: 'guarding', template: '{who} prefer{s} no dogs that resource guard', legacy: 'Not ideal with dogs that guard resources',
    trips: (_h, o) => ((o.behaviorFlags ?? []) as string[]).includes('resource guarding')
      ? `${nameOf(o)}'s owner says ${nameOf(o)} can resource guard` : null,
  },
};

const BEHAVIOR_FLAG_RULES: Record<string, ChipRule> = {
  'needs slow introduction': {
    concern: 'intro', template: '{who} need{s} a slow introduction', legacy: 'Needs a slow introduction', alwaysNote: true,
    trips: (_h, o) => { const w = highEnergyWhy(o); return w ? `${nameOf(o)} is ${w}` : null; },
  },
  'easily overstimulated': {
    concern: 'energy', template: '{who} say{s} {dog} gets overstimulated easily', legacy: 'Easily overstimulated',
    trips: (_h, o) => { const w = rowdyWhy(o); return w ? `${nameOf(o)} is ${w}` : null; },
  },
  'resource guarding': {
    concern: 'toys', template: '{who} say{s} {dog} can resource guard, so skip sharing toys',
    legacy: 'May have resource guarding – no toy sharing', alwaysNote: true,
    trips: (_h, o) => (hasStyle(o, 'fetch') ? `${nameOf(o)} loves fetch` : null),
  },
  'anxious with dogs': {
    concern: 'energy', template: '{who} say{s} {dog} is anxious with other dogs', legacy: 'Anxious with other dogs',
    trips: (h, o) => {
      const w = rowdyWhy(o);
      if (w) return `${nameOf(o)} is ${w}`;
      return sizeValue(o) - sizeValue(h) >= 2 ? `${nameOf(o)} is much bigger` : null;
    },
  },
  'prefers calm dogs': {
    concern: 'energy', template: '{who} prefer{s} calm dogs', legacy: 'Prefers calm company',
    trips: (_h, o) => {
      if (energyOf(o) >= NOT_CALM_AT) return `${nameOf(o)} is not on the calm side`;
      const w = rowdyWhy(o);
      return w ? `${nameOf(o)} is ${w}` : null;
    },
  },
  'not comfortable with kids': {
    concern: 'kids', template: '{who} say{s} {dog} is not comfortable with kids',
  },
  'not comfortable with strangers': {
    concern: 'strangers', template: '{who} say{s} {dog} is not comfortable with strangers',
  },
  'reactive on leash only': {
    concern: 'leash', template: '{who} say{s} {dog} is reactive on leash',
  },
};

function nameOf(d: { name?: string }): string {
  return (d.name ?? '').trim() || 'This dog';
}

function subjectParts(subject: Subject): { who: string; s: string; dog: string } {
  const dog = (subject.dogName ?? '').trim() || (subject.kind === 'you' ? 'your dog' : 'their dog');
  return subject.kind === 'you' ? { who: 'You', s: '', dog } : { who: `${dog}'s owner`, s: 's', dog };
}

function fillTemplate(template: string, subject: Subject): string {
  const { who, s, dog } = subjectParts(subject);
  return template.replace('{who}', who).replace('{s}', s).replace('{dog}', dog);
}

function ruleFor(kind: LimitItem['kind'], chip: string): ChipRule | undefined {
  const key = chip.trim().toLowerCase();
  return (kind === 'notGoodWith' ? NOT_GOOD_WITH_RULES : BEHAVIOR_FLAG_RULES)[key];
}

/** One declared limit as an owner-named sentence ("Moose's owner prefers no puppies"). */
export function describeLimit(chip: string, kind: LimitItem['kind'], subject: Subject): string {
  const rule = ruleFor(kind, chip);
  if (rule) return fillTemplate(rule.template, subject);
  // A value a newer app wrote that this version doesn't know: quote it, owner-named.
  const { who } = subjectParts(subject);
  return kind === 'notGoodWith' ? `${who} flagged "${chip}" under not a good match with` : `${who} flagged "${chip}"`;
}

type DeclaredLike = { name?: string; notGoodWith?: readonly string[] | null; behaviorFlags?: readonly string[] | null };

function declaredChips(dog: DeclaredLike | null | undefined): Array<{ chip: string; kind: LimitItem['kind'] }> {
  const out: Array<{ chip: string; kind: LimitItem['kind'] }> = [];
  const seen = new Set<string>();
  const add = (raw: unknown, kind: LimitItem['kind']) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const id = `${kind}:${raw.trim().toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ chip: raw.trim(), kind });
  };
  for (const c of dog?.notGoodWith ?? []) add(c, 'notGoodWith');
  for (const c of dog?.behaviorFlags ?? []) add(c, 'behaviorFlag');
  return out;
}

/**
 * Every limit a dog's owner declared, once each, as owner-named sentences
 * ("Moose's owner prefers no puppies"). Independent of any other dog, so it works
 * for the first card, the details sheet, the match modal, the Heads-Up card and chat.
 * voice 'you' words them for the owner themself ("You prefer no puppies").
 */
export function describeLimits(
  dog: DeclaredLike | null | undefined,
  opts: { voice?: 'owner' | 'you' } = {},
): string[] {
  const subject: Subject = { kind: opts.voice === 'you' ? 'you' : 'owner', dogName: dog?.name };
  return declaredChips(dog).map(({ chip, kind }) => describeLimit(chip, kind, subject));
}

function evaluateSide(
  holder: DogProfile,
  target: DogProfile,
  side: LimitItem['side'],
  includeUntripped: boolean,
): LimitItem[] {
  const subject: Subject = { kind: side === 'yours' ? 'you' : 'owner', dogName: holder.name };
  const items: LimitItem[] = [];
  for (const { chip, kind } of declaredChips(holder)) {
    const rule = ruleFor(kind, chip);
    const why = rule?.trips ? rule.trips(holder, target) : null;
    const severity: LimitItem['severity'] =
      why ? 'caution' : !rule || !rule.trips || rule.alwaysNote ? 'note' : 'declared';
    if (!includeUntripped && severity !== 'caution') continue;
    items.push({
      id: `${side}:${kind}:${chip.toLowerCase()}`,
      side, kind, chip, severity,
      concern: rule?.concern ?? 'other',
      text: describeLimit(chip, kind, subject),
      ...(why ? { detail: why } : {}),
    });
  }
  return items;
}

const SEVERITY_ORDER: Record<LimitItem['severity'], number> = { caution: 0, note: 1, declared: 2 };

/**
 * The declared limits that matter between a viewer's dog and another dog, each
 * chip counted ONCE (so a count never doubles a limit as both a "crossing" and a
 * "flag"). Always includes everything the OTHER owner declared; of the viewer's
 * own limits only the ones the other dog trips (`viewerAll: true` includes all of
 * them, for the pre-meetup Heads-Up where both owners' limits matter).
 */
export function analyzeLimits(
  viewer: DogProfile,
  other: DogProfile,
  opts: { viewerAll?: boolean } = {},
): LimitAnalysis {
  const items = [
    ...evaluateSide(other, viewer, 'theirs', true),
    ...evaluateSide(viewer, other, 'yours', Boolean(opts.viewerAll)),
  ]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity] || a.index - b.index)
    .map(({ item }) => item);
  const count = (s: LimitItem['severity']) => items.filter((i) => i.severity === s).length;
  return {
    items,
    cautionCount: count('caution'),
    noteCount: count('note'),
    declaredCount: count('declared'),
    total: items.length,
  };
}

// ─── UNSAFE PAIRING DETECTION ─────────────────────────────────────────────────
// Exported so the pre-meetup Heads-Up card can show the SAME crossings the score
// was computed from, rather than a second, hand-maintained list that drifts.
// Returns the TRIPPED limits (cautions) of b's owner against dog a, in the fixed
// legacy wording. For owner-named sentences use analyzeLimits() / describeLimits().
export function detectUnsafePairings(a: DogProfile, b: DogProfile): string[] {
  const out: string[] = [];
  for (const item of evaluateSide(b, a, 'theirs', false)) {
    const rule = ruleFor(item.kind, item.chip);
    const warning = rule?.legacy ?? item.text;
    if (!out.includes(warning)) out.push(warning);
  }
  return out;
}

// ─── SIZE SCORE (20%) ─────────────────────────────────────────────────────────
function calcSizeScore(a: DogProfile, b: DogProfile): number {
  const diff = Math.abs(sizeValue(a) - sizeValue(b));
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

  // Limits: what each owner DECLARED, read against the other dog. Both directions,
  // each chip once (the old code unioned two lists and counted overlaps twice).
  const limits = analyzeLimits(userDog, candidate);
  const cautions = limits.items.filter((i) => i.severity === 'caution');
  // Diminishing, not linear, and per CONCERN rather than per chip. A flat -15 each
  // is a tax on honesty: the owner who truthfully declares three things about their
  // dog was scored 45 points below the one who declared nothing, and at this density
  // that can empty their feed. Several chips from one owner that worry about the
  // same thing ("prefers calm dogs", "easily overstimulated", "anxious with dogs"
  // against one rowdy dog) are ONE concern, not three penalties. Still monotonic in
  // the number of distinct concerns, capped, and every chip is still shown in full by
  // every consumer, so the score no longer has to be the thing that carries the caution.
  const concerns = new Set(cautions.map((i) => `${i.side}:${i.concern}`));
  const penalty = concerns.size === 0 ? 0 : Math.min(33, 15 + (concerns.size - 1) * 6);
  const allWarnings: string[] = limits.items
    .filter((i) => i.severity === 'caution' || (i.severity === 'note' && i.side === 'theirs'))
    .map((i) => (i.severity === 'caution' && i.detail ? `${i.text} (${i.detail})` : i.text));

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
    reasons.push('Their owner says leash walks are the only trouble spot');
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
    allWarnings.unshift('Owner marked: not vaccinated');
  }

  // ─── Quality tier ─────────────────────────────────────────────────────────
  // perfect: high score and no tripped limit
  // blocked: low score OR the owner marked the dog not vaccinated
  // good:    everything between
  // Only TRIPPED limits (cautions) count here. Notes (kids, off-leash, ...) are
  // worth reading but don't make a pairing worse than the numbers say.
  const cautionCount = limits.cautionCount;
  const notVaccinated = candidate.vaccinated === false;
  let quality: MatchQuality;
  if (score < 45 || notVaccinated) {
    quality = 'blocked';
  } else if (score >= 80 && cautionCount === 0) {
    quality = 'perfect';
  } else {
    quality = 'good';
  }

  // Labels are banded by what the number can honestly support, and say "on what
  // owners shared": the engine reads typed-in fields, nobody vets any of them.
  // (Previously 48/100 read "Good match - worth a closer look" and the top tier
  // promised a "safe match".)
  let label: string;
  let microcopy: string;
  if (quality === 'blocked') {
    if (notVaccinated) {
      label = 'Vaccination flagged';
      microcopy = 'Owner marked not vaccinated. Read the details first 🔒';
    } else if (cautionCount > 0) {
      label = 'Limits clash';
      microcopy = 'Owner limits cross. Read the details first 🔒';
    } else {
      label = 'Low fit on paper';
      microcopy = 'Little lines up so far. Read the details first 🔒';
    }
  } else if (quality === 'perfect') {
    label = 'Strong fit';
    microcopy = 'Compatible on what owners shared 🐾';
  } else if (cautionCount > 0) {
    label = score >= 65 ? 'Good fit, with care' : 'Some overlap, with care';
    microcopy = 'Compatible, but respect the owner limits ⚠️';
  } else if (score >= 65) {
    label = 'Good fit';
    microcopy = 'Compatible on what owners shared 🐾';
  } else {
    label = 'Some overlap';
    microcopy = 'A few things line up. See why 🐾';
  }

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
    limits,
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
      // Tripped limits sink to the bottom of the feed (never hidden). Notes don't.
      const ca = cautionCountOf(a.compat);
      const cb = cautionCountOf(b.compat);
      if (ca > 0 && cb === 0) return 1;
      if (cb > 0 && ca === 0) return -1;
      return b.compat.score - a.compat.score;
    });
}

/** How many declared limits (either owner's) this pairing trips. Safe on results from older builds. */
export function cautionCountOf(compat: Pick<CompatibilityResult, 'warnings' | 'limits'>): number {
  return compat.limits ? compat.limits.cautionCount : compat.warnings.length;
}

/**
 * Distance as the owner should read it. The coordinate grid is ~0.7 mi, so "0.0 mi"
 * was false precision: under a mile is just "Under 1 mi". null when unknown (-1).
 */
export function formatDistanceMiles(miles: number | null | undefined): string | null {
  if (typeof miles !== 'number' || !(miles >= 0)) return null;
  if (miles < 1) return 'Under 1 mi';
  return `${Math.round(miles)} mi`;
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
