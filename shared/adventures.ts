// shared/adventures.ts
// The Dog Bucket List — a deck of playful real-world quests an owner can
// complete with their dog and "stamp" into an Adventure Passport. Completion is
// self-logged by the owner (honest: it's their own checklist, no claim is made
// about the dog), and the deck is personalized deterministically by the dog's
// energy/size so a couch-loving senior and a rocket-fueled puppy see a fitting
// order. Nothing here rerolls or fabricates a stat.

export interface Adventure {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  /** When set, this quest is surfaced first for a matching dog. */
  pref?: 'spark' | 'zen' | 'big' | 'small';
}

export interface AdventureInput {
  energyLevel?: number;
  size?: 'S' | 'M' | 'L' | 'XL';
}

// The full deck. Order here is the stable base order; personalization only moves
// matching quests to the front, never invents or hides quests.
const DECK: Adventure[] = [
  { id: 'park-bestie', emoji: '🐕', title: 'Make a park best friend', blurb: 'Find your dog their ride-or-die at the park.' },
  { id: 'pup-cup', emoji: '🍦', title: 'Score a pup cup', blurb: 'The first whipped-cream mustache is a core memory.' },
  { id: 'car-window', emoji: '🚗', title: 'Ears in the wind', blurb: 'Window down, ears flapping, zero thoughts.' },
  { id: 'run-till-flop', emoji: '⚡', title: 'Run until you flop', blurb: 'Full send at the field until the dramatic collapse.', pref: 'spark' },
  { id: 'three-hour-nap', emoji: '😴', title: 'The three-hour nap', blurb: 'A napping performance for the ages, in a sunbeam.', pref: 'zen' },
  { id: 'first-swim', emoji: '🏊', title: 'Take the first swim', blurb: 'From "absolutely not" to "why is the lake mine now".' },
  { id: 'new-trick', emoji: '🎓', title: 'Learn a brand-new trick', blurb: 'Spin, shake, or the elusive "roll over".' },
  { id: 'sunset', emoji: '🌅', title: 'Watch a sunset together', blurb: 'Just the two of you and the whole sky.' },
  { id: 'intimidate', emoji: '🦁', title: 'Out-bark a giant', blurb: 'Stand your ground against a dog three times your size.', pref: 'small' },
  { id: 'lap-anyway', emoji: '🛋️', title: 'Fit in a lap anyway', blurb: 'You are not a lap dog. You will not be told otherwise.', pref: 'big' },
  { id: 'patio', emoji: '🍔', title: 'Claim a patio', blurb: 'Become a regular at a dog-friendly spot.' },
  { id: 'big-hole', emoji: '⛏️', title: 'Dig the greatest hole', blurb: 'An engineering marvel. The yard will recover.' },
  { id: 'treat-catch', emoji: '🍿', title: 'Catch a treat mid-air', blurb: 'The clip that goes in the highlight reel.' },
  { id: 'mailbox-100', emoji: '📮', title: 'Sniff 100 mailboxes', blurb: 'A full investigative sweep of the neighborhood.' },
  { id: 'chase-champ', emoji: '🏃', title: 'Win an epic game of chase', blurb: 'Undefeated. Undisputed. Slightly out of breath.', pref: 'spark' },
  { id: 'picnic-supervisor', emoji: '🧺', title: 'Supervise a picnic', blurb: 'Oversee all snacks from the comfort of the blanket.', pref: 'zen' },
  { id: 'vacuum-win', emoji: '🧹', title: 'Defeat the vacuum', blurb: 'Bark at it and emerge, once again, victorious.' },
  { id: 'costume', emoji: '🎃', title: 'Survive a costume', blurb: 'Endure the outfit long enough for one great photo.' },
];

export const ADVENTURE_COUNT = DECK.length;

function matchesPref(a: Adventure, input: AdventureInput): boolean {
  if (!a.pref) return false;
  const energy = typeof input.energyLevel === 'number' ? input.energyLevel : 50;
  switch (a.pref) {
    case 'spark': return energy >= 60;
    case 'zen': return energy <= 40;
    case 'big': return input.size === 'L' || input.size === 'XL';
    case 'small': return input.size === 'S';
    default: return false;
  }
}

/** The deck, with quests that fit this dog moved to the front (stable order). */
export function adventuresFor(input: AdventureInput | null | undefined): Adventure[] {
  const inp = input ?? {};
  const preferred = DECK.filter((a) => matchesPref(a, inp));
  const rest = DECK.filter((a) => !matchesPref(a, inp));
  return [...preferred, ...rest];
}
