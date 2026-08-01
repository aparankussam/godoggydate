// shared/data/seedDogs.ts
// High-quality seed profiles. Every dog satisfies isProfileComplete():
//   photos.length >= 3, name + breed + age + size + energyLevel,
//   playStyles.length >= 1 (serves as temperament), location exists.
// Consumed by: web's guest-facing Matching Lab demo (web/lib/discover.ts)
// and scripts/seed.ts (npm run seed:dev, populates a local Firestore).

import type { DogProfile } from '../types';

// Photo helpers — all verified Unsplash dog photos
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&q=80&auto=format&fit=crop`;

// Curated pool by breed / coat type
const PHOTOS = {
  // Dachshunds
  dachy1: U('1548199973-03cce0bbc87b'), // running dachshund in water
  dachy2: U('1612348054381-cdb23c7c7779'), // dachshund portrait
  dachy3: U('1518717758536-85ae29035b6d'), // small dog in grass

  // Golden / Lab
  golden1: U('1587300003388-59208cc962cb'), // golden retriever (confirmed)
  golden2: U('1552053831-71594a27632d'),    // retriever in field
  golden3: U('1530281700549-e82e7bf110d6'), // labrador retriever

  // Shiba / Spitz
  shiba1: U('1546513791-4d6e43e9f0e5'),   // shiba inu (confirmed)
  shiba2: U('1561037404-61cd46aa615b'),   // spitz-type dog
  shiba3: U('1568572933382-74d440642117'), // dog portrait

  // Husky / Nordic
  husky1: U('1605568427561-40dd23c2acea'), // husky
  husky2: U('1617901326599-87e3a9d7e9a7'), // husky outdoors
  husky3: U('1596492784531-27b8c90bef03'), // northern breed

  // Herding / Working
  collie1: U('1535268244-7ed5f43ba75e'),   // border collie
  collie2: U('1568572933382-74d440642117'), // dog in field
  collie3: U('1518717758536-85ae29035b6d'), // active dog

  // Corgi
  corgi1: U('1586671267731-da2cf3ceeb80'), // corgi (confirmed)
  corgi2: U('1560807707-8cc77767d783'),    // corgi portrait
  corgi3: U('1552053831-71594a27632d'),    // small dog

  // Large fluffs (Samoyed / Bernese)
  fluffy1: U('1552053831-71594a27632d'),   // large fluffy dog
  fluffy2: U('1583511655857-d19b40a7a54e'), // white/fluffy dog
  fluffy3: U('1530281700549-e82e7bf110d6'), // large dog

  // Small / Toy
  small1: U('1583511655857-d19b40a7a54e'), // small dog portrait
  small2: U('1548199973-03cce0bbc87b'),    // small dog running
  small3: U('1561037404-61cd46aa615b'),    // small dog

  // Beagle / Hound
  beagle1: U('1588943211346-0908a1fb0b01'), // beagle
  beagle2: U('1568572933382-74d440642117'), // hound dog
  beagle3: U('1518717758536-85ae29035b6d'), // dog in grass

  // Poodle / Doodle
  poodle1: U('1561037404-61cd46aa615b'),   // curly dog
  poodle2: U('1583511655857-d19b40a7a54e'), // fluffy dog
  poodle3: U('1552053831-71594a27632d'),   // elegant dog

  // Athletic / Vizsla / Aussie
  athlete1: U('1530281700549-e82e7bf110d6'), // athletic dog
  athlete2: U('1587300003388-59208cc962cb'), // dog running
  athlete3: U('1605568427561-40dd23c2acea'), // energetic dog
};

const DEFAULT_PROMPTS = [
  'My dog\'s personality in 3 words:',
  'Perfect playdate looks like:',
  'Things my dog loves:',
];

export const SEED_DOGS: Omit<DogProfile, 'id' | 'ownerId' | 'trustScore' | 'totalMeetups' | 'createdAt' | 'updatedAt'>[] = [
  // ── Index 0: Kaju — the founder dog (user's reference dog) ───────────────
  {
    name: 'Kaju', breed: 'Mini Dachshund', purebred: true,
    size: 'S', age: 'adult', sex: 'M', fixed: true, energyLevel: 70,
    photos: ['/images/kaju-profile.jpg', PHOTOS.dachy1, PHOTOS.dachy2],
    goodWith: ['small dogs', 'medium dogs', 'large dogs', 'calm dogs', 'all dogs'],
    notGoodWith: [],
    playStyles: ['loves fetch 🎾', 'explorer 👃'],
    temperament: ['Playful 🎮', 'Friendly 😊', 'Social butterfly 🦋'],
    location: 'Williamsburg, Brooklyn',
    lat: 40.7081, lng: -73.9571,
    prompts: [
      { prompt: DEFAULT_PROMPTS[0], answer: 'Goofy, fearless, treats-obsessed' },
      { prompt: DEFAULT_PROMPTS[1], answer: 'Sniff walk followed by zoomies in the park' },
      { prompt: DEFAULT_PROMPTS[2], answer: 'Hide-and-seek with treats, belly scratches, and new friends' },
    ],
    boundaries: [], allergies: [], specialNeeds: [], behaviorFlags: [],
    vaccinated: true, vetChecked: true, mode: 'playdate',
    bio: 'Goofy mini dachshund who acts 10 feet tall. Social butterfly who loves belly scratches and anyone willing to play hide-and-seek with treats.',
  },

  // ── 🟢 Strong match: same breed group, similar energy ────────────────────
  {
    name: 'Noodle', breed: 'Dachshund', purebred: true,
    size: 'S', age: 'adult', sex: 'M', fixed: true, energyLevel: 55,
    photos: [PHOTOS.dachy1, PHOTOS.dachy2, PHOTOS.dachy3],
    goodWith: ['small dogs', 'calm dogs'],
    notGoodWith: ['large dogs', 'rough play'],
    playStyles: ['explorer 👃', 'gentle play 🐾'],
    temperament: ['Gentle 🕊️', 'Calm 🧘', 'Independent 🦅'],
    location: 'Park Slope, Brooklyn',
    lat: 40.6682, lng: -73.9797,
    prompts: [
      { prompt: DEFAULT_PROMPTS[0], answer: 'Curious, stubborn, cuddly' },
      { prompt: DEFAULT_PROMPTS[1], answer: 'A long sniff walk, then a nap on a warm lap' },
      { prompt: DEFAULT_PROMPTS[2], answer: 'Following interesting smells and belly rubs' },
    ],
    boundaries: ['no toy sharing'],
    allergies: [], specialNeeds: [], behaviorFlags: [],
    vaccinated: true, vetChecked: true, mode: 'playdate',
    bio: 'Big personality in a tiny package. Loves epic sniff walks and takes his time warming up to new friends.',
  },

  // ── 🟡 Good fit, mild energy mismatch ────────────────────────────────────
  {
    name: 'Poppy', breed: 'Cavalier King Charles Spaniel', purebred: true,
    size: 'S', age: 'adult', sex: 'F', fixed: true, energyLevel: 45,
    photos: [PHOTOS.small1, PHOTOS.small2, PHOTOS.small3],
    goodWith: ['calm dogs', 'small dogs'],
    notGoodWith: ['high-energy dogs', 'rough play', 'large dogs'],
    playStyles: ['gentle play 🐾', 'calm 🧘'],
    temperament: ['Gentle 🕊️', 'Calm 🧘', 'Shy at first 🙈'],
    location: 'Carroll Gardens, Brooklyn',
    lat: 40.6795, lng: -73.9993,
    prompts: [
      { prompt: DEFAULT_PROMPTS[0], answer: 'Sweet, gentle, patient' },
      { prompt: DEFAULT_PROMPTS[1], answer: 'Calm park stroll, then cuddles on the bench' },
      { prompt: DEFAULT_PROMPTS[2], answer: 'Soft toys, gentle pets, and mellow companions' },
    ],
    boundaries: ['short sessions', 'slow warm-up'],
    allergies: [], specialNeeds: [], behaviorFlags: ['prefers calm dogs'],
    vaccinated: true, vetChecked: true, mode: 'playdate',
    bio: 'Short walks, gentle cuddles. Ideal for calm, mellow playdates. Needs a slow intro but bonds deeply once comfortable.',
  },

  // ── 🔴 Size safety mismatch (blocked for small dogs) ─────────────────────
  {
    name: 'Luna', breed: 'Siberian Husky', purebred: true,
    size: 'L', age: 'adult', sex: 'F', fixed: true, energyLevel: 88,
    photos: [PHOTOS.husky1, PHOTOS.husky2, PHOTOS.husky3],
    goodWith: ['large dogs', 'high-energy dogs'],
    notGoodWith: ['small dogs', 'puppies'],
    playStyles: ['high-energy runner ⚡', 'wrestling 🤼'],
    temperament: ['Energetic ⚡', 'Independent 🦅', 'Playful 🎮'],
    location: 'Astoria, Queens',
    lat: 40.7721, lng: -73.9303,
    prompts: [
      { prompt: DEFAULT_PROMPTS[0], answer: 'Wild, fast, stunning' },
      { prompt: DEFAULT_PROMPTS[1], answer: 'Full sprint in the dog park until we both collapse' },
      { prompt: DEFAULT_PROMPTS[2], answer: 'Trail runs, cold weather, and another dog who can keep up' },
    ],
    boundaries: [],
    allergies: [], specialNeeds: [], behaviorFlags: [],
    vaccinated: true, vetChecked: true, mode: 'playdate',
    bio: 'Trail runs and fetch are her love language. Pure athlete who needs a partner who matches her intensity.',
  },

  // ── The ultimate people-pleaser ───────────────────────────────────────────
  {
    name: 'Biscuit', breed: 'Golden Retriever', purebred: true,
    size: 'L', age: 'adult', sex: 'M', fixed: true, energyLevel: 85,
    photos: [PHOTOS.golden2, PHOTOS.golden1, PHOTOS.golden3],
    goodWith: ['small dogs', 'large dogs', 'puppies', 'high-energy dogs', 'all dogs'],
    notGoodWith: [],
    playStyles: ['loves fetch 🎾', 'high-energy runner ⚡'],
    temperament: ['Friendly 😊', 'Playful 🎮', 'Social butterfly 🦋'],
    location: 'West Village, Manhattan',
    lat: 40.7338, lng: -74.0058,
    prompts: [
      { prompt: DEFAULT_PROMPTS[0], answer: 'Joyful, gentle, enthusiastic' },
      { prompt: DEFAULT_PROMPTS[1], answer: 'Fetch in the park with any dog who wants to join' },
      { prompt: DEFAULT_PROMPTS[2], answer: 'Everyone he meets, every ball he sees, every treat offered' },
    ],
    boundaries: [],
    allergies: [], specialNeeds: [], behaviorFlags: [],
    vaccinated: true, vetChecked: true, mode: 'playdate',
    bio: 'Certified therapy dog in training. Loves absolutely everyone he meets. The easiest playdate you\'ll ever plan.',
  },

];

// Distance offsets from Williamsburg seed center (miles, approximated)
export const SEED_DISTANCES: Record<string, number> = {
  Kaju: 0.1,
  Noodle: 0.6, Poppy: 0.3, Luna: 0.9, Biscuit: 0.7,
};
