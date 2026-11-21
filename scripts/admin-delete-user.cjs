#!/usr/bin/env node
// Admin tool: delete a user's data and Auth account, by uid or email.
//
// It runs the same cleanup as the deleteAccount Cloud Function (the shared
// module firebase/functions/src/accountCleanup.ts): matches in every
// participant slot including legacy ones, with their messages; swipe decisions
// either way; ratings and reports they filed; blocks; users/ and dogs/ with all
// subcollections; their place in other dogs' households; invites they made;
// Pack Days they host or joined; and their photos in Storage (without that the
// photo links stay public). Callable directly with the service account, so it
// works for accounts you can't sign in as, e.g. test accounts.
//
// Before running it for real, build the functions once (the cleanup module is
// loaded from firebase/functions/lib):
//   cd firebase/functions && npm install && npm run build
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-delete-user.cjs --uid=<uid>                    # dry run, changes nothing
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-delete-user.cjs --email=someone@example.com --confirm
//   ... add --keep-disabled to delete everything but leave the Auth user DISABLED
//   instead of deleting it (see below).
//
// Omit --confirm (or pass --dry-run) to see what would be deleted. Safe to run
// again after a partial failure.
//
// Deleting the Auth user frees the person's Google or Apple account to sign up
// again with a NEW uid, which also means a new Founding number. To keep someone
// out for moderation reasons use scripts/admin-ban-user.cjs, or pass
// --keep-disabled here: the data is deleted exactly the same, but the Auth user
// stays, disabled, so that account can't sign in or register again.
//
// Not done here, on purpose: cancelling Stripe subscriptions (the in-app
// deleteAccount does; here the ids are only printed, cancel them in the Stripe
// dashboard) and revoking a Sign in with Apple token (see "Apple token
// revocation" in PRODUCTION-LAUNCH-CHECKS.md). payments/, matchUnlocks/,
// stripeEvents/, moderationLog/ and safetyEvidence/ are kept.

const lib = require('./admin-lib.cjs');

const USAGE =
  'Usage: node scripts/admin-delete-user.cjs (--uid=<uid> | --email=<email>) [--keep-disabled] [--dry-run | --confirm]';

async function main() {
  const args = lib.parseArgs(process.argv.slice(2), { extraFlags: ['--keep-disabled'], usage: USAGE });
  const keepDisabled = args.flags['--keep-disabled'] === true;

  const admin = lib.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const { deleteUserData } = lib.loadAccountCleanup();

  console.log(`Firebase project: ${lib.projectId()}${args.confirm ? '' : '  (dry run)'}`);
  const { uid, user } = await lib.resolveTarget(auth, args);
  console.log(`Target user: ${uid}${user ? ` (${user.email || 'no email'}${user.disabled ? ', already disabled' : ''})` : ' (no Auth user: data only)'}`);

  const buckets = await lib.resolveBuckets(admin);
  const deps = {
    db,
    bucket: lib.bucketAdapter(buckets),
    cleanupPackDays: lib.packDayCleanup(db, admin.firestore.FieldValue),
  };

  const preview = await deleteUserData(deps, uid, { dryRun: true });
  const stripe = await lib.stripeIdsFor(db, uid);
  console.log('\nWould delete:');
  console.log(`  - ${preview.matches.length} match(es) with their messages: ${preview.matches.join(', ') || '(none)'}`);
  console.log(`  - ${preview.targetingDecisions} swipe decision(s) other people made about them`);
  console.log(`  - swipes/${uid} and blocks/${uid} (with their subcollections)`);
  console.log(`  - ${preview.ratings} rating(s) and ${preview.reports} report(s) they filed`);
  console.log(`  - users/${uid} (private docs, entitlements) and dogs/${uid} (reminders and the rest)`);
  console.log(`  - their place in ${preview.householdsLeft} other dog's household(s), and ${preview.invites} invite(s) they made`);
  console.log('  - Pack Days they host (cancelled, attendees told) and their sign-ups for others');
  console.log(`  - photos under dogs/${uid}/ and avatars/${uid}/ in ${buckets.map((b) => b.name).join(', ')}`);
  console.log(keepDisabled
    ? '  - the Firebase Auth user is KEPT, disabled (so they cannot sign in or register again)'
    : '  - the Firebase Auth user itself (the same Google/Apple account could register again with a new uid)');
  if (preview.warnings.length) console.log(`\nNote, these lookups failed even in the preview: ${preview.warnings.join('; ')}`);
  if (stripe.subscriptionId || stripe.customerId) {
    console.log(
      `\nStripe: this account has a Pro subscription record (subscription ${stripe.subscriptionId || 'unknown'}, ` +
      `customer ${stripe.customerId || 'unknown'}). This script does NOT cancel it; cancel it in the Stripe dashboard.`,
    );
  }
  if (stripe.foundingNumber !== null) {
    console.log(`\nFounding: they hold #${stripe.foundingNumber}. Deleting them retires it (the counter never goes down).`);
  }

  if (!args.confirm) {
    console.log('\nDry run only. Re-run with --confirm to actually delete.');
    return;
  }

  // First, so no device can mint a new ID token while the data goes.
  if (user) await auth.revokeRefreshTokens(uid);

  const report = await deleteUserData(deps, uid);
  if (report.warnings.length) {
    console.log(`\nDone, but these steps failed and need another look: ${report.warnings.join('; ')}`);
  }

  await db.collection('moderationLog').add({
    kind: keepDisabled ? 'admin_user_deleted_kept_disabled' : 'admin_user_deleted',
    uid,
    reason: args.reason,
    via: 'scripts/admin-delete-user.cjs',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (user) {
    if (keepDisabled) await auth.updateUser(uid, { disabled: true });
    else await auth.deleteUser(uid);
  }

  console.log(keepDisabled ? '\nDeleted. The Auth user is disabled.' : '\nDeleted.');
  if (report.warnings.length) process.exitCode = 2;
}

main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
  console.error('Failed:', error.message || error);
  process.exit(1);
});
