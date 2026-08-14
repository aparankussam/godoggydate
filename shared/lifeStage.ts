// shared/lifeStage.ts
// "Life in Dog Years, done right" — a size-aware life-stage read that replaces
// the folklore ×7 with something honest and emotionally real: where your dog is
// in their life, what this stage needs, and a gentle sense of the years ahead.
//
// HONESTY RULES (this is the emotional core, so the guardrails matter most):
//  • Every number here is a breed/SIZE COHORT AVERAGE, never a prediction about
//    THIS dog. Copy must always say "dogs {name}'s size" — never "{name} has N
//    years left". No countdown, no death clock.
//  • Pure computation from birthYear + size. Zero writes, zero network, no
//    rules change. Renders nothing when birthYear is absent (never infer age
//    from the coarse puppy/adult/senior field — that's not a birth year).
//  • Lifespans are documented size cohort ranges; kept as round, clearly-
//    approximate figures, not false precision.

export type DogSizeCode = 'S' | 'M' | 'L' | 'XL';

export type LifeStage =
  | 'puppy'
  | 'junior'
  | 'adult'
  | 'mature'
  | 'senior'
  | 'geriatric';

interface SizeModel {
  /** Cohort average lifespan in years — small dogs outlive giant breeds. */
  lifespan: number;
  /** Upper age bound (years) for each stage, in order. Beyond the last → geriatric. */
  bounds: { puppy: number; junior: number; adult: number; mature: number; senior: number };
}

// Documented, deliberately round cohort figures. Small dogs live longest and
// stay "young" longer; giant breeds age fastest — which is exactly why one
// universal ×7 is wrong and this is size-aware.
const SIZE_MODELS: Record<DogSizeCode, SizeModel> = {
  S:  { lifespan: 15, bounds: { puppy: 1, junior: 2,   adult: 8, mature: 11, senior: 14 } },
  M:  { lifespan: 13, bounds: { puppy: 1, junior: 2,   adult: 7, mature: 10, senior: 12 } },
  L:  { lifespan: 11, bounds: { puppy: 1, junior: 2,   adult: 6, mature: 8,  senior: 10 } },
  XL: { lifespan: 9,  bounds: { puppy: 1, junior: 1.5, adult: 5, mature: 7,  senior: 9  } },
};

const STAGE_META: Record<LifeStage, { label: string; emoji: string; blurb: string; focus: string }> = {
  puppy: {
    label: 'Puppy', emoji: '🐣',
    blurb: 'Everything is new. This is the window that shapes who they become.',
    focus: 'Socialization, the first vaccine series, and gentle, positive firsts.',
  },
  junior: {
    label: 'Junior', emoji: '🌱',
    blurb: 'Teenager energy: testing limits, boundless, gloriously chaotic.',
    focus: 'Consistent training, spay/neuter timing, and burning that energy off.',
  },
  adult: {
    label: 'Adult', emoji: '⭐',
    blurb: 'Their prime — settled, capable, and the best playdate company there is.',
    focus: 'Keeping weight steady, dental care, and a yearly wellness check.',
  },
  mature: {
    label: 'Mature', emoji: '🌳',
    blurb: 'Still themselves, just a little more measured about it.',
    focus: 'Baseline bloodwork, joint support, and watching for early changes.',
  },
  senior: {
    label: 'Senior', emoji: '🍂',
    blurb: 'The golden years. Slower walks, deeper naps, the same big heart.',
    focus: 'Twice-yearly vet visits, comfort, and savoring the quiet time together.',
  },
  geriatric: {
    label: 'Wise elder', emoji: '🌙',
    blurb: 'Every day is a gift now. They have earned every soft blanket.',
    focus: 'Comfort first — mobility, warmth, and quality-of-life over everything.',
  },
};

export interface LifeStageRead {
  ageYears: number;
  stage: LifeStage;
  stageLabel: string;
  stageEmoji: string;
  stageBlurb: string;
  /** What this stage needs — used to give Cadence reminders their "why now". */
  stageFocus: string;
  /** 0–1, how far through a cohort-average life. For a progress bar only. */
  percentOfLife: number;
  cohortLifespan: number;
  /** Cohort-average years remaining (>= 0). ALWAYS framed as a cohort average. */
  cohortYearsRemaining: number;
  /** True once the dog is at/past the cohort-average lifespan. When true, the
   *  UI must NOT show a "0 more years" number (a death-clock the module refuses
   *  to produce) and instead celebrate outliving the average. */
  outlivedCohort: boolean;
  /** Rough human-age equivalent, size-aware — an estimate, never exact. */
  humanYearsEstimate: number;
}

function currentYear(nowMs: number): number {
  return new Date(nowMs).getFullYear();
}

function stageFor(ageYears: number, model: SizeModel): LifeStage {
  const b = model.bounds;
  if (ageYears < b.puppy) return 'puppy';
  if (ageYears < b.junior) return 'junior';
  if (ageYears < b.adult) return 'adult';
  if (ageYears < b.mature) return 'mature';
  if (ageYears < b.senior) return 'senior';
  return 'geriatric';
}

// Size-aware human-age estimate. Anchors: ~15 human years by age 1 and ~24 by
// age 2 (well-established), then a per-year increment that's larger for bigger
// dogs (they age faster). Deliberately an ESTIMATE — labeled as such in the UI.
function humanYears(ageYears: number, size: DogSizeCode): number {
  if (ageYears <= 0) return 0;
  const perYearAfterTwo = size === 'S' ? 4 : size === 'M' ? 4.5 : size === 'L' ? 5.5 : 6.5;
  if (ageYears <= 1) return Math.round(ageYears * 15);
  if (ageYears <= 2) return Math.round(15 + (ageYears - 1) * 9);
  return Math.round(24 + (ageYears - 2) * perYearAfterTwo);
}

export interface LifeStageInput {
  birthYear?: number;
  /** 1–12. When present, refines the age so a late-in-the-year puppy isn't
   *  over-aged by up to a year (and mis-staged) from year-only arithmetic. */
  birthMonth?: number;
  size?: DogSizeCode;
}

/**
 * Compute the life-stage read, or null when there isn't a real birth year to
 * stand on. Never guesses age from the coarse puppy/adult/senior field.
 */
export function computeLifeStage(
  input: LifeStageInput | null | undefined,
  nowMs: number = Date.now(),
): LifeStageRead | null {
  if (!input || typeof input.birthYear !== 'number' || !Number.isFinite(input.birthYear)) return null;

  const thisYear = currentYear(nowMs);
  // Reject impossible birth years rather than rendering a negative/huge age.
  if (input.birthYear < 1990 || input.birthYear > thisYear) return null;

  const size: DogSizeCode = (input.size && ['S', 'M', 'L', 'XL'].includes(input.size))
    ? input.size
    : 'M';
  const model = SIZE_MODELS[size];

  // Month-aware age: if we know the birth month and this year's birthday hasn't
  // arrived yet, the dog is a year younger than the plain year subtraction says.
  const now = new Date(nowMs);
  let ageYears = thisYear - input.birthYear;
  if (typeof input.birthMonth === 'number' && input.birthMonth >= 1 && input.birthMonth <= 12) {
    if (now.getMonth() < input.birthMonth - 1) ageYears -= 1;
  }
  ageYears = Math.max(0, ageYears);

  const stage = stageFor(ageYears, model);
  const meta = STAGE_META[stage];
  const percentOfLife = Math.max(0, Math.min(1, ageYears / model.lifespan));
  const cohortYearsRemaining = Math.max(0, model.lifespan - ageYears);

  return {
    ageYears,
    stage,
    stageLabel: meta.label,
    stageEmoji: meta.emoji,
    stageBlurb: meta.blurb,
    stageFocus: meta.focus,
    percentOfLife,
    cohortLifespan: model.lifespan,
    cohortYearsRemaining,
    outlivedCohort: ageYears >= model.lifespan,
    humanYearsEstimate: humanYears(ageYears, size),
  };
}
