#!/usr/bin/env node
// Admin tool: delete a user's data + auth account, by uid or email.
// Mirrors the deleteAccount Cloud Function's cleanup exactly, but callable
// directly with the service account — useful for removing test accounts
// without needing to sign in as that user.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-delete-user.cjs --uid=<uid> --confirm
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-delete-user.cjs --email=someone@example.com --confirm
//
// Omit --confirm to do a dry run (prints what would be deleted, changes nothing).

const admin = require('firebase-admin');

function parseArgs() {
  const args = { confirm: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--confirm') args.confirm = true;
    else if (arg.startsWith('--uid=')) args.uid = arg.slice('--uid='.length);
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
  }
  return args;
}

async function main() {
  const { uid: uidArg, email, confirm } = parseArgs();
  if (!uidArg && !email) {
    console.error('Usage: node scripts/admin-delete-user.cjs --uid=<uid> [--confirm]');
    console.error('   or: node scripts/admin-delete-user.cjs --email=<email> [--confirm]');
    process.exit(1);
  }

  admin.initializeApp({ projectId: 'godoggydate' });
  const db = admin.firestore();
  const auth = admin.auth();

  let uid = uidArg;
  if (!uid) {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
  }

  console.log(`Target user: ${uid}`);

  const [matchesAsDog1, matchesAsDog2] = await Promise.all([
    db.collection('matches').where('dog1UserId', '==', uid).get(),
    db.collection('matches').where('dog2UserId', '==', uid).get(),
  ]);
  const matchIds = [...matchesAsDog1.docs, ...matchesAsDog2.docs].map((d) => d.id);

  console.log(`Would delete:`);
  console.log(`  - ${matchIds.length} match(es): ${matchIds.join(', ') || '(none)'}`);
  console.log(`  - swipes/${uid} (and its decisions subcollection)`);
  console.log(`  - blocks/${uid} (and its blocked subcollection)`);
  console.log(`  - users/${uid} (and its private subcollection)`);
  console.log(`  - dogs/${uid}`);
  console.log(`  - the Firebase Auth user itself`);

  if (!confirm) {
    console.log('\nDry run only — re-run with --confirm to actually delete.');
    return;
  }

  for (const matchId of matchIds) {
    await db.recursiveDelete(db.doc(`matches/${matchId}`));
  }
  await db.recursiveDelete(db.doc(`swipes/${uid}`));
  await db.recursiveDelete(db.doc(`blocks/${uid}`));
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.doc(`dogs/${uid}`).delete();
  await auth.deleteUser(uid);

  console.log('\nDeleted.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
