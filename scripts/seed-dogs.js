const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 🔥 REPLACE THIS with your service account JSON path
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// 🔥 REPLACE THESE WITH REAL FIREBASE AUTH UIDs
const USERS = [
  'UID_1',
  'UID_2',
  'UID_3',
];

async function seed() {
  if (USERS.some((uid) => uid.startsWith('UID_'))) {
    throw new Error('Replace USERS with real Firebase Auth UIDs before seeding dogs.');
  }

  const dogs = [
    {
      uid: USERS[0],
      data: {
        name: "Buddy",
        size: "M",
        energyLevel: 70,
        playStyles: ["loves fetch 🎾"],
        vaccinated: true,
        breed: "Labrador Retriever",
        age: "adult",
        photos: [
          "https://images.unsplash.com/photo-1517849845537-4d257902454a",
          "https://images.unsplash.com/photo-1507146426996-ef05306b995a",
          "https://images.unsplash.com/photo-1518717758536-85ae29035b6d"
        ],
        temperament: ["friendly"],
        location: "Troy, MI",
        ownerId: USERS[0],
      },
    },
    {
      uid: USERS[1],
      data: {
        name: "Luna",
        size: "S",
        energyLevel: 55,
        playStyles: ["gentle chase 🐕"],
        vaccinated: true,
        breed: "Cavalier King Charles Spaniel",
        age: "adult",
        photos: [
          "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8",
          "https://images.unsplash.com/photo-1548199973-03cce0bbc87b",
          "https://images.unsplash.com/photo-1525253086316-d0c936c814f8"
        ],
        temperament: ["sweet"],
        location: "Rochester Hills, MI",
        ownerId: USERS[1],
      },
    },
    {
      uid: USERS[2],
      data: {
        name: "Rocky",
        size: "L",
        energyLevel: 82,
        playStyles: ["wrestling 🤼"],
        vaccinated: true,
        breed: "Boxer",
        age: "adult",
        photos: [
          "https://images.unsplash.com/photo-1561037404-61cd46aa615b",
          "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8",
          "https://images.unsplash.com/photo-1543466835-00a7907e9de1"
        ],
        temperament: ["playful"],
        location: "Birmingham, MI",
        ownerId: USERS[2],
      },
    },
  ];

  for (const dog of dogs) {
    await db.collection('dogs').doc(dog.uid).set(dog.data);
    console.log(`✅ Seeded dog for UID: ${dog.uid}`);
  }

  console.log("🎉 Done seeding!");
}

seed().catch(console.error);
