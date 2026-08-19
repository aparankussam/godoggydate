// shared/plaque.ts
// "Employee of the Month" — a deterministic, NO-AI corporate-absurd plaque built
// on top of a dog's Dogtype. Every dog gets a straight-faced job title like
// "Senior VP of Squirrel Surveillance" plus a few tongue-in-cheek "performance
// highlights". It is a JOKE, not a claim: the title is picked from a hand-written
// bank keyed to the dog's 16-type Dogtype code, and nothing on it asserts a fact
// about the dog that isn't obviously played for laughs.
//
// Deterministic by construction (same dog + same month => same plaque), the same
// honesty rule the rest of the app follows: it never rerolls on reload the way a
// free-running LLM would. The title is chosen by hashing name + monthLabel, so it
// stays put for a given month and rotates naturally as the months turn.
//
// There is NO AI here and NO fabricated stat — the highlights are generic,
// clearly-in-on-the-joke corporate lines (naps, tennis balls, belly rubs), never
// a real metric about the dog.

import type { Dogtype } from './dogtype';
import { DOGTYPE_CODES } from './dogtype';

export interface Plaque {
  /** The straight-faced corporate job title, e.g. "Chief Zoomies Officer". */
  title: string;
  /** 2–3 obviously-playful "performance highlights". */
  highlights: string[];
  /** The month this plaque is for, verbatim, e.g. "August 2026". */
  monthLabel: string;
  /** The Dogtype emoji, echoed for the card's brass badge. */
  emoji: string;
}

export interface PlaqueInput {
  /** The dog's computed Dogtype (from computeDogtype). Only code + emoji used. */
  dogtype: Pick<Dogtype, 'code' | 'emoji'>;
  /** The dog's name — part of the deterministic seed. */
  name?: string;
  /** A human month label, e.g. "August 2026". Part of the seed so the title
   *  rotates month to month but is stable within a month. */
  monthLabel: string;
}

// ── The title bank: 16 Dogtype codes × 6 corporate-absurd titles each ─────────
// Each list is themed to that type's personality (energy · play · social ·
// spirit). Straight-faced job titles — the comedy is in taking a dog completely
// seriously as a salaried employee.
const TITLES: Record<string, string[]> = {
  // Spark · Rowdy · Outgoing · Bold — the Zoomie Menace
  EROB: [
    'Senior VP of Squirrel Surveillance',
    'Chief Zoomies Officer',
    'Director of Rapid Unscheduled Sprinting',
    'Head of Perimeter Chaos Operations',
    'Executive Lead, Squirrel Interception',
    'Global Ambassador of Maximum Velocity',
  ],
  // Spark · Rowdy · Outgoing · Softie — the Party Puppy
  EROM: [
    'Chief Vibes Officer',
    'VP of Making Friends Immediately',
    'Director of Unscheduled Greetings',
    'Head of Park-Wide Enthusiasm',
    'Senior Manager of Tail-Wag Logistics',
    'Ambassador of Good Times & Belly Rubs',
  ],
  // Spark · Rowdy · Selective · Bold — the Rowdy Rebel
  ERSB: [
    'Chief Security Officer, Backyard Division',
    'VP of Selective Alliances',
    'Director of Strongly-Held Opinions',
    'Head of Guest-List Enforcement',
    'Senior Warden of the Inner Circle',
    'Executive of Loud, Confident Positions',
  ],
  // Spark · Rowdy · Selective · Softie — the Cautious Wildcard
  ERSM: [
    'VP of Cautious Enthusiasm',
    'Director of Slow-Warm Diplomacy',
    'Chief Officer of Second Impressions',
    'Head of Trust-But-Verify Sniffing',
    'Senior Coordinator of Careful Chaos',
    'Manager of Tentative Zoomies',
  ],
  // Spark · Gentle · Outgoing · Bold — the Social Butterfly
  EGOB: [
    'Chief Networking Officer',
    'VP of Park Relations',
    'Director of Universal Friendship',
    'Head of Wag-Based Outreach',
    'Global Ambassador of the Dog Park',
    'Senior Lead, New-Friend Acquisition',
  ],
  // Spark · Gentle · Outgoing · Softie — the Sunshine Sprite
  EGOM: [
    'Chief Happiness Officer',
    'VP of Sunshine & Wags',
    'Director of Contagious Optimism',
    'Head of Gentle Zoomies',
    'Ambassador of Everything-Is-Great',
    'Senior Specialist, Good Mornings',
  ],
  // Spark · Gentle · Selective · Bold — the Focused Explorer
  EGSB: [
    'Chief Sniffing & Reconnaissance Officer',
    'VP of Mission-Critical Exploration',
    'Director of Perimeter Intelligence',
    'Head of Scent-Based Analytics',
    'Senior Field Agent, Bush Division',
    'Executive of Focused Wandering',
  ],
  // Spark · Gentle · Selective · Softie — the Sensitive Sprinter
  EGSM: [
    'VP of Delicate Fast-Feet Operations',
    'Director of Careful Sprinting',
    'Chief Officer of Gentle Momentum',
    'Head of Soft-Hearted Reconnaissance',
    'Senior Coordinator of Trusted Zoomies',
    'Manager of Tender Velocity',
  ],
  // Zen · Rowdy · Outgoing · Bold — the Chill Clown
  ZROB: [
    'Chief Comedy Officer',
    'VP of Dramatic Flopping',
    'Director of Comic Relief',
    'Head of Low-Effort Shenanigans',
    'Senior Clown, Park Entertainment Division',
    'Executive of Unbothered Bits',
  ],
  // Zen · Rowdy · Outgoing · Softie — the Lazy Goofball
  ZROM: [
    'VP of Couch-Based Wrestling',
    'Director of Horizontal Fun',
    'Chief Officer of Low-Volume Chaos',
    'Head of Napping Between Bits',
    'Senior Manager of Minimal-Effort Goofs',
    'Ambassador of Slow-Motion Play',
  ],
  // Zen · Rowdy · Selective · Bold — the Sofa Bouncer
  ZRSB: [
    'Chief Officer of Scheduled Playtime',
    'VP of Selective Roughhousing',
    'Director of the Approved Guest List',
    'Head of Calm-Until-Provoked Operations',
    'Senior Warden of the Sofa',
    'Executive of Sudden Bursts',
  ],
  // Zen · Rowdy · Selective · Softie — the Grumble Snuggler
  ZRSM: [
    'VP of Grumbles & Cuddles',
    'Director of Selective Wrestling',
    'Chief Officer of Reluctant Affection',
    'Head of the Chosen-Few Program',
    'Senior Coordinator of Cozy Roughhousing',
    'Manager of Warm Complaints',
  ],
  // Zen · Gentle · Outgoing · Bold — the Gentle Diplomat
  ZGOB: [
    'Chief Peacekeeping Officer',
    'VP of Park Diplomacy',
    'Director of Conflict Resolution (Canine)',
    'Head of Universal Goodwill',
    'Senior Ambassador of Calm',
    'Executive of Making Everyone Welcome',
  ],
  // Zen · Gentle · Outgoing · Softie — the Velvet Couch Potato
  ZGOM: [
    'Chief Cuddling Officer',
    'VP of Professional Lounging',
    'Director of Couch Occupancy',
    'Head of Low-Volume Affection',
    'Senior Napping Specialist',
    'Ambassador of Elite Relaxation',
  ],
  // Zen · Gentle · Selective · Bold — the Quiet Sage
  ZGSB: [
    'Chief Wisdom Officer',
    'VP of Quiet Composure',
    'Director of Unbothered Observation',
    'Head of Strategic Stillness',
    'Senior Sage, Park Advisory Board',
    'Executive of Knowing Glances',
  ],
  // Zen · Gentle · Selective · Softie — the Old Soul
  ZGSM: [
    'Chief Officer of Quiet Loyalty',
    'VP of Deep Naps & Deeper Thoughts',
    'Director of Selective Devotion',
    'Head of Gentle Wisdom',
    'Senior Keeper of the Inner Circle',
    'Ambassador of Old-Soul Affairs',
  ],
};

// Generic, obviously-in-on-the-joke performance highlights. NONE of these is a
// real metric about the dog — they're the comedy equivalent of corporate filler,
// picked deterministically so the plaque stays stable for a given month.
const HIGHLIGHTS = [
  'Exceeded quarterly nap targets by a wide margin',
  '100% attendance record at all scheduled meals',
  'Zero unauthorized cats admitted to the premises',
  'Consistently reached the door before the doorbell finished',
  'Maintained a flawless record of looking adorable under pressure',
  'Led the department in enthusiasm per square foot',
  'Delivered belly rubs on time and under budget',
  'Recovered several lost tennis balls from behind the couch',
  'Set a new personal best in synchronized tail-wagging',
  'Handled every squirrel incident with maximum dedication',
  'Volunteered for each walk without being asked twice',
  'Kept team morale at record highs through strategic cuddling',
];

// djb2 — same hash used by shared/wanted.ts, kept identical so the whole app's
// deterministic toys share one well-behaved seeder.
function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Index-safe for ANY seed (including negatives) — mirrors shared/wanted.ts.
function pickIndex(len: number, seed: number): number {
  return ((Math.trunc(seed) % len) + len) % len;
}

/**
 * Compute a dog's Employee-of-the-Month plaque deterministically. Same name +
 * same month + same Dogtype => same plaque, every time. Returns null only when
 * the Dogtype code isn't one of the 16 known types (keeps the type honest).
 */
export function computePlaque(input: PlaqueInput | null | undefined): Plaque | null {
  if (!input || !input.dogtype) return null;
  const code = (input.dogtype.code || '').toUpperCase();
  const titles = TITLES[code];
  if (!titles || !DOGTYPE_CODES.includes(code)) return null;

  const monthLabel = input.monthLabel?.trim() || '';
  const seedSource = `${input.name ?? 'employee'}|${monthLabel}`;
  const seed = hashId(seedSource);

  const title = titles[pickIndex(titles.length, seed)];

  // Pick 3 DISTINCT highlights: a start index from the seed, then walk forward
  // (wrapping). Consecutive-wrap picks are always distinct while count <= length.
  const start = pickIndex(HIGHLIGHTS.length, seed >>> 5);
  const highlights: string[] = [];
  for (let i = 0; i < 3; i++) {
    highlights.push(HIGHLIGHTS[(start + i) % HIGHLIGHTS.length]);
  }

  return {
    title,
    highlights,
    monthLabel,
    emoji: input.dogtype.emoji || '🏆',
  };
}
