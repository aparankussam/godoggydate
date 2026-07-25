export type DogSize = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface Breed {
  id: string;
  name: string;
  group: BreedGroup;
  typicalSize: DogSize;
  typicalEnergyMin: number; // 0–100
  typicalEnergyMax: number;
  traits: string[];
  compatibleSizes: DogSize[];
  notes?: string;
}

export type BreedGroup =
  | 'herding'
  | 'hound'
  | 'non-sporting'
  | 'sporting'
  | 'terrier'
  | 'toy'
  | 'working'
  | 'mixed';

export const BREEDS: Breed[] = [
  // ── HERDING ──────────────────────────────────────────────────────────────
  {
    id: 'australian-shepherd',
    name: 'Australian Shepherd',
    group: 'herding',
    typicalSize: 'M',
    typicalEnergyMin: 75,
    typicalEnergyMax: 95,
    traits: ['intelligent', 'athletic', 'loyal'],
    compatibleSizes: ['S', 'M', 'L'],
  },
  {
    id: 'border-collie',
    name: 'Border Collie',
    group: 'herding',
    typicalSize: 'M',
    typicalEnergyMin: 80,
    typicalEnergyMax: 100,
    traits: ['highly-intelligent', 'intense', 'agile'],
    compatibleSizes: ['S', 'M', 'L'],
    notes: 'May herd other dogs. Needs high-activity match.',
  },
  {
    id: 'corgi-pembroke',
    name: 'Pembroke Welsh Corgi',
    group: 'herding',
    typicalSize: 'S',
    typicalEnergyMin: 60,
    typicalEnergyMax: 80,
    traits: ['clever', 'playful', 'bold'],
    compatibleSizes: ['XS', 'S', 'M'],
  },
  {
    id: 'sheltie',
    name: 'Shetland Sheepdog',
    group: 'herding',
    typicalSize: 'S',
    typicalEnergyMin: 55,
    typicalEnergyMax: 75,
    traits: ['sensitive', 'reserved', 'agile'],
    compatibleSizes: ['XS', 'S', 'M'],
    notes: 'Can be shy with strangers initially.',
  },

  // ── SPORTING ─────────────────────────────────────────────────────────────
  {
    id: 'golden-retriever',
    name: 'Golden Retriever',
    group: 'sporting',
    typicalSize: 'L',
    typicalEnergyMin: 60,
    typicalEnergyMax: 80,
    traits: ['friendly', 'gentle', 'outgoing'],
    compatibleSizes: ['S', 'M', 'L', 'XL'],
  },
  {
    id: 'labrador-retriever',
    name: 'Labrador Retriever',
    group: 'sporting',
    typicalSize: 'L',
    typicalEnergyMin: 65,
    typicalEnergyMax: 85,
    traits: ['enthusiastic', 'social', 'mouthy'],
    compatibleSizes: ['S', 'M', 'L', 'XL'],
  },
  {
    id: 'cocker-spaniel',
    name: 'Cocker Spaniel',
    group: 'sporting',
    typicalSize: 'M',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['gentle', 'sensitive', 'playful'],
    compatibleSizes: ['XS', 'S', 'M', 'L'],
  },
  {
    id: 'vizsla',
    name: 'Vizsla',
    group: 'sporting',
    typicalSize: 'M',
    typicalEnergyMin: 75,
    typicalEnergyMax: 95,
    traits: ['affectionate', 'energetic', 'velcro-dog'],
    compatibleSizes: ['M', 'L'],
  },
  {
    id: 'weimaraner',
    name: 'Weimaraner',
    group: 'sporting',
    typicalSize: 'L',
    typicalEnergyMin: 70,
    typicalEnergyMax: 90,
    traits: ['athletic', 'fearless', 'friendly'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'brittany',
    name: 'Brittany Spaniel',
    group: 'sporting',
    typicalSize: 'M',
    typicalEnergyMin: 70,
    typicalEnergyMax: 90,
    traits: ['agile', 'happy', 'eager'],
    compatibleSizes: ['S', 'M', 'L'],
  },

  // ── HOUND ─────────────────────────────────────────────────────────────────
  {
    id: 'beagle',
    name: 'Beagle',
    group: 'hound',
    typicalSize: 'S',
    typicalEnergyMin: 55,
    typicalEnergyMax: 75,
    traits: ['curious', 'merry', 'nose-led'],
    compatibleSizes: ['XS', 'S', 'M', 'L'],
  },
  {
    id: 'dachshund',
    name: 'Dachshund',
    group: 'hound',
    typicalSize: 'XS',
    typicalEnergyMin: 45,
    typicalEnergyMax: 65,
    traits: ['curious', 'stubborn', 'brave'],
    compatibleSizes: ['XS', 'S'],
    notes: 'Long spine — avoid rough play with larger dogs.',
  },
  {
    id: 'basset-hound',
    name: 'Basset Hound',
    group: 'hound',
    typicalSize: 'M',
    typicalEnergyMin: 25,
    typicalEnergyMax: 50,
    traits: ['laid-back', 'friendly', 'stubborn'],
    compatibleSizes: ['XS', 'S', 'M'],
  },
  {
    id: 'greyhound',
    name: 'Greyhound',
    group: 'hound',
    typicalSize: 'L',
    typicalEnergyMin: 40,
    typicalEnergyMax: 65,
    traits: ['gentle', 'sensitive', 'sprinter'],
    compatibleSizes: ['M', 'L'],
    notes: 'Sprints in bursts; often couch-potatoes otherwise.',
  },
  {
    id: 'whippet',
    name: 'Whippet',
    group: 'hound',
    typicalSize: 'M',
    typicalEnergyMin: 45,
    typicalEnergyMax: 65,
    traits: ['gentle', 'affectionate', 'fast'],
    compatibleSizes: ['S', 'M', 'L'],
  },

  // ── NON-SPORTING ──────────────────────────────────────────────────────────
  {
    id: 'french-bulldog',
    name: 'French Bulldog',
    group: 'non-sporting',
    typicalSize: 'S',
    typicalEnergyMin: 35,
    typicalEnergyMax: 55,
    traits: ['playful', 'adaptable', 'alert'],
    compatibleSizes: ['XS', 'S', 'M'],
    notes: 'Brachycephalic — avoid extreme heat/exertion.',
  },
  {
    id: 'bulldog',
    name: 'English Bulldog',
    group: 'non-sporting',
    typicalSize: 'M',
    typicalEnergyMin: 20,
    typicalEnergyMax: 45,
    traits: ['docile', 'friendly', 'calm'],
    compatibleSizes: ['XS', 'S', 'M'],
    notes: 'Brachycephalic — keep sessions short in warm weather.',
  },
  {
    id: 'poodle-standard',
    name: 'Poodle (Standard)',
    group: 'non-sporting',
    typicalSize: 'M',
    typicalEnergyMin: 60,
    typicalEnergyMax: 80,
    traits: ['highly-intelligent', 'athletic', 'proud'],
    compatibleSizes: ['S', 'M', 'L'],
  },
  {
    id: 'boston-terrier',
    name: 'Boston Terrier',
    group: 'non-sporting',
    typicalSize: 'S',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['friendly', 'lively', 'bright'],
    compatibleSizes: ['XS', 'S', 'M'],
  },
  {
    id: 'dalmatian',
    name: 'Dalmatian',
    group: 'non-sporting',
    typicalSize: 'L',
    typicalEnergyMin: 70,
    typicalEnergyMax: 90,
    traits: ['active', 'dignified', 'outgoing'],
    compatibleSizes: ['M', 'L', 'XL'],
  },

  // ── TOY ───────────────────────────────────────────────────────────────────
  {
    id: 'shih-tzu',
    name: 'Shih Tzu',
    group: 'toy',
    typicalSize: 'XS',
    typicalEnergyMin: 30,
    typicalEnergyMax: 50,
    traits: ['affectionate', 'outgoing', 'gentle'],
    compatibleSizes: ['XS', 'S'],
  },
  {
    id: 'cavalier-kcs',
    name: 'Cavalier King Charles Spaniel',
    group: 'toy',
    typicalSize: 'S',
    typicalEnergyMin: 40,
    typicalEnergyMax: 60,
    traits: ['gentle', 'adaptable', 'social'],
    compatibleSizes: ['XS', 'S', 'M'],
  },
  {
    id: 'chihuahua',
    name: 'Chihuahua',
    group: 'toy',
    typicalSize: 'XS',
    typicalEnergyMin: 40,
    typicalEnergyMax: 65,
    traits: ['feisty', 'loyal', 'alert'],
    compatibleSizes: ['XS', 'S'],
    notes: 'Fragile — only safe with similarly sized dogs.',
  },
  {
    id: 'pomeranian',
    name: 'Pomeranian',
    group: 'toy',
    typicalSize: 'XS',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['vivacious', 'bold', 'social'],
    compatibleSizes: ['XS', 'S'],
  },
  {
    id: 'maltese',
    name: 'Maltese',
    group: 'toy',
    typicalSize: 'XS',
    typicalEnergyMin: 35,
    typicalEnergyMax: 55,
    traits: ['gentle', 'responsive', 'sweet'],
    compatibleSizes: ['XS', 'S'],
  },

  // ── TERRIER ───────────────────────────────────────────────────────────────
  {
    id: 'jack-russell',
    name: 'Jack Russell Terrier',
    group: 'terrier',
    typicalSize: 'S',
    typicalEnergyMin: 75,
    typicalEnergyMax: 95,
    traits: ['tenacious', 'energetic', 'clever'],
    compatibleSizes: ['XS', 'S', 'M'],
    notes: 'High prey drive — may chase smaller dogs.',
  },
  {
    id: 'west-highland-terrier',
    name: 'West Highland White Terrier',
    group: 'terrier',
    typicalSize: 'S',
    typicalEnergyMin: 55,
    typicalEnergyMax: 75,
    traits: ['confident', 'friendly', 'hardy'],
    compatibleSizes: ['XS', 'S', 'M'],
  },
  {
    id: 'scottish-terrier',
    name: 'Scottish Terrier',
    group: 'terrier',
    typicalSize: 'S',
    typicalEnergyMin: 45,
    typicalEnergyMax: 65,
    traits: ['spirited', 'independent', 'loyal'],
    compatibleSizes: ['XS', 'S'],
    notes: 'Can be reserved with other dogs.',
  },
  {
    id: 'bull-terrier',
    name: 'Bull Terrier',
    group: 'terrier',
    typicalSize: 'M',
    typicalEnergyMin: 65,
    typicalEnergyMax: 85,
    traits: ['playful', 'mischievous', 'strong'],
    compatibleSizes: ['M', 'L'],
    notes: 'Needs a confident, robust playmate.',
  },

  // ── WORKING ───────────────────────────────────────────────────────────────
  {
    id: 'bernese-mountain-dog',
    name: 'Bernese Mountain Dog',
    group: 'working',
    typicalSize: 'XL',
    typicalEnergyMin: 45,
    typicalEnergyMax: 65,
    traits: ['gentle-giant', 'calm', 'loyal'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'boxer',
    name: 'Boxer',
    group: 'working',
    typicalSize: 'L',
    typicalEnergyMin: 65,
    typicalEnergyMax: 85,
    traits: ['playful', 'bright', 'active'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'rottweiler',
    name: 'Rottweiler',
    group: 'working',
    typicalSize: 'XL',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['loyal', 'confident', 'calm'],
    compatibleSizes: ['M', 'L', 'XL'],
    notes: 'Strong; suited to similarly confident, robust dogs.',
  },
  {
    id: 'siberian-husky',
    name: 'Siberian Husky',
    group: 'working',
    typicalSize: 'M',
    typicalEnergyMin: 70,
    typicalEnergyMax: 90,
    traits: ['outgoing', 'mischievous', 'athletic'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'samoyed',
    name: 'Samoyed',
    group: 'working',
    typicalSize: 'M',
    typicalEnergyMin: 60,
    typicalEnergyMax: 80,
    traits: ['friendly', 'gentle', 'adaptable'],
    compatibleSizes: ['S', 'M', 'L'],
  },
  {
    id: 'doberman',
    name: 'Doberman Pinscher',
    group: 'working',
    typicalSize: 'L',
    typicalEnergyMin: 65,
    typicalEnergyMax: 85,
    traits: ['loyal', 'fearless', 'athletic'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'great-dane',
    name: 'Great Dane',
    group: 'working',
    typicalSize: 'XL',
    typicalEnergyMin: 35,
    typicalEnergyMax: 60,
    traits: ['gentle-giant', 'friendly', 'patient'],
    compatibleSizes: ['M', 'L', 'XL'],
    notes: 'Gentle but very large — avoid rough play with small dogs.',
  },

  // ── MORE COMMON BREEDS (previously missing — silently scored as "mixed") ───
  {
    id: 'german-shepherd',
    name: 'German Shepherd',
    group: 'herding',
    typicalSize: 'L',
    typicalEnergyMin: 65,
    typicalEnergyMax: 85,
    traits: ['confident', 'loyal', 'intelligent'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'australian-cattle-dog',
    name: 'Australian Cattle Dog',
    group: 'herding',
    typicalSize: 'M',
    typicalEnergyMin: 80,
    typicalEnergyMax: 100,
    traits: ['smart', 'tenacious', 'independent'],
    compatibleSizes: ['S', 'M', 'L'],
    notes: 'High prey/herding drive — needs an active match.',
  },
  {
    id: 'american-pit-bull-terrier',
    name: 'American Pit Bull Terrier',
    group: 'terrier',
    typicalSize: 'M',
    typicalEnergyMin: 60,
    typicalEnergyMax: 85,
    traits: ['affectionate', 'strong', 'people-oriented'],
    compatibleSizes: ['M', 'L'],
    notes: 'Can be dog-selective — go slow on first intros regardless of size match.',
  },
  {
    id: 'yorkshire-terrier',
    name: 'Yorkshire Terrier',
    group: 'toy',
    typicalSize: 'XS',
    typicalEnergyMin: 45,
    typicalEnergyMax: 65,
    traits: ['feisty', 'affectionate', 'bold'],
    compatibleSizes: ['XS', 'S'],
    notes: 'Fragile — only safe with similarly sized dogs.',
  },
  {
    id: 'pug',
    name: 'Pug',
    group: 'toy',
    typicalSize: 'S',
    typicalEnergyMin: 30,
    typicalEnergyMax: 50,
    traits: ['playful', 'charming', 'sociable'],
    compatibleSizes: ['XS', 'S', 'M'],
    notes: 'Brachycephalic — avoid extreme heat/exertion.',
  },
  {
    id: 'cane-corso',
    name: 'Cane Corso',
    group: 'working',
    typicalSize: 'XL',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['calm', 'protective', 'confident'],
    compatibleSizes: ['L', 'XL'],
    notes: 'Large and strong — best matched with confident, similarly robust dogs.',
  },

  // ── MIXED / POPULAR DESIGNER ──────────────────────────────────────────────
  {
    id: 'shiba-inu',
    name: 'Shiba Inu',
    group: 'non-sporting',
    typicalSize: 'M',
    typicalEnergyMin: 55,
    typicalEnergyMax: 75,
    traits: ['independent', 'alert', 'clean'],
    compatibleSizes: ['S', 'M'],
    notes: 'Can be selective about dog friends — go slow.',
  },
  {
    id: 'golden-doodle',
    name: 'Goldendoodle',
    group: 'mixed',
    typicalSize: 'M',
    typicalEnergyMin: 60,
    typicalEnergyMax: 80,
    traits: ['social', 'playful', 'gentle'],
    compatibleSizes: ['S', 'M', 'L'],
  },
  {
    id: 'labradoodle',
    name: 'Labradoodle',
    group: 'mixed',
    typicalSize: 'M',
    typicalEnergyMin: 65,
    typicalEnergyMax: 85,
    traits: ['energetic', 'friendly', 'intelligent'],
    compatibleSizes: ['S', 'M', 'L'],
  },
  {
    id: 'cockapoo',
    name: 'Cockapoo',
    group: 'mixed',
    typicalSize: 'S',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['affectionate', 'playful', 'low-shedding'],
    compatibleSizes: ['XS', 'S', 'M'],
  },
  {
    id: 'bernedoodle',
    name: 'Bernedoodle',
    group: 'mixed',
    typicalSize: 'L',
    typicalEnergyMin: 50,
    typicalEnergyMax: 70,
    traits: ['gentle', 'playful', 'loyal'],
    compatibleSizes: ['M', 'L', 'XL'],
  },
  {
    id: 'aussiedoodle',
    name: 'Aussiedoodle',
    group: 'mixed',
    typicalSize: 'M',
    typicalEnergyMin: 70,
    typicalEnergyMax: 90,
    traits: ['clever', 'energetic', 'affectionate'],
    compatibleSizes: ['S', 'M', 'L'],
  },
  {
    id: 'mixed-breed',
    name: 'Mixed Breed',
    group: 'mixed',
    typicalSize: 'M',
    typicalEnergyMin: 40,
    typicalEnergyMax: 80,
    traits: ['unique', 'resilient', 'lovable'],
    compatibleSizes: ['XS', 'S', 'M', 'L', 'XL'],
  },
];

// Lookup helpers
export const BREEDS_BY_ID = Object.fromEntries(BREEDS.map((b) => [b.id, b]));

export const BREEDS_BY_GROUP = BREEDS.reduce(
  (acc, b) => {
    if (!acc[b.group]) acc[b.group] = [];
    acc[b.group].push(b);
    return acc;
  },
  {} as Record<BreedGroup, Breed[]>,
);

export function searchBreeds(query: string): Breed[] {
  const q = query.toLowerCase().trim();
  if (!q) return BREEDS;
  return BREEDS.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.group.includes(q) ||
      b.traits.some((t) => t.includes(q)),
  );
}

export function getBreedById(id: string): Breed | undefined {
  return BREEDS_BY_ID[id];
}

const MIXED_BREED_FALLBACK: Breed = BREEDS_BY_ID['mixed-breed'];

// Common nicknames/shorthand that don't substring-match their formal catalogue
// name (e.g. "Yorkie" vs "Yorkshire Terrier" share no substring).
const BREED_ALIASES: Record<string, string> = {
  yorkie: 'yorkshire-terrier',
  doxie: 'dachshund',
  weenie: 'dachshund',
  frenchie: 'french-bulldog',
  gsd: 'german-shepherd',
  'german shepherd dog': 'german-shepherd',
  lab: 'labrador-retriever',
  'lab mix': 'labrador-retriever',
  pittie: 'american-pit-bull-terrier',
  'pit bull': 'american-pit-bull-terrier',
  pitbull: 'american-pit-bull-terrier',
  'staffordshire terrier': 'american-pit-bull-terrier',
  'am staff': 'american-pit-bull-terrier',
  westie: 'west-highland-terrier',
  'jack russell': 'jack-russell',
  jrt: 'jack-russell',
  'mini dachshund': 'dachshund',
  'miniature dachshund': 'dachshund',
  'standard poodle': 'poodle-standard',
  poodle: 'poodle-standard',
  husky: 'siberian-husky',
  cattle: 'australian-cattle-dog',
  'blue heeler': 'australian-cattle-dog',
  heeler: 'australian-cattle-dog',
  'cavalier king charles': 'cavalier-kcs',
  'king charles spaniel': 'cavalier-kcs',
  corgi: 'corgi-pembroke',
  doodle: 'labradoodle',
};

/**
 * Resolves a free-text breed string (as stored on DogProfile.breed, which is
 * a plain user-typed/datalist value — not a breed id) to its catalogue entry.
 * Real profile data includes things like "Mini Dachshund" or "mini" that
 * don't exactly match a BREEDS[].name, so this falls back through:
 *   1. exact name match (case-insensitive)
 *   2. a common-nickname alias table (handles "Yorkie", "Frenchie", "GSD",
 *      "pit bull" — real user shorthand that shares no substring with the
 *      formal AKC name)
 *   3. substring match in either direction (handles "Mini Dachshund" -> "Dachshund",
 *      "Corgi" -> "Pembroke Welsh Corgi", "Goldendoodle mix" -> "Goldendoodle")
 *   4. the generic "Mixed Breed" entry, so callers always get real typical
 *      size/energy/traits instead of guessing at an unmapped string.
 * Never throws — always returns a Breed.
 */
export function resolveBreed(breedInput: string | undefined | null): Breed {
  const raw = (breedInput ?? '').trim().toLowerCase();
  if (!raw) return MIXED_BREED_FALLBACK;

  const exact = BREEDS.find((b) => b.name.toLowerCase() === raw);
  if (exact) return exact;

  const aliasId = BREED_ALIASES[raw];
  if (aliasId && BREEDS_BY_ID[aliasId]) return BREEDS_BY_ID[aliasId];

  // Substring matching on anything shorter than 3 characters is nonsense —
  // "a" is a substring of nearly every breed name, so it always "matched"
  // whichever catalogue entry happened to be longest (Cavalier King Charles
  // Spaniel), regardless of what was actually typed. Exact match and the
  // alias table above already handle legitimate short names (Pug, etc).
  if (raw.length < 3) return MIXED_BREED_FALLBACK;

  // Prefer the longest matching catalogue name so "Mini Dachshund" doesn't
  // accidentally prefer a shorter unrelated match over "Dachshund".
  const substringMatches = BREEDS.filter(
    (b) => raw.includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(raw),
  ).sort((a, b) => b.name.length - a.name.length);
  if (substringMatches.length > 0) return substringMatches[0];

  return MIXED_BREED_FALLBACK;
}

/** Returns size-compatibility warning if sizes are unsafe together */
export function getSizeWarning(
  sizeA: DogSize,
  sizeB: DogSize,
): string | null {
  const sizes: DogSize[] = ['XS', 'S', 'M', 'L', 'XL'];
  const diff = Math.abs(sizes.indexOf(sizeA) - sizes.indexOf(sizeB));
  if (diff >= 3) return 'Very large size difference — close supervision recommended.';
  if (diff === 2 && (sizeA === 'XS' || sizeB === 'XS'))
    return 'Small dog may be at risk — supervised intro strongly advised.';
  return null;
}
