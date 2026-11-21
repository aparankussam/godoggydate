#!/usr/bin/env node
// Admin tool: ban a user (moderator action), by uid or email.
//
// What it does:
//   1. Disables the Firebase Auth user and revokes their refresh tokens, so they
//      can't sign in again. The Auth user is kept (not deleted) on purpose:
//      the same Google or Apple account then maps to this disabled uid, instead
//      of being free to sign up again with a new uid and a new Founding number.
//   2. Takes their dog out of discovery by deleting dogs/{uid} (the public
//      profile and its subcollections; the /d/ page and the share image go with
//      it). The profile is copied into the moderation record first.
//   3. Deletes their push tokens (users/{uid}/private/push), so nothing more is
//      sent to their devices.
//   4. Cancels Pack Days they host and are still ahead (the attendees are told
//      by onPackDayCancelled) and removes them from Pack Days they joined.
//   5. Writes moderationLog/<id> (Admin-only): { kind: "user_banned", uid,
//      reason, the dog profile as it was, who ran it, when }.
//
// What it leaves alone: their chats and matches (the other person keeps their
// own history; use scripts/admin-delete-user.cjs --keep-disabled for a full
// wipe that also keeps them out), their private documents, payments, and any
// Stripe subscription (cancel it in the Stripe dashboard if they have one: the
// ids are printed). An ID token they already hold keeps working for up to an
// hour; Firebase can't recall it.
//
// Usage (dry run is the default and changes nothing):
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-ban-user.cjs --uid=<uid> --reason "Harassment in chat"
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-ban-user.cjs --email=someone@example.com --reason "..." --confirm
//
// The reason is only stored in the moderation log; it is never shown to anyone
// but you. A ban can be lifted by setting the Auth user back to enabled in the
// Firebase console (the dog profile is not restored automatically: the copy is
// in the moderation log).

const lib = require('./admin-lib.cjs');

const USAGE =
  'Usage: node scripts/admin-ban-user.cjs (--uid=<uid> | --email=<email>) [--reason "..."] [--dry-run | --confirm]';

async function main() {
  const args = lib.parseArgs(process.argv.slice(2), { usage: USAGE });

  const admin = lib.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const FieldValue = admin.firestore.FieldValue;

  console.log(`Firebase project: ${lib.projectId()}${args.confirm ? '' : '  (dry run)'}`);
  const { uid, user } = await lib.resolveTarget(auth, args);
  if (!user) {
    throw new Error(`No Firebase Auth user ${uid}. To clean up leftover data, use scripts/admin-delete-user.cjs.`);
  }
  console.log(`Target user: ${uid} (${user.email || 'no email'}, signs in with ${user.providerData.map((p) => p.providerId).join(', ') || 'a guest session'})`);

  const dogRef = db.doc(`dogs/${uid}`);
  const dogSnap = await dogRef.get();
  const dog = dogSnap.exists ? dogSnap.data() : null;
  const hosted = await db.collection('packDays').where('hostUid', '==', uid).get();
  const joined = await db.collection('packDays').where('attendeeUids', 'array-contains', uid).get();
  const stripe = await lib.stripeIdsFor(db, uid);
  const pushRef = db.doc(`users/${uid}/private/push`);

  console.log('\nWill:');
  console.log(`  - ${user.disabled ? 'keep the Auth user disabled (already is)' : 'disable the Auth user'} and revoke their refresh tokens`);
  console.log(dog
    ? `  - delete dogs/${uid} ("${dog.name ?? 'no name'}"${typeof dog.foundingPackNumber === 'number' ? `, Founding #${dog.foundingPackNumber}, which is retired` : ''}) after copying it into the moderation log`
    : `  - no dogs/${uid} document (nothing to remove from discovery)`);
  console.log(`  - delete ${pushRef.path}`);
  console.log(`  - cancel ${hosted.size} Pack Day(s) they host, and remove them from ${joined.size} they joined`);
  console.log('  - write a moderationLog entry (kind "user_banned")');
  if (stripe.subscriptionId || stripe.customerId) {
    console.log(
      `\nStripe: Pro subscription record found (subscription ${stripe.subscriptionId || 'unknown'}, customer ${stripe.customerId || 'unknown'}). ` +
      'This does NOT cancel it; cancel or refund it in the Stripe dashboard if you want to.',
    );
  }

  if (!args.confirm) {
    console.log('\nDry run only. Re-run with --confirm to ban them.');
    return;
  }

  // Auth first: nothing else matters if they can still sign in.
  await auth.updateUser(uid, { disabled: true });
  await auth.revokeRefreshTokens(uid);

  // The record first, with the profile as it was, so it survives the deletion.
  const logRef = await db.collection('moderationLog').add({
    kind: 'user_banned',
    uid,
    email: user.email || null,
    reason: args.reason,
    dog: dog ? JSON.parse(JSON.stringify(dog)) : null,
    via: 'scripts/admin-ban-user.cjs',
    createdAt: FieldValue.serverTimestamp(),
  });

  if (dog) await db.recursiveDelete(dogRef);
  await pushRef.delete();
  await lib.packDayCleanup(db, FieldValue)(uid);

  console.log(`\nBanned. Auth user disabled; record in ${logRef.path}.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Failed:', error.message || error);
  process.exit(1);
});
