#!/usr/bin/env node

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

async function main() {
  const [matchesSnap, unlocksSnap] = await Promise.all([
    db.collection('matches').get(),
    db.collection('matchUnlocks').get(),
  ]);

  const unlocksByMatch = new Map();
  for (const doc of unlocksSnap.docs) {
    const data = doc.data();
    const list = unlocksByMatch.get(data.matchId) || [];
    list.push({ id: doc.id, ...data });
    unlocksByMatch.set(data.matchId, list);
  }

  let issues = 0;
  for (const matchDoc of matchesSnap.docs) {
    const data = matchDoc.data();
    const unlocks = unlocksByMatch.get(matchDoc.id) || [];
    const expectedAnyUnlocked = Boolean(data.dog1ChatUnlocked) || Boolean(data.dog2ChatUnlocked);

    if (Boolean(data.chatUnlocked) !== expectedAnyUnlocked) {
      issues += 1;
      console.log(`Mismatch: matches/${matchDoc.id} chatUnlocked=${data.chatUnlocked} but per-user fields say ${expectedAnyUnlocked}`);
    }

    for (const unlock of unlocks) {
      if (unlock.status === 'succeeded') {
        const field = unlock.unlockField;
        if (!field || data[field] !== true) {
          issues += 1;
          console.log(`Mismatch: matchUnlocks/${unlock.id} succeeded but ${field || 'unknown field'} is not true on matches/${matchDoc.id}`);
        }
      }
    }
  }

  if (issues === 0) {
    console.log('PASS: match unlock records are internally consistent.');
    return;
  }

  console.log(`FAIL: found ${issues} match unlock consistency issue(s).`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Failed to audit match unlocks:', error);
  process.exit(1);
});
