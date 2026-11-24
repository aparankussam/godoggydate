// firebase/functions/src/accountCleanup.ts
// Everything that has to go when a person leaves GoDoggyDate, in one place so
// the deleteAccount callable and scripts/admin-delete-user.cjs cannot drift
// apart (the script used to skip photos, households, Pack Days and legacy
// matches, and said it mirrored the callable).
//
// It never imports firebase-admin: the caller hands in an already initialised
// Firestore and Storage bucket. That keeps it usable from the compiled
// lib/accountCleanup.js inside a script that loaded its own copy of
// firebase-admin, and means it uses no FieldValue sentinels (those break across
// two copies of the library). It does not touch Firebase Auth either: the
// callable and the script each remove or disable the Auth user themselves,
// after this runs.
//
// Kept on purpose (see deleteAccount): payments, matchUnlocks and stripeEvents
// (refund and dispute records), reports filed ABOUT the person, safetyEvidence
// and moderationLog.

/** The slice of a Storage bucket this needs. */
export interface BucketLike {
  deleteFiles(options: { prefix: string }): Promise<unknown>;
}

export interface AccountCleanupDeps {
  db: FirebaseFirestore.Firestore;
  bucket: BucketLike;
  /** Cancels Pack Days the person hosts (telling attendees) and removes them
   *  from ones they joined. The callable and the script have different ways to
   *  do this, so it is handed in. */
  cleanupPackDays: (uid: string) => Promise<void>;
  /** Where best-effort failures are reported. Defaults to console.error. */
  logError?: (message: string, detail: Record<string, unknown>) => void;
}

export interface AccountCleanupOptions {
  /** Count what would go and change nothing. */
  dryRun?: boolean;
}

export interface AccountCleanupReport {
  uid: string;
  dryRun: boolean;
  matches: string[];
  /** Other people's swipe decisions that target this person. */
  targetingDecisions: number;
  ratings: number;
  reports: number;
  householdsLeft: number;
  invites: number;
  /** Steps that failed but did not stop the rest (missing index, etc.). */
  warnings: string[];
}

const DELETE_BATCH = 400;

async function deleteRefs(db: FirebaseFirestore.Firestore, refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += DELETE_BATCH) {
    const batch = db.batch();
    refs.slice(i, i + DELETE_BATCH).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Deletes the person's data. Throws if a step that must succeed (matches,
 * ratings, reports, and the swipes/blocks/users/dogs documents) fails, so the
 * caller does not delete the Auth user and strand half a deletion. Steps that
 * depend on an index or on third parties (decisions targeting them, other
 * dogs' households, invites, Pack Days, photos) are best effort: they are
 * logged and listed in `warnings`, and the rest carries on.
 */
export async function deleteUserData(
  deps: AccountCleanupDeps,
  uid: string,
  options: AccountCleanupOptions = {},
): Promise<AccountCleanupReport> {
  const { db, bucket, cleanupPackDays } = deps;
  const dryRun = options.dryRun === true;
  const logError = deps.logError ?? ((message, detail) => console.error(message, detail));
  const report: AccountCleanupReport = {
    uid,
    dryRun,
    matches: [],
    targetingDecisions: 0,
    ratings: 0,
    reports: 0,
    householdsLeft: 0,
    invites: 0,
    warnings: [],
  };
  const warn = (step: string, error: unknown) => {
    report.warnings.push(step);
    logError(`accountCleanup: ${step}`, { uid, error });
  };

  // Matches in every participant slot, including legacy userAId/userBId docs.
  // recursiveDelete also clears each match's messages subcollection, so the
  // other person doesn't see a ghost thread.
  const matchQueries = await Promise.all([
    db.collection('matches').where('dog1UserId', '==', uid).get(),
    db.collection('matches').where('dog2UserId', '==', uid).get(),
    db.collection('matches').where('userAId', '==', uid).get(),
    db.collection('matches').where('userBId', '==', uid).get(),
  ]);
  const matchRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const snap of matchQueries) {
    for (const d of snap.docs) matchRefs.set(d.id, d.ref);
  }
  report.matches = [...matchRefs.keys()];
  if (!dryRun) {
    for (const ref of matchRefs.values()) {
      await db.recursiveDelete(ref);
    }
  }

  // Other users' swipe decisions that target this person (collection group;
  // needs the decisions.targetUserId COLLECTION_GROUP index).
  try {
    const targeting = await db.collectionGroup('decisions').where('targetUserId', '==', uid).get();
    report.targetingDecisions = targeting.size;
    if (!dryRun) await deleteRefs(db, targeting.docs.map((d) => d.ref));
  } catch (error) {
    // A missing index must not strand the rest of the deletion.
    warn('could not delete decisions that target this user', error);
  }

  // Ratings they wrote and reports they filed.
  for (const [col, field] of [['ratings', 'raterId'], ['reports', 'reporterId']] as const) {
    const snap = await db.collection(col).where(field, '==', uid).get();
    if (col === 'ratings') report.ratings = snap.size;
    else report.reports = snap.size;
    if (!dryRun) await deleteRefs(db, snap.docs.map((d) => d.ref));
  }

  // Where we go: the user's place tags and ask records. Deleting a tag makes
  // onPlaceTagWritten recount (and withdraw) the public places/ count.
  for (const [col, field] of [['placeTags', 'ownerId'], ['placeAsks', 'askerUid']] as const) {
    const snap = await db.collection(col).where(field, '==', uid).get();
    if (!dryRun) await deleteRefs(db, snap.docs.map((d) => d.ref));
  }

  if (!dryRun) {
    await db.recursiveDelete(db.doc(`swipes/${uid}`));
    await db.recursiveDelete(db.doc(`blocks/${uid}`));
    await db.recursiveDelete(db.doc(`users/${uid}`));
    // recursiveDelete, not delete(): a plain delete removed the dog document
    // but ORPHANED its subcollections. dogs/{uid}/reminders holds medication,
    // rabies and vet dates, and sendReminderNotifications would keep sweeping
    // those orphans daily forever.
    await db.recursiveDelete(db.doc(`dogs/${uid}`));
  }

  // Remove this user from every OTHER dog's household. Without this, a
  // deleted user's uid and display label stay embedded in a third party's
  // world-readable dog document indefinitely. A transaction per dog (rather
  // than FieldValue.arrayRemove) so no library-specific sentinel is needed.
  try {
    const households = await db.collection('dogs').where('householdMemberIds', 'array-contains', uid).get();
    report.householdsLeft = households.size;
    if (!dryRun) {
      for (const d of households.docs) {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(d.ref);
          const ids = fresh.data()?.householdMemberIds;
          if (!Array.isArray(ids)) return;
          tx.update(d.ref, { householdMemberIds: ids.filter((id: unknown) => id !== uid) });
        });
        await d.ref.collection('householdNames').doc(uid).delete().catch(() => undefined);
      }
    }
  } catch (error) {
    warn('could not clear household memberships', error);
  }

  // Invites this user created (they carry dogId + createdBy).
  try {
    const invites = await db.collection('householdInvites').where('createdBy', '==', uid).get();
    report.invites = invites.size;
    if (!dryRun) await deleteRefs(db, invites.docs.map((d) => d.ref));
  } catch (error) {
    warn('could not delete household invites', error);
  }

  // Pack Days they hosted (cancelled, attendees told) or joined.
  if (!dryRun) {
    try {
      await cleanupPackDays(uid);
    } catch (error) {
      warn('could not clean up Pack Days', error);
    }
  }

  // Uploaded images. Firestore deletion alone left every photo permanently
  // fetchable: Storage download URLs carry their own ?alt=media&token=,
  // which bypasses storage.rules entirely, so "delete my account" was
  // leaving photographs public on the open internet.
  if (!dryRun) {
    for (const prefix of [`dogs/${uid}/`, `avatars/${uid}/`]) {
      try {
        await bucket.deleteFiles({ prefix });
      } catch (error) {
        warn(`could not delete storage prefix ${prefix}`, error);
      }
    }
  }

  return report;
}
