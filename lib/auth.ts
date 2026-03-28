// web/lib/auth.ts
// Minimal Firebase Auth + Firestore helpers for GoDoggyDate MVP.
// Used only by web/app/app/page.tsx — no global context required.

import {
  GoogleAuthProvider,
  signInWithPopup,
  browserPopupRedirectResolver,
  signOut as _signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import type { DogProfile, PlayStyle } from '../shared/types';

export type { User } from 'firebase/auth';
export { onAuthStateChanged };

// ── Minimal profile persisted to Firestore (dogs/{uid}) ──────────────────────
export interface SavedDogProfile {
  name: string;
  size: 'S' | 'M' | 'L' | 'XL';
  energyLevel: number;
  playStyles: string[];
  vaccinated: boolean;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<void> {
  const { auth } = getFirebase();
  await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebase();
  await _signOut(auth);
}

// ── Firestore ────────────────────────────────────────────────────────────────
export async function getUserDogProfile(uid: string): Promise<SavedDogProfile | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'dogs', uid));
  return snap.exists() ? (snap.data() as SavedDogProfile) : null;
}

export async function saveUserDogProfile(
  uid: string,
  profile: SavedDogProfile,
): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'dogs', uid), profile);
}

// ── Convert saved → full DogProfile for matching engine ─────────────────────
// Fills required DogProfile fields with safe defaults where not collected.
export function toFullProfile(saved: SavedDogProfile, uid: string): DogProfile {
  return {
    id: uid,
    ownerId: uid,
    name: saved.name,
    breed: 'Mixed',
    purebred: false,
    size: saved.size,
    age: 'adult',
    sex: 'M',
    fixed: false,
    energyLevel: saved.energyLevel,
    photos: [],
    goodWith: ['all dogs'],
    notGoodWith: [],
    playStyles: saved.playStyles as PlayStyle[],
    boundaries: [],
    allergies: [],
    vaccinated: saved.vaccinated,
    vetChecked: false,
    specialNeeds: [],
    behaviorFlags: [],
    mode: 'playdate',
    trustScore: 70,
    totalMeetups: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}