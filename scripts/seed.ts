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

// Init
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'godoggydate-c6c92',
  });
}

const db = admin.firestore();

async function seedDogs() {
  console.log(`🐾 Seeding ${SEED_DOGS.length} dogs…`);
  const batch = db.batch();

  for (const dog of SEED_DOGS) {
    const ref = db.collection('dogs').doc(dog.id);
    batch.set(ref, {
      ...dog,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log('✅ Dogs seeded');
}

async function seedUsers() {
  console.log('👤 Seeding demo users…');
  const batch = db.batch();

  for (let i = 0; i < Math.min(SEED_DOGS.length, 5); i++) {
    const dog = SEED_DOGS[i];
    const userId = `user_seed_${i}`;
    const ref = db.collection('users').doc(userId);
    batch.set(ref, {
      id: userId,
      phone: `+1555000000${i}`,
      displayName: `${dog.name}'s Owner`,
      dogIds: [dog.id],
      location: { lat: 37.774 + i * 0.01, lng: -122.419 + i * 0.01 },
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
      dogAId: SEED_DOGS[0].id,
      dogBId: SEED_DOGS[1].id,
      userAId: 'user_seed_0',
      userBId: 'user_seed_1',
      chatUnlocked: true,
      paymentId: 'pi_demo_001',
    },
    {
      id: 'match_seed_2',
      dogAId: SEED_DOGS[0].id,
      dogBId: SEED_DOGS[2].id,
      userAId: 'user_seed_0',
      userBId: 'user_seed_2',
      chatUnlocked: false,
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
    dogId: SEED_DOGS[1].id,
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
