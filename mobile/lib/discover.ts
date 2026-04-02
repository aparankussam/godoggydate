/**
 * Discover feed data layer.
 *
 * Uses mock data so the UI is fully testable in Expo Go immediately.
 * To wire Firestore: replace the mock return inside fetchDiscoverFeed().
 */

export interface DiscoverDog {
  id: string;
  name: string;
  breed: string;
  age: 'puppy' | 'adult' | 'senior';
  sex: 'M' | 'F';
  size: 'S' | 'M' | 'L' | 'XL';
  energyLevel: number;
  photos: string[];
  playStyles: string[];
  location: string;
  distanceMiles?: number;
  tagline: string;
}

const MOCK_DOGS: DiscoverDog[] = [
  {
    id: 'mock-1',
    name: 'Daisy',
    breed: 'Golden Retriever',
    age: 'adult',
    sex: 'F',
    size: 'L',
    energyLevel: 80,
    photos: ['https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&auto=format&fit=crop'],
    playStyles: ['loves fetch 🎾', 'high-energy runner ⚡'],
    location: 'Ann Arbor, MI',
    distanceMiles: 2.4,
    tagline: 'Fetch champion & best trail buddy',
  },
  {
    id: 'mock-2',
    name: 'Milo',
    breed: 'French Bulldog',
    age: 'adult',
    sex: 'M',
    size: 'S',
    energyLevel: 40,
    photos: ['https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&auto=format&fit=crop'],
    playStyles: ['gentle play 🐾', 'calm 🧘'],
    location: 'Detroit, MI',
    distanceMiles: 5.1,
    tagline: 'Apartment dweller, couch cuddle expert',
  },
  {
    id: 'mock-3',
    name: 'Zara',
    breed: 'Siberian Husky',
    age: 'adult',
    sex: 'F',
    size: 'L',
    energyLevel: 100,
    photos: ['https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&auto=format&fit=crop'],
    playStyles: ['high-energy runner ⚡', 'explorer 👃'],
    location: 'Royal Oak, MI',
    distanceMiles: 3.8,
    tagline: 'Born to run, loves the cold',
  },
  {
    id: 'mock-4',
    name: 'Biscuit',
    breed: 'Pembroke Welsh Corgi',
    age: 'puppy',
    sex: 'M',
    size: 'S',
    energyLevel: 60,
    photos: ['https://images.unsplash.com/photo-1546527868-ccb7ee7dfa6a?w=800&auto=format&fit=crop'],
    playStyles: ['loves fetch 🎾', 'explorer 👃'],
    location: 'Birmingham, MI',
    distanceMiles: 1.9,
    tagline: 'Little legs, huge personality',
  },
  {
    id: 'mock-5',
    name: 'Luna',
    breed: 'German Shepherd',
    age: 'adult',
    sex: 'F',
    size: 'XL',
    energyLevel: 80,
    photos: ['https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=800&auto=format&fit=crop'],
    playStyles: ['wrestling 🤼', 'high-energy runner ⚡'],
    location: 'Troy, MI',
    distanceMiles: 4.2,
    tagline: 'Fiercely loyal & always playful',
  },
  {
    id: 'mock-6',
    name: 'Charlie',
    breed: 'Labrador Retriever',
    age: 'senior',
    sex: 'M',
    size: 'L',
    energyLevel: 40,
    photos: ['https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&auto=format&fit=crop'],
    playStyles: ['gentle play 🐾', 'calm 🧘'],
    location: 'Bloomfield Hills, MI',
    distanceMiles: 7.3,
    tagline: 'Senior boy with endless love to give',
  },
  {
    id: 'mock-7',
    name: 'Coco',
    breed: 'Miniature Poodle',
    age: 'adult',
    sex: 'F',
    size: 'S',
    energyLevel: 60,
    photos: ['https://images.unsplash.com/photo-1534361960057-19f4434a6e3a?w=800&auto=format&fit=crop'],
    playStyles: ['gentle play 🐾', 'loves fetch 🎾'],
    location: 'Ferndale, MI',
    distanceMiles: 2.1,
    tagline: 'Hypoallergenic & super smart',
  },
  {
    id: 'mock-8',
    name: 'Rex',
    breed: 'Dachshund',
    age: 'adult',
    sex: 'M',
    size: 'S',
    energyLevel: 60,
    photos: ['https://images.unsplash.com/photo-1612159279342-3a3f66eb6ccb?w=800&auto=format&fit=crop'],
    playStyles: ['explorer 👃', 'wrestling 🤼'],
    location: 'Pontiac, MI',
    distanceMiles: 8.5,
    tagline: 'Tiny but mighty, curious about everything',
  },
];

export function getMockDiscoverDeck(): DiscoverDog[] {
  return [...MOCK_DOGS];
}

export async function fetchDiscoverFeed(_userId: string): Promise<DiscoverDog[]> {
  // Firestore adapter: replace this mock return when backend is ready.
  return getMockDiscoverDeck();
}
