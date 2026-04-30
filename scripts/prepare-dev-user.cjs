const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'godoggydate';
const testUserId = (process.env.TEST_USER_ID || '').trim();
const directMatch = /^(1|true|yes)$/i.test(process.env.DIRECT_LOCKED_MATCH || '');
const seededTargets = ['user_seed_0', 'user_seed_1', 'user_seed_2'];

if (!testUserId) {
  console.error('Missing TEST_USER_ID. Example: TEST_USER_ID=<firebase uid> node scripts/prepare-dev-user.cjs');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

function makeMatchId(userA, userB) {
  return [userA, userB].sort().join('_');
}

async function ensureTestUserProfile() {
  const snap = await db.collection('dogs').doc(testUserId).get();
  if (!snap.exists) {
    throw new Error(
      `dogs/${testUserId} does not exist yet. Sign in in the mobile app and save your profile first.`,
    );
  }
}

async function createReverseLikes() {
  const batch = db.batch();

  for (const seededUserId of seededTargets) {
    const decisionRef = db.collection('swipes').doc(seededUserId).collection('decisions').doc(testUserId);
    batch.set(decisionRef, {
      action: 'like',
      targetDogId: testUserId,
      targetUserId: testUserId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
}

async function createDirectLockedMatch() {
  const seededUserId = seededTargets[0];
  const matchId = makeMatchId(testUserId, seededUserId);
  const matchRef = db.collection('matches').doc(matchId);
  const existingMatch = await matchRef.get();
  if (existingMatch.exists) return matchId;

  const [dog1UserId, dog2UserId] = [testUserId, seededUserId].sort();
  const dog1Id = dog1UserId;
  const dog2Id = dog2UserId;

  await matchRef.set({
    dog1Id,
    dog2Id,
    dog1UserId,
    dog2UserId,
    chatUnlocked: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: null,
    lastMessageTime: null,
    lastMessageFromUid: null,
    dog1LastReadAt: null,
    dog2LastReadAt: null,
  }, { merge: true });

  return matchId;
}

async function main() {
  await ensureTestUserProfile();
  await createReverseLikes();

  let directMatchId = null;
  if (directMatch) {
    directMatchId = await createDirectLockedMatch();
  }

  console.log(`Prepared seeded reverse likes for ${testUserId} in project ${projectId}.`);
  console.log('Swipe right on one of these seeded users to force a mutual match:');
  console.log('- user_seed_0');
  console.log('- user_seed_1');
  console.log('- user_seed_2');

  if (directMatchId) {
    console.log(`Created direct locked match: ${directMatchId}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
