// Shared plumbing for the account admin scripts (admin-delete-user.cjs,
// admin-ban-user.cjs). Not run on its own.
//
// The data cleanup itself is NOT here: it lives in
// firebase/functions/src/accountCleanup.ts, the same module the deleteAccount
// Cloud Function uses, so the script and the in-app "Delete account" button
// cannot drift apart. The scripts load its compiled copy from
// firebase/functions/lib, so build the functions first:
//   cd firebase/functions && npm install && npm run build

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PROJECT_ID = 'godoggydate';

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** firebase-admin from the repo root if installed, else the functions copy. */
function loadAdmin() {
  try {
    return require('firebase-admin');
  } catch (rootError) {
    try {
      return require(path.join(ROOT, 'firebase/functions/node_modules/firebase-admin'));
    } catch (functionsError) {
      return fail(
        'firebase-admin is not installed. Run `npm install` in the repo root (or in firebase/functions).',
      );
    }
  }
}

/** The compiled accountCleanup module (see the header). */
function loadAccountCleanup() {
  const file = path.join(ROOT, 'firebase/functions/lib/accountCleanup.js');
  if (!fs.existsSync(file)) {
    return fail(
      'firebase/functions/lib/accountCleanup.js is missing. Build the functions first:\n' +
      '  cd firebase/functions && npm install && npm run build',
    );
  }
  return require(file);
}

/**
 * The Firebase project to act on. Always `godoggydate` unless GDD_PROJECT_ID is
 * set, which exists only so these scripts can be pointed at the local emulators
 * (together with FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST and
 * FIREBASE_STORAGE_EMULATOR_HOST). It is printed first thing in every run.
 */
function projectId() {
  return process.env.GDD_PROJECT_ID || DEFAULT_PROJECT_ID;
}

function initAdmin() {
  const admin = loadAdmin();
  admin.initializeApp({ projectId: projectId() });
  return admin;
}

/**
 * Parses --uid=, --email=, --reason (value or =value), --confirm, --dry-run and
 * any flag in `extraFlags`. Dry run is the default; --confirm applies.
 */
function parseArgs(argv, { extraFlags = [], usage }) {
  const args = { confirm: false, dryRun: false, uid: null, email: null, reason: null, flags: {} };
  const bad = (message) => fail(`${message}\n${usage}`);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm') args.confirm = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--uid=')) args.uid = arg.slice('--uid='.length);
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
    else if (arg === '--reason') {
      if (i + 1 >= argv.length) bad('--reason needs a value.');
      args.reason = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (extraFlags.includes(arg)) args.flags[arg] = true;
    else bad(`Unknown option ${arg}.`);
  }
  if (args.confirm && args.dryRun) bad('Use either --dry-run or --confirm, not both.');
  if (!args.uid && !args.email) bad('Give --uid=<uid> or --email=<email>.');
  if (args.uid && (args.uid.length > 128 || args.uid.includes('/'))) bad('That is not a valid uid.');
  if (args.reason !== null) {
    args.reason = args.reason.replace(/\s+/g, ' ').trim() || null;
    if (args.reason && args.reason.length > 500) bad('Keep the reason to 500 characters.');
  }
  return args;
}

/**
 * Finds the uid and the Auth user. With --uid the Auth user may already be gone
 * (its data can still be cleaned up); with --email it must exist.
 */
async function resolveTarget(auth, { uid, email }) {
  if (uid) {
    try {
      return { uid, user: await auth.getUser(uid) };
    } catch (error) {
      if (error && error.code === 'auth/user-not-found') return { uid, user: null };
      throw error;
    }
  }
  const user = await auth.getUserByEmail(email);
  return { uid: user.uid, user };
}

/**
 * Storage buckets that may hold this project's photos. GDD_STORAGE_BUCKET wins;
 * otherwise both default names a project can have, keeping the ones that exist.
 * Throws if none does, so nothing is deleted while the photos stay public.
 */
async function resolveBuckets(admin) {
  const names = process.env.GDD_STORAGE_BUCKET
    ? [process.env.GDD_STORAGE_BUCKET]
    : [`${projectId()}.appspot.com`, `${projectId()}.firebasestorage.app`];
  // The Storage emulator doesn't serve bucket metadata, and any name works there.
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) return [admin.storage().bucket(names[0])];
  const found = [];
  for (const name of names) {
    const bucket = admin.storage().bucket(name);
    // Only a clear "no such bucket" rules a name out. An error (permissions, a
    // network blip) keeps it: deleteFiles then reports the failure instead of
    // the photos being skipped without a word.
    const [exists] = await bucket.exists().catch(() => [true]);
    if (exists) found.push(bucket);
  }
  if (found.length === 0) {
    throw new Error(
      `No Storage bucket found (tried ${names.join(', ')}). Set GDD_STORAGE_BUCKET to the bucket name ` +
      'so the photos can be deleted.',
    );
  }
  return found;
}

/** One object the cleanup can call deleteFiles on, over every bucket found. */
function bucketAdapter(buckets) {
  return {
    async deleteFiles(options) {
      for (const bucket of buckets) await bucket.deleteFiles(options);
    },
  };
}

/**
 * The script's version of "cancel what they host, leave what they joined".
 * Hosted events that are still ahead are marked cancelled first, so the
 * onPackDayCancelled function tells the people who signed up, then removed;
 * the rest are removed. Joined events just lose the person.
 */
function packDayCleanup(db, FieldValue) {
  return async (uid) => {
    const hosted = await db.collection('packDays').where('hostUid', '==', uid).get();
    for (const doc of hosted.docs) {
      const event = doc.data();
      if (event.status === 'open' && event.startsAtMs > Date.now()) {
        await doc.ref.update({
          status: 'cancelled',
          cancelledAtMs: Date.now(),
          removedByModerator: true,
          removedReason: 'The host left GoDoggyDate.',
        });
      }
      await doc.ref.delete();
    }
    const joined = await db.collection('packDays').where('attendeeUids', 'array-contains', uid).get();
    for (const doc of joined.docs) {
      await doc.ref.update({
        attendeeUids: FieldValue.arrayRemove(uid),
        foundingUids: FieldValue.arrayRemove(uid),
      });
    }
  };
}

/** Subscription ids the person's entitlements name, for the "cancel these by hand" notice. */
async function stripeIdsFor(db, uid) {
  const data = (await db.doc(`users/${uid}/private/entitlements`).get()).data() || {};
  const pro = data.pro || {};
  return {
    subscriptionId: typeof pro.stripeSubscriptionId === 'string' ? pro.stripeSubscriptionId : null,
    customerId: typeof pro.stripeCustomerId === 'string' ? pro.stripeCustomerId : null,
    foundingNumber: typeof data.foundingNumber === 'number' ? data.foundingNumber : null,
  };
}

module.exports = {
  fail,
  loadAdmin,
  loadAccountCleanup,
  projectId,
  initAdmin,
  parseArgs,
  resolveTarget,
  resolveBuckets,
  bucketAdapter,
  packDayCleanup,
  stripeIdsFor,
};
