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
    const anyPerUserUnlocked = Boolean(data.dog1ChatUnlocked) || Boolean(data.dog2ChatUnlocked);

    // Semantics: one payment unlocks both sides, so chatUnlocked=true with
    // per-user flags false is VALID (legacy paid docs). The revenue-losing
    // direction is the only inconsistency: a per-user flag says paid but the
    // shared chatUnlocked gate is still false.
    if (anyPerUserUnlocked && !data.chatUnlocked) {
      issues += 1;
      console.log(`Mismatch: matches/${matchDoc.id} has a per-user unlock but chatUnlocked=false — paying user is locked out`);
    }

    for (const unlock of unlocks) {
      if (unlock.status === 'succeeded') {
        // A succeeded payment must open the chat: either via the payer's
        // per-user flag (new writes) or the shared chatUnlocked gate (legacy).
        const field = unlock.unlockField;
        const reflected = (field && data[field] === true) || data.chatUnlocked === true;
        if (!reflected) {
          issues += 1;
          console.log(`Mismatch: matchUnlocks/${unlock.id} succeeded but matches/${matchDoc.id} is still locked`);
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
