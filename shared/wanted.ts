// shared/wanted.ts
// "WANTED: Dead or Alive (Prefers Alive, for Treats)" — a deterministic Old-West
// wanted poster generated from a dog's REAL stored profile. This is a pure,
// honest parody: every "crime" is one of the owner's own stored behaviorFlags /
// notGoodWith / playStyles (or a clearly-generic playful charge when there
// aren't enough), just reworded into frontier comedy. The outlaw alias is a
// stable hash of the dog id, so the poster never rerolls on reload — the same
// dog is always the same outlaw.
//
// Nothing here is a claim about the dog that wasn't already on their profile,
// and there is no fabricated stat or percentage. It's a joke built entirely out
// of true things.

export interface WantedPoster {
  /** Stable outlaw alias, e.g. "Two-Bark Tumbleweed Pete". */
  alias: string;
  /** 3-6 reworded charges. Always at least 3 (generic playful fillers if needed). */
  crimes: string[];
  /** Playful bounty line. */
  reward: string;
}

export interface WantedInput {
  id?: string;
  name?: string;
  breed?: string;
  size?: 'S' | 'M' | 'L' | 'XL';
  energyLevel?: number;
  playStyles?: string[];
  behaviorFlags?: string[];
  notGoodWith?: string[];
  temperament?: string[];
}

// Curated outlaw aliases — frontier-flavored and dog-appropriate. The dog id
// picks one deterministically; a middle "handle" adds variety without needing
// a bigger list.
const ALIASES = [
  'Two-Bark Pete', 'The Kibble Kid', 'Sundance the Sniffer', 'Calamity Paws',
  'Dead-Eye Droolington', 'The Tumbleweed Terror', 'Wyatt Chirp', 'Butch Fassidy',
  'The Sockthief of Santa Fe', 'Rowdy McSnout', 'Jesse James the Very Good',
  'One-Ear Otis', 'The Bandit of Belly Rubs', 'Doc Hollerbark', 'Kansas City Kibbles',
  'Wild Bill Hiccup', 'The Prairie Pouncer', 'Sheriff-Botherer Sam', 'Muddy Boots Malone',
  'The Laredo Loafer',
];
const HANDLES = ['"Trouble"', '"Whiskers"', '"the Menace"', '"Biscuit"', '"Boots"', '"the Rascal"', '"Zoomies"', '"Snacks"'];

// Real stored fields → frontier crimes. Keys are the exact enum values.
const FLAG_CRIMES: Record<string, string> = {
  'resource guarding': 'Unlawful Hoarding of One (1) Bully Stick',
  'reactive on leash only': 'Disturbing the Peace (Leash District Only)',
  'easily overstimulated': 'Public Rowdiness in the First Degree',
  'not comfortable with strangers': 'Deep Suspicion of All Newcomers',
  'not comfortable with kids': 'Fleeing the Scene of Small Sticky Hands',
  'anxious with dogs': 'Nervous Loitering Outside the Saloon',
  'prefers calm dogs': 'Refusal to Associate with Known Rowdies',
  'needs slow introduction': 'Excessive Caution & Slow-Draw Greetings',
};
const PLAY_CRIMES: Record<string, string> = {
  'wrestling 🤼': 'Aggravated Wrestling of an Innocent Pillow',
  'high-energy runner ⚡': 'Reckless Zoomies in a Public Park',
  'loves fetch 🎾': 'Repeat Offense: Grand Theft Tennis Ball',
  'explorer 👃': 'Trespassing & Unlawful Sniffing',
  'gentle play 🐾': 'Suspicious Gentleness (Clearly Up to Something)',
  'calm 🧘': 'Loitering with Intent to Nap',
};
// NOTE: notGoodWith means "do NOT pair my dog with X" (an avoidance the owner
// stored), so these charges must preserve that direction — the dog AVOIDS X,
// never "does X" (which would assert the opposite of the profile).
const NOTGOODWITH_CRIMES: Record<string, string> = {
  'rough play': 'Refusal to Tolerate Barroom Brawls',
  'overstimulated': 'Fleeing an Overcrowded Watering Hole',
  'resource guarding dogs': 'Steering Clear of Known Stick-Hoarders',
  'off-leash dogs': 'Deep Distrust of Off-Leash Bandits',
  'high-energy dogs': 'Avoiding the Fast Crowd on Principle',
};

// Clearly-generic, obviously-playful fillers so a well-behaved dog still gets a
// full poster instead of a sad empty rap sheet. Framed so no one reads them as a
// real claim ("Suspected of…", "Alleged…").
const GENERIC_CRIMES = [
  'Suspicion of Aggravated Cuteness',
  'Possession of Unlawfully Soft Ears',
  'Alleged Theft of the Whole Dang Couch',
  'Being an Accessory to at Least One Nap Crime',
  'Impersonating a Good Boy (charges pending, likely true)',
  'Loitering Near the Treat Jar with Intent',
];

function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Index-safe for ANY seed (including negative ones from signed shifts) — JS
// negative modulo would otherwise return undefined and stringify onto the card.
function pick<T>(arr: T[], seed: number): T {
  const i = ((Math.trunc(seed) % arr.length) + arr.length) % arr.length;
  return arr[i];
}

export function computeWanted(input: WantedInput | null | undefined): WantedPoster | null {
  if (!input) return null;
  const seedSource = input.id || input.name || 'outlaw';
  const seed = hashId(seedSource);

  const alias = `${pick(ALIASES, seed)} ${pick(HANDLES, seed >>> 4)}`;

  // Gather real-derived crimes in a stable order, de-duplicated.
  const crimes: string[] = [];
  const add = (c?: string) => { if (c && !crimes.includes(c)) crimes.push(c); };

  for (const f of input.behaviorFlags ?? []) add(FLAG_CRIMES[f]);
  for (const p of input.playStyles ?? []) add(PLAY_CRIMES[p]);
  for (const n of input.notGoodWith ?? []) add(NOTGOODWITH_CRIMES[n]);

  // A couple derived from energy/size — still real, stored fields.
  if (typeof input.energyLevel === 'number' && input.energyLevel >= 75) {
    add('Excessive Zoomies in the First Degree');
  }
  if (input.size === 'L' || input.size === 'XL') {
    add('Impersonating a Lap Dog (repeatedly, without remorse)');
  }
  if (input.size === 'S') {
    add('Napoleon-Complex Barking at Much Larger Suspects');
  }

  // Floor: always at least 3 charges. Fill deterministically from the generic
  // list (stable by seed) so a gentle dog still gets a full, funny poster.
  let g = 0;
  while (crimes.length < 3 && g < GENERIC_CRIMES.length * 2) {
    add(pick(GENERIC_CRIMES, seed + g));
    g++;
  }
  // Cap at 6 so the poster stays readable.
  const finalCrimes = crimes.slice(0, 6);

  const rewards = [
    'Unlimited Belly Rubs',
    'One (1) Entire Rotisserie Chicken',
    'A Lifetime Supply of Squeaky Toys',
    'Belly Rubs & No Questions Asked',
  ];
  const reward = pick(rewards, seed >>> 8);

  return { alias, crimes: finalCrimes, reward };
}
