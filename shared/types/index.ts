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

  // Computed/cached — trustScore/ratingCount/meetAgainRate are written
  // server-side by onRatingCreated (firebase/functions/src/index.ts) and are
  // ABSENT (not defaulted to any baseline) until a dog's first rating comes
  // in — the function only fires on rating creation. Both trustScore and
  // meetAgainRate are 0-1 fractions, NOT 0-100 — a since-removed dead
  // function elsewhere in this codebase used a 0-100/baseline-70 convention
  // that never matched what's actually written to Firestore.
  trustScore?: number; // 0–1, absent until rated at least once
  ratingCount?: number;
  meetAgainRate?: number; // 0–1
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

  // Server-assigned by the onDogProfileCreated Cloud Function trigger.
  foundingPackNumber?: number;

  // AI-generated content (Vibe Check onboarding). See DogAIProfile.
  ai?: DogAIProfile;

  // Household — uids granted access to this dog's private data (Cadence
  // reminders today). Written ONLY by the acceptHouseholdInvite /
  // removeHouseholdMember Cloud Functions (Admin SDK) — never directly by
  // the client, even the owner; see firestore.rules' preservesServerOnlyDogFields.
  householdMemberIds?: string[];
  // Display labels captured once at invite-accept time (users/{uid} is
  // owner-read-only, so there's no other way to show a member's name).
  householdMemberNames?: Record<string, string>;
  // The dog's designated Best Friend — a matchId, owner's own preference,
  // freely client-writable (not server-computed, so no guard needed).
  bestFriendMatchId?: string;
}

// ─── AI-GENERATED PROFILE CONTENT ("Vibe Check") ───────────────────────────
// Generated once from 2-3 uploaded photos + a few taps, persisted to
// dogs/{uid}.ai by the server (web/app/api/ai/vibe-check/route.ts), and
// never written by the client directly — see the "ai" field guard in
// firestore.rules. Stable once generated (a personality that changes on
// reload is worse than no personality) — regenerated only on an explicit
// user-initiated "redo" action, which bumps promptVersion.

export interface DogArchetype {
  name: string; // e.g. "Chaos Gremlin" — never a rarity/percentage claim, see getFoundingPackPitch
  code: string; // 4-letter axis code across energy/sociability/boldness/focus, e.g. "ESBF"
  description: string; // 1 sentence, grounded in specific profile fields — no generic filler
}

export interface DogVibeCheck {
  breedGuess: {
    name: string; // must resolve via shared/types/breeds.ts's resolveBreed()
    confidence: 'low' | 'medium' | 'high';
  };
  sizeEstimate?: DogSize;
  energyEstimate?: number; // 0-100
  playStyleGuesses?: PlayStyle[]; // must be drawn from the PlayStyle union — never freeform
  temperamentGuesses?: string[];
  bio: string; // written in the dog's voice, 1-3 sentences
  archetype: DogArchetype;
  heroPhotoIndex?: number; // which uploaded photo index Claude judged best for the swipe card
  basis: string; // dev-only: what in the input the model reasoned from — never shown in UI
}

export interface DogAIProfile {
  vibeCheck?: DogVibeCheck;
  model: string;
  promptVersion: string;
  generatedAt: number; // unix ms
}

// ─── CADENCE (reminders) ────────────────────────────────────────────────────
// dogs/{dogId}/reminders/{reminderId}. Client-owned (owner reads/writes their
// own dog's reminders directly — no server computation here, unlike
// trustScore/foundingPackNumber/ai). A scheduled Cloud Function
// (sendReminderNotifications) pushes a notification once per due date and
// advances recurring reminders when marked complete.
export type ReminderType =
  | 'heartworm' | 'flea_tick' | 'booster' | 'rabies' | 'license'
  | 'grooming' | 'vet_visit' | 'insurance_claim' | 'custom';

export interface Reminder {
  id: string;
  label: string;
  type: ReminderType;
  dueDate: number; // unix ms
  recurrenceDays?: number; // undefined = one-time (e.g. an insurance claim window)
  lastCompletedAt?: number;
  notifiedAt?: number; // last due date (unix ms) a push already fired for — prevents duplicate sends
  createdAt: number;
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
