// shared/dogtype.ts
// "Dogtype" — a 16-type personality system for dogs, the free, shareable
// identity hook (think 16personalities, but honest about what it is).
//
// THE HONESTY RULE THAT SHAPES THIS FILE: a Dogtype is computed DETERMINISTIC-
// ALLY by thresholding four axes that come from fields the owner actually
// entered (energyLevel, playStyles, behaviorFlags/notGoodWith, temperament).
// The same dog always maps to the same type — it never "rerolls" on reload the
// way a free-running LLM would, which is exactly the personality-that-changes
// rule the rest of the app is built around. It is presented as a playful
// identity, never as a validated psychometric instrument.
//
// It deliberately does NOT key off the Vibe Check archetype.code — that code's
// letters are chosen by the model per-dog and carry no fixed meaning (see
// web/lib/vibeCheck.ts). Dogtype is grounded in the numbers/enums instead.
//
// Real dog-to-dog compatibility percentages come ONLY from
// shared/utils/matchingEngine.ts (calculateCompatibility) against real dogs —
// never from a type-vs-type lookup here. The "plays well with" hints below are
// explicitly framed as a playful tendency, never a measured score.

export type DogtypeAxisKey = 'energy' | 'play' | 'social' | 'spirit';

export interface DogtypePole {
  letter: string;
  label: string;
  emoji: string;
}

export interface DogtypeAxisRead {
  key: DogtypeAxisKey;
  /** Human-readable axis name, e.g. "Energy". */
  axis: string;
  pole: DogtypePole;
  /** The opposite pole, for the "you leaned X over Y" readout. */
  other: DogtypePole;
}

export interface Dogtype {
  /** 4-letter deterministic code, one letter per axis, e.g. "EROB". */
  code: string;
  name: string;
  emoji: string;
  tagline: string;
  blurb: string;
  axes: DogtypeAxisRead[];
}

// Minimal shape Dogtype needs — a subset of SavedDogProfile/DogProfile so it
// works with either. Everything optional so a partial profile degrades to null
// rather than throwing.
export interface DogtypeInput {
  energyLevel?: number;
  playStyles?: string[];
  behaviorFlags?: string[];
  notGoodWith?: string[];
  temperament?: string[];
}

// ── Axis poles ───────────────────────────────────────────────────────────────

const ENERGY = {
  high: { letter: 'E', label: 'Spark', emoji: '⚡' },
  low: { letter: 'Z', label: 'Zen', emoji: '🧘' },
} as const;
const PLAY = {
  rowdy: { letter: 'R', label: 'Rowdy', emoji: '🤼' },
  gentle: { letter: 'G', label: 'Gentle', emoji: '🌸' },
} as const;
const SOCIAL = {
  outgoing: { letter: 'O', label: 'Outgoing', emoji: '🎉' },
  selective: { letter: 'S', label: 'Selective', emoji: '🛡️' },
} as const;
const SPIRIT = {
  bold: { letter: 'B', label: 'Bold', emoji: '🚀' },
  softie: { letter: 'M', label: 'Softie', emoji: '☁️' },
} as const;

// PlayStyle enum values (shared/types PlayStyle) sorted into the two poles.
const ROWDY_PLAY = new Set(['loves fetch 🎾', 'wrestling 🤼', 'high-energy runner ⚡']);
const GENTLE_PLAY = new Set(['gentle play 🐾', 'calm 🧘', 'explorer 👃']);

// BehaviorFlags (+ any notGoodWith entry) that mark a dog as socially selective
// with other dogs/strangers. Deliberately excludes 'not comfortable with kids'
// — that's about children, not the dog's sociability with other dogs.
const SELECTIVE_FLAGS = new Set([
  'anxious with dogs',
  'prefers calm dogs',
  'needs slow introduction',
  'not comfortable with strangers',
  'easily overstimulated',
  'resource guarding',
  'reactive on leash only',
]);

// Temperament keyword buckets for the spirit axis (substring match, lowercased).
const BOLD_WORDS = [
  'bold', 'brave', 'confident', 'curious', 'adventurous', 'goofy', 'mischief',
  'cheeky', 'feisty', 'dramatic', 'diva', 'clown', 'fearless', 'independent', 'stubborn',
];
const SOFT_WORDS = [
  'shy', 'gentle', 'sensitive', 'anxious', 'cuddly', 'calm', 'sweet', 'mellow',
  'timid', 'velcro', 'soft', 'nervous', 'old soul', 'couch', 'sleepy', 'affectionate',
];

// ── Deterministic axis resolution ────────────────────────────────────────────

function resolveEnergy(input: DogtypeInput): DogtypePole {
  const e = typeof input.energyLevel === 'number' ? input.energyLevel : 50;
  return e >= 55 ? ENERGY.high : ENERGY.low;
}

function resolvePlay(input: DogtypeInput, energyHigh: boolean): DogtypePole {
  const styles = input.playStyles ?? [];
  let rowdy = 0;
  let gentle = 0;
  for (const s of styles) {
    if (ROWDY_PLAY.has(s)) rowdy++;
    if (GENTLE_PLAY.has(s)) gentle++;
  }
  if (rowdy > gentle) return PLAY.rowdy;
  if (gentle > rowdy) return PLAY.gentle;
  // Tie / no styles → break by energy (spark leans rowdy).
  return energyHigh ? PLAY.rowdy : PLAY.gentle;
}

function resolveSocial(input: DogtypeInput): DogtypePole {
  const flags = input.behaviorFlags ?? [];
  const notGoodWith = input.notGoodWith ?? [];
  const selective = flags.some((f) => SELECTIVE_FLAGS.has(f)) || notGoodWith.length > 0;
  return selective ? SOCIAL.selective : SOCIAL.outgoing;
}

function resolveSpirit(
  input: DogtypeInput,
  energyHigh: boolean,
  rowdy: boolean,
  selective: boolean,
): DogtypePole {
  const words = (input.temperament ?? []).join(' ').toLowerCase();
  let bold = 0;
  let soft = 0;
  for (const w of BOLD_WORDS) if (words.includes(w)) bold++;
  for (const w of SOFT_WORDS) if (words.includes(w)) soft++;
  if (bold > soft) return SPIRIT.bold;
  if (soft > bold) return SPIRIT.softie;
  // Tie / no temperament → a confident-leaning dog (high energy, rowdy play,
  // socially open) reads Bold; otherwise Softie. Fully deterministic.
  return energyHigh && rowdy && !selective ? SPIRIT.bold : SPIRIT.softie;
}

// ── The 16 named types ───────────────────────────────────────────────────────
// Keyed by the 4-letter code (energy·play·social·spirit). Names are playful and
// dog-appropriate; blurbs avoid content-farm slop. Every real dog lands on
// exactly one of these.

interface DogtypeMeta {
  name: string;
  emoji: string;
  tagline: string;
  blurb: string;
}

const TYPES: Record<string, DogtypeMeta> = {
  EROB: { name: 'The Zoomie Menace', emoji: '🌪️', tagline: 'Maximum dog.', blurb: 'Fast, fearless, and friends with the entire block. There is no off switch, only naps that end too soon.' },
  EROM: { name: 'The Party Puppy', emoji: '🎉', tagline: "Everyone's friend, zero chill.", blurb: 'Meets a stranger, gains a best friend, repeat forever. Secretly a marshmallow under all that noise.' },
  ERSB: { name: 'The Rowdy Rebel', emoji: '😤', tagline: 'High-octane and opinionated.', blurb: 'Big engine, strong feelings about who gets in the crew. Fiercely loyal once you make the list.' },
  ERSM: { name: 'The Cautious Wildcard', emoji: '🎢', tagline: 'Big body, tender nerves.', blurb: 'Wants to go a hundred miles an hour but needs to trust you first. Brilliant company once the ice breaks.' },
  EGOB: { name: 'The Social Butterfly', emoji: '🦋', tagline: 'A best friend a minute.', blurb: 'High-drive, warm, and endlessly curious about everyone at the park. Never met a dog they didn’t want to greet.' },
  EGOM: { name: 'The Sunshine Sprite', emoji: '☀️', tagline: 'All wags and zoomies.', blurb: 'Fast little heart, soft little soul — gentle with everyone they meet, and sure the day is going great.' },
  EGSB: { name: 'The Focused Explorer', emoji: '🧭', tagline: 'A mission dog with a guest list.', blurb: 'Driven, discerning, and happiest with a job. Loves deeply, just not indiscriminately.' },
  EGSM: { name: 'The Sensitive Sprinter', emoji: '🌾', tagline: 'Fast feet, soft heart.', blurb: 'A quick, gentle spirit who needs a slow intro and then never wants to stop moving with you.' },
  ZROB: { name: 'The Chill Clown', emoji: '🤡', tagline: 'The park’s comic relief.', blurb: 'Unhurried but always up for a bit. Will flop dramatically, wrestle briefly, and nap through the drama.' },
  ZROM: { name: 'The Lazy Goofball', emoji: '😌', tagline: 'Low-energy chaos.', blurb: 'Down for a wrestle if you bring it to the couch. Loves everyone at a comfortably slow volume.' },
  ZRSB: { name: 'The Sofa Bouncer', emoji: '🛋️', tagline: 'Calm until it’s playtime.', blurb: 'Mellow most of the day, particular about who’s invited to the rough stuff. Runs a tight guest list.' },
  ZRSM: { name: 'The Grumble Snuggler', emoji: '🧸', tagline: 'Rough with the few, shy with the rest.', blurb: 'Wrestles happily with their chosen circle and quietly sits out the crowd. A softie who plays it close.' },
  ZGOB: { name: 'The Gentle Diplomat', emoji: '🕊️', tagline: 'Keeper of the park’s peace.', blurb: 'Unbothered, friendly to all, and somehow makes every dog feel welcome. Steady as they come.' },
  ZGOM: { name: 'The Velvet Couch Potato', emoji: '🛋️', tagline: 'A professional cuddler.', blurb: 'Loves everyone gently and at low volume, then requests immediate couch privileges. Elite napper.' },
  ZGSB: { name: 'The Quiet Sage', emoji: '🦉', tagline: 'Calm and quietly sure.', blurb: 'Discerning, composed, and unimpressed by chaos. Picks their people and stands by them.' },
  ZGSM: { name: 'The Old Soul', emoji: '🌙', tagline: 'An old soul in a dog suit.', blurb: 'Chooses their people carefully and loves them quietly and completely. Gentle, wise, a little bit shy.' },
};

// ── Public API ───────────────────────────────────────────────────────────────

export const DOGTYPE_CODES: string[] = Object.keys(TYPES);

function axisRead(
  key: DogtypeAxisKey,
  axis: string,
  pole: DogtypePole,
  poles: readonly [DogtypePole, DogtypePole],
): DogtypeAxisRead {
  const other = poles[0].letter === pole.letter ? poles[1] : poles[0];
  return { key, axis, pole, other };
}

/**
 * Compute a dog's Dogtype deterministically from what the owner entered.
 * Returns null only when there's too little to say (no energy level at all).
 */
export function computeDogtype(input: DogtypeInput | null | undefined): Dogtype | null {
  if (!input) return null;
  if (typeof input.energyLevel !== 'number' || !Number.isFinite(input.energyLevel)) return null;

  const energy = resolveEnergy(input);
  const energyHigh = energy.letter === 'E';
  const play = resolvePlay(input, energyHigh);
  const rowdy = play.letter === 'R';
  const social = resolveSocial(input);
  const selective = social.letter === 'S';
  const spirit = resolveSpirit(input, energyHigh, rowdy, selective);

  const code = `${energy.letter}${play.letter}${social.letter}${spirit.letter}`;
  const meta = TYPES[code];
  if (!meta) return null; // impossible for valid poles, but keeps types honest

  return {
    code,
    name: meta.name,
    emoji: meta.emoji,
    tagline: meta.tagline,
    blurb: meta.blurb,
    axes: [
      axisRead('energy', 'Energy', energy, [ENERGY.high, ENERGY.low]),
      axisRead('play', 'Play style', play, [PLAY.rowdy, PLAY.gentle]),
      axisRead('social', 'Sociability', social, [SOCIAL.outgoing, SOCIAL.selective]),
      axisRead('spirit', 'Spirit', spirit, [SPIRIT.bold, SPIRIT.softie]),
    ],
  };
}

/** Look up a type by its 4-letter code (for the public /dogtype/[code] page). */
export function dogtypeByCode(code: string | null | undefined): Dogtype | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  const meta = TYPES[upper];
  if (!meta) return null;
  // Rebuild axis reads from the code letters so the public page can render the
  // same axis breakdown without a source profile.
  const [e, p, s, sp] = upper.split('');
  const energy = e === 'E' ? ENERGY.high : ENERGY.low;
  const play = p === 'R' ? PLAY.rowdy : PLAY.gentle;
  const social = s === 'O' ? SOCIAL.outgoing : SOCIAL.selective;
  const spirit = sp === 'B' ? SPIRIT.bold : SPIRIT.softie;
  return {
    code: upper,
    name: meta.name,
    emoji: meta.emoji,
    tagline: meta.tagline,
    blurb: meta.blurb,
    axes: [
      axisRead('energy', 'Energy', energy, [ENERGY.high, ENERGY.low]),
      axisRead('play', 'Play style', play, [PLAY.rowdy, PLAY.gentle]),
      axisRead('social', 'Sociability', social, [SOCIAL.outgoing, SOCIAL.selective]),
      axisRead('spirit', 'Spirit', spirit, [SPIRIT.bold, SPIRIT.softie]),
    ],
  };
}

// A short, human-readable decode of a bare 4-letter code, e.g. "EROB" ->
// "Spark · Rowdy · Outgoing · Bold". Wherever the compact code is shown on its
// own (a badge, a grid tile, a share card) it reads as noise without this —
// this is the one-line fix for "EROB doesn't say much".
export function dogtypeCodeDecode(code: string | null | undefined): string | null {
  const type = dogtypeByCode(code);
  if (!type) return null;
  return type.axes.map((a) => a.pole.label).join(' · ');
}

// ── Playful "plays well with" hint (NOT a measured score) ────────────────────
// A transparent, deterministic heuristic over the axes — clearly labeled in the
// UI as a vibe, never a percentage. Real compatibility numbers come only from
// calculateCompatibility against real dogs.

export type DogtypeVibe = 'great' | 'good' | 'spicy';

export function dogtypeVibe(aCode: string, bCode: string): DogtypeVibe {
  const a = aCode.toUpperCase();
  const b = bCode.toUpperCase();
  if (a.length !== 4 || b.length !== 4) return 'good';

  let score = 0;
  // Energy: one high + one low is a classic balance; both-high can be a lot.
  if (a[0] !== b[0]) score += 1;
  else if (a[0] === 'E') score -= 1;
  // Play: matching play styles mesh well.
  if (a[1] === b[1]) score += 1;
  // Sociability: two outgoing dogs vibe; two selective dogs need slow intros.
  if (a[2] === 'O' && b[2] === 'O') score += 1;
  if (a[2] === 'S' && b[2] === 'S') score -= 1;
  // Spirit: a bold dog and a softie balance; two bolds can clash.
  if (a[3] !== b[3]) score += 1;
  else if (a[3] === 'B') score -= 1;

  if (score >= 3) return 'great';
  if (score <= 0) return 'spicy';
  return 'good';
}

// ── Two-dog compatibility read (the invite-loop card) ────────────────────────
// Deterministic and transparent: the SAME two codes always produce the SAME
// read. It is framed everywhere as a PLAYFUL vibe — there is deliberately no
// percentage and no "match score". Real dog-to-dog compatibility numbers come
// only from calculateCompatibility (shared/utils/matchingEngine.ts) against two
// real dogs. This is the "do our dogs get along?" social object, nothing more.

export interface DogtypeCompat {
  vibe: DogtypeVibe;
  /** A small emoji for the verdict — 💛 great, 🐾 good, 🌶️ spicy. */
  emoji: string;
  /** Tight, human headline for the card. Never LLM-flavored filler. */
  headline: string;
  /** One honest sentence about WHY, grounded in the actual axes. */
  note: string;
}

/**
 * A playful compatibility read between two Dogtypes for the shareable "vs" card.
 * Returns null if either code is malformed. Fully deterministic; honest by
 * construction (a vibe tier + a real axis observation, never an invented score).
 */
export function dogtypeCompat(aCode: string, bCode: string): DogtypeCompat | null {
  const a = aCode.toUpperCase();
  const b = bCode.toUpperCase();
  if (a.length !== 4 || b.length !== 4 || !TYPES[a] || !TYPES[b]) return null;

  const vibe = dogtypeVibe(a, b);
  const energyBalance = a[0] !== b[0];
  const bothSpark = a[0] === 'E' && b[0] === 'E';
  const samePlay = a[1] === b[1];
  const bothOutgoing = a[2] === 'O' && b[2] === 'O';
  const bothSelective = a[2] === 'S' && b[2] === 'S';
  const spiritBalance = a[3] !== b[3];
  const bothBold = a[3] === 'B' && b[3] === 'B';

  if (vibe === 'great') {
    const note = bothOutgoing
      ? 'Two social butterflies — friends before the leashes are even off.'
      : energyBalance
        ? 'One brings the zoomies, the other brings the calm. A lovely balance.'
        : samePlay
          ? 'They play the exact same language, so the game just works.'
          : spiritBalance
            ? 'A bold one and a softie — they round each other out.'
            : 'The kind of easy, unbothered fit every park hopes for.';
    return { vibe, emoji: '💛', headline: 'A playdate made in the park', note };
  }

  if (vibe === 'spicy') {
    const note = bothSelective
      ? 'Both run a tight guest list, so a calm, gradual intro matters most.'
      : bothSpark
        ? 'Two high-octane engines — supervise the zoomies and take breaks.'
        : bothBold
          ? 'Two big personalities; give them space to sort out the pecking order.'
          : 'Real chemistry is possible, but this one wants a slow, patient intro.';
    return { vibe, emoji: '🌶️', headline: 'Spicy — take it slow', note };
  }

  const note = energyBalance
    ? 'Different energies, but that gap is exactly what can make it click.'
    : 'Not an instant match on paper — a good slow-burn with the right intro.';
  return { vibe, emoji: '🐾', headline: 'Different vibes, real potential', note };
}

/** Up to `limit` type codes that tend to vibe best with the given code. */
export function dogtypeBestMatches(code: string, limit = 3): Dogtype[] {
  const self = code.toUpperCase();
  return DOGTYPE_CODES.filter((c) => c !== self)
    .map((c) => ({ c, vibe: dogtypeVibe(self, c) }))
    .filter((x) => x.vibe === 'great')
    .slice(0, limit)
    .map((x) => dogtypeByCode(x.c))
    .filter((t): t is Dogtype => t !== null);
}
