/**
 * Seed script — populates Firestore with 15 demo dogs and 3 sample matches.
 *
 * Usage:
 *   npx ts-node scripts/seed.ts
 *
 * Requires FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS env vars,
 * OR run against the emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/seed.ts
 */

import * as admin from 'firebase-admin';
import { SEED_DOGS } from '../shared/data/seedDogs';
import { toPrivateSavedDogProfile, toPublicSavedDogProfile, type SavedDogProfile } from '../shared/profile';

const DEFAULT_SEED_PHOTO = 'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800';

function buildSeedUserId(index: number): string {
  return `user_seed_${index}`;
}

function buildSeedLocation(index: number) {
  return {
    city: 'New York',
    state: 'NY',
    zip: `1000${index}`,
    lat: 40.7128 + index * 0.01,
    lng: -74.006 + index * 0.01,
  };
}

// Init
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'godoggydate',
  });
}

const db = admin.firestore();

async function seedDogs() {
  console.log(`🐾 Seeding ${SEED_DOGS.length} dogs…`);
  const batch = db.batch();

  for (const [index, dog] of SEED_DOGS.entries()) {
    const userId = buildSeedUserId(index);
    const primaryPhoto = dog.photos[0] || DEFAULT_SEED_PHOTO;
    const { city, state, zip, lat, lng } = buildSeedLocation(index);
    const savedProfile: SavedDogProfile = {
      ...dog,
      photos: [primaryPhoto, primaryPhoto, primaryPhoto],
      location: `${city}, ${state}`,
      city,
      state,
      zip,
      lat,
      lng,
    };
    const ref = db.collection('dogs').doc(userId);
    batch.set(ref, {
      ...toPublicSavedDogProfile(savedProfile),
      ownerId: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.set(
      db.collection('users').doc(userId).collection('private').doc('dogProfile'),
      {
        ...toPrivateSavedDogProfile(savedProfile),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    );
  }

  await batch.commit();
  console.log('✅ Dogs seeded');
}

async function seedUsers() {
  console.log('👤 Seeding demo users…');
  const batch = db.batch();

  for (let i = 0; i < Math.min(SEED_DOGS.length, 5); i++) {
    const dog = SEED_DOGS[i];
    const userId = buildSeedUserId(i);
    const ref = db.collection('users').doc(userId);
    const { lat, lng } = buildSeedLocation(i);
    batch.set(ref, {
      id: userId,
      phone: `+1555000000${i}`,
      displayName: `${dog.name}'s Owner`,
      dogIds: [userId],
      location: { lat, lng },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log('✅ Users seeded');
}

async function seedMatches() {
  console.log('💛 Seeding demo matches…');
  const matches = [
    {
      id: 'match_seed_1',
      dog1Id: buildSeedUserId(0),
      dog2Id: buildSeedUserId(1),
      dog1UserId: 'user_seed_0',
      dog2UserId: 'user_seed_1',
      chatUnlocked: true,
      dog1ChatUnlocked: true,
      dog2ChatUnlocked: true,
      paymentId: 'pi_demo_001',
      lastMessage: null,
      lastMessageTime: null,
      lastMessageFromUid: null,
      dog1LastReadAt: null,
      dog2LastReadAt: null,
    },
    {
      id: 'match_seed_2',
      dog1Id: buildSeedUserId(0),
      dog2Id: buildSeedUserId(2),
      dog1UserId: 'user_seed_0',
      dog2UserId: 'user_seed_2',
      chatUnlocked: false,
      dog1ChatUnlocked: false,
      dog2ChatUnlocked: false,
      lastMessage: null,
      lastMessageTime: null,
      lastMessageFromUid: null,
      dog1LastReadAt: null,
      dog2LastReadAt: null,
    },
  ];

  const batch = db.batch();
  for (const m of matches) {
    batch.set(db.collection('matches').doc(m.id), {
      ...m,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log('✅ Matches seeded');
}

async function seedRatings() {
  console.log('⭐ Seeding demo ratings…');
  const batch = db.batch();
  const ref = db.collection('ratings').doc('rating_seed_1');
  batch.set(ref, {
    id: 'rating_seed_1',
    matchId: 'match_seed_1',
    raterId: 'user_seed_0',
    dogId: buildSeedUserId(1),
    stars: 5,
    wouldMeetAgain: true,
    tags: ['great_match', 'friendly'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  console.log('✅ Ratings seeded');
}

async function main() {
  try {
    await seedDogs();
    await seedUsers();
    await seedMatches();
    await seedRatings();
    console.log('\n🎉 All seed data written successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

main();
