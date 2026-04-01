// shared/types/index.ts

export type DogSize = 'S' | 'M' | 'L' | 'XL';
export type DogAge  = 'puppy' | 'adult' | 'senior';
export type DogSex  = 'M' | 'F';

export type PlayStyle =
  | 'loves fetch 🎾'
  | 'wrestling 🤼'
  | 'gentle play 🐾'
  | 'high-energy runner ⚡'
  | 'calm 🧘'
  | 'explorer 👃';

export type GoodWith =
  | 'small dogs' | 'large dogs' | 'puppies'
  | 'calm dogs' | 'high-energy dogs' | 'all dogs'
  | 'medium dogs' | 'seniors' | 'adults';

export type NotGoodWith =
  | 'small dogs' | 'large dogs' | 'puppies'
  | 'high-energy dogs' | 'rough play' | 'overstimulated'
  | 'resource guarding dogs' | 'off-leash dogs';

export type SpecialNeed =
  | 'blind' | 'deaf' | 'mobility limited'
  | 'anxiety' | 'medical notes';

export type BehaviorFlag =
  | 'anxious with dogs'
  | 'not comfortable with kids'
  | 'not comfortable with strangers'
  | 'prefers calm dogs'
  | 'needs slow introduction'
  | 'easily overstimulated'
  | 'resource guarding';

export type RatingTag =
  | 'Friendly 😊' | 'Great match ✨' | 'Calm 🧘'
  | 'High energy ⚡' | 'Too rough ⚠️'
  | 'Slow intro needed 🔄' | 'Would go again! 🔁';

// ─── CORE ENTITIES ─────────────────────────────────────────────────────────────

export interface DogProfile {
  id: string;
  ownerId: string;
  name: string;
  breed: string;
  purebred: boolean;
  size: DogSize;
  age: DogAge;
  sex: DogSex;
  fixed: boolean;
  energyLevel: number; // 0–100
  birthYear?: number;

  // Media
  photos: string[];     // Firebase Storage URLs
  videoUrl?: string;

  // Compatibility
  goodWith: GoodWith[];
  notGoodWith: NotGoodWith[];
  playStyles: PlayStyle[];
  boundaries: string[];
  allergies: string[];

  // Health (self-reported)
  vaccinated: boolean | null;
  vetChecked: boolean;
  lastVetVisit?: string; // ISO date string
  healthNotes?: string;

  // Special needs & behavior
  specialNeeds: SpecialNeed[];
  behaviorFlags: BehaviorFlag[];
  bio?: string;

  // Mode (strictly separate)
  mode: 'playdate' | 'breeding';

  // Computed/cached
  trustScore: number; // 0–100
  totalMeetups: number;

  // Timestamps
  createdAt: number; // unix ms
  updatedAt: number;

  // Enhanced profile fields (optional, backward-compatible)
  temperament?: string[];
  location?: string;
  lat?: number;
  lng?: number;
  prompts?: { prompt: string; answer: string }[];
}

export interface UserProfile {
  id: string;
  phone: string;
  displayName: string;
  avatarUrl?: string;
  dogs: string[]; // DogProfile IDs
  location?: GeoPoint;
  createdAt: number;
  isPro: boolean;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Match {
  id: string;
  dogA: string; // DogProfile ID
  dogB: string;
  ownerA: string;
  ownerB: string;
  compatScore: number;
  reasons: string[];
  warnings: string[];
  chatUnlocked: boolean;
  paymentId?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: number;
  read: boolean;
}

export interface Rating {
  id: string;
  matchId: string;
  raterId: string;
  ratedDogId: string;
  stars: number; // 1–5
  wouldMeetAgain: boolean;
  tags: RatingTag[];
  notes?: string;
  createdAt: number;
}

export interface Payment {
  id: string;
  matchId: string;
  userId: string;
  stripePaymentIntentId: string;
  amount: number; // cents
  status: 'pending' | 'succeeded' | 'failed';
  createdAt: number;
}

// ─── MATCHING ──────────────────────────────────────────────────────────────────

export type MatchQuality = 'perfect' | 'good' | 'blocked';

export interface CompatibilityResult {
  score: number;           // 0–100
  quality: MatchQuality;   // 🟢 perfect | 🟡 good | 🔴 blocked
  label: string;           // short display label e.g. "Perfect play buddy"
  microcopy: string;       // one-line trust copy shown on card
  reasons: string[];       // up to 4 positive match reasons
  warnings: string[];      // safety warnings
  breakdown: {
    breedScore: number;
    sizeScore: number;
    energyScore: number;
    goodWithScore: number;
    playStyleScore: number;
    healthScore: number;
    distanceScore: number;
    penalty: number;
  };
}

export interface FeedDog extends DogProfile {
  compat: CompatibilityResult;
  distanceMiles: number;
  ownerName: string;
}
