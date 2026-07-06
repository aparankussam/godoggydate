#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const repoRoot = path.resolve(__dirname, '..');

function formatDate(value) {
  if (!value) return 'n/a';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return null;
}

function readServiceAccountFromEnvOrDisk() {
  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const fallbackPath = path.join(repoRoot, 'serviceAccountKey.json');
  const chosenPath = explicitPath || (fs.existsSync(fallbackPath) ? fallbackPath : '');

  if (!chosenPath || !fs.existsSync(chosenPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(chosenPath, 'utf8'));
  } catch {
    return null;
  }
}

function initAdmin() {
  if (admin.apps.length) return;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'godoggydate';
  const serviceAccount = readServiceAccountFromEnvOrDisk();

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
    return;
  }

  admin.initializeApp({ projectId });
}

async function countAuthUsers() {
  const auth = admin.auth();
  let nextPageToken = undefined;
  let total = 0;
  let anonymous = 0;
  const providers = new Map();
  let latestCreation = null;
  let latestSignIn = null;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const user of page.users) {
      total += 1;
      if (!user.providerData || user.providerData.length === 0) {
        anonymous += 1;
      } else {
        for (const provider of user.providerData) {
          const providerId = provider.providerId || 'unknown';
          providers.set(providerId, (providers.get(providerId) || 0) + 1);
        }
      }

      const createdAt = user.metadata?.creationTime ? Date.parse(user.metadata.creationTime) : null;
      const signedInAt = user.metadata?.lastSignInTime ? Date.parse(user.metadata.lastSignInTime) : null;
      if (createdAt && (!latestCreation || createdAt > latestCreation)) latestCreation = createdAt;
      if (signedInAt && (!latestSignIn || signedInAt > latestSignIn)) latestSignIn = signedInAt;
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return {
    total,
    anonymous,
    providers: Object.fromEntries([...providers.entries()].sort()),
    latestCreation: latestCreation ? new Date(latestCreation).toISOString() : 'n/a',
    latestSignIn: latestSignIn ? new Date(latestSignIn).toISOString() : 'n/a',
  };
}

async function getCollectionDocs(collectionName) {
  return admin.firestore().collection(collectionName).get();
}

function latestFromDocs(docs, fields) {
  let best = null;
  for (const doc of docs) {
    const data = doc.data();
    for (const field of fields) {
      const millis = toMillis(data[field]);
      if (millis && (!best || millis > best)) best = millis;
    }
  }
  return best ? new Date(best).toISOString() : 'n/a';
}

async function main() {
  initAdmin();
  const db = admin.firestore();

  const [
    authStats,
    dogsSnap,
    usersSnap,
    matchesSnap,
    reportsSnap,
    paymentsSnap,
    unlocksSnap,
    ratingsSnap,
  ] = await Promise.all([
    countAuthUsers(),
    getCollectionDocs('dogs'),
    getCollectionDocs('users'),
    getCollectionDocs('matches'),
    getCollectionDocs('reports'),
    getCollectionDocs('payments'),
    getCollectionDocs('matchUnlocks'),
    getCollectionDocs('ratings'),
  ]);

  const matches = matchesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const payments = paymentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const unlocks = unlocksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const chatUnlockedMatches = matches.filter((match) => Boolean(match.chatUnlocked)).length;
  const participantUnlockedMatches = matches.filter(
    (match) => Boolean(match.dog1ChatUnlocked) || Boolean(match.dog2ChatUnlocked),
  ).length;
  const succeededPayments = payments.filter((payment) => payment.status === 'succeeded').length;
  const refundedOrDisputedPayments = payments.filter(
    (payment) => payment.status === 'refunded' || payment.status === 'disputed',
  ).length;
  const succeededUnlocks = unlocks.filter((unlock) => unlock.status === 'succeeded').length;

  const lines = [
    `Firebase project: ${admin.app().options.projectId || 'unknown'}`,
    '',
    'Auth',
    `- total auth users: ${authStats.total}`,
    `- anonymous-only auth users: ${authStats.anonymous}`,
    `- auth providers seen: ${JSON.stringify(authStats.providers)}`,
    `- latest auth user created: ${authStats.latestCreation}`,
    `- latest auth sign-in: ${authStats.latestSignIn}`,
    '',
    'Firestore',
    `- dogs profiles: ${dogsSnap.size}`,
    `- users docs: ${usersSnap.size}`,
    `- matches: ${matchesSnap.size}`,
    `- matches with chatUnlocked=true: ${chatUnlockedMatches}`,
    `- matches with any per-user unlock flag: ${participantUnlockedMatches}`,
    `- reports: ${reportsSnap.size}`,
    `- payments: ${paymentsSnap.size}`,
    `- succeeded payments: ${succeededPayments}`,
    `- refunded/disputed payments: ${refundedOrDisputedPayments}`,
    `- match unlock records: ${unlocksSnap.size}`,
    `- succeeded match unlocks: ${succeededUnlocks}`,
    `- ratings: ${ratingsSnap.size}`,
    '',
    'Latest Firestore activity',
    `- latest dog profile write: ${latestFromDocs(dogsSnap.docs, ['updatedAt', 'createdAt'])}`,
    `- latest match activity: ${latestFromDocs(matchesSnap.docs, ['updatedAt', 'lastMessageTime', 'createdAt', 'unlockedAt'])}`,
    `- latest report created: ${latestFromDocs(reportsSnap.docs, ['createdAt'])}`,
    `- latest payment activity: ${latestFromDocs(paymentsSnap.docs, ['updatedAt', 'createdAt'])}`,
    `- latest rating created: ${latestFromDocs(ratingsSnap.docs, ['createdAt'])}`,
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((error) => {
  console.error('Failed to fetch app stats:', error);
  process.exit(1);
});
