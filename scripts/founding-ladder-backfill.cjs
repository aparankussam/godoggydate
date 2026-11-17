#!/usr/bin/env node
// One-time move to the founding ladder (#1–50 free, #51–150 paid at $39).
//
// Before the ladder, every new dog profile got a free "Founding Pack" number,
// up to a cap of 100 (500 before that), and nothing else. Now:
//   • #1–50 are free Founding Members, with the lifetime entitlement.
//   • #51–150 exist only for people who paid $39.
// This script brings existing data in line:
//   1. Dogs holding #1–50 get the free Founding Member entitlement.
//   2. Dogs holding #51+ without a paid membership lose the number (it was a
//      free number from the old rules; those spots are now paid only).
//   3. Paid members keep their number and get it recorded on their entitlement.
//   4. If step 2 freed numbers above 50, the counter moves back down so paid
//      numbering starts right after the highest number still in use.
//
// --renumber (before launch only): after deleting test accounts, close the gaps
// they left. The remaining dogs become #1, #2, #3… in their current order, and
// the counter is set to how many there are. Refused once anyone has paid or
// any number is above 50, because by then numbers are public and promised.
//
// Delete test accounts first (scripts/admin-delete-user.cjs).
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/founding-ladder-backfill.cjs [--renumber]            # dry run, changes nothing
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/founding-ladder-backfill.cjs [--renumber] --confirm  # applies the changes
//
// Safe to run more than once. Run it right after deploying the new functions.

const admin = require('firebase-admin');

// Mirror shared/founding.ts and FOUNDING_FREE_CAP in firebase/functions/src/index.ts.
const FOUNDING_FREE_SPOTS = 50;

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function describeEntitlement(ent) {
  if (ent.lifetimeChatUnlocks !== true) return 'not a member';
  if (ent.foundingFree === true) return 'free member';
  return 'paid member';
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const renumber = args.includes('--renumber');
  admin.initializeApp({ projectId: 'godoggydate' });
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const counterRef = db.doc('counters/foundingPack');
  const counterBefore = asNumber((await counterRef.get()).data()?.count) ?? 0;

  const dogsSnap = await db.collection('dogs').where('foundingPackNumber', '>', 0).get();
  const holders = dogsSnap.docs
    .map((d) => ({ uid: d.id, ref: d.ref, name: d.data().name || '(no name)', number: asNumber(d.data().foundingPackNumber) }))
    .filter((h) => h.number !== null)
    .sort((a, b) => a.number - b.number);

  const entSnaps = holders.length
    ? await db.getAll(...holders.map((h) => db.doc(`users/${h.uid}/private/entitlements`)))
    : [];
  const ents = entSnaps.map((s) => s.data() ?? {});

  if (renumber) {
    const problems = [];
    if (counterBefore > FOUNDING_FREE_SPOTS) problems.push(`the counter is ${counterBefore}, above ${FOUNDING_FREE_SPOTS}`);
    holders.forEach((h, i) => {
      if (h.number > FOUNDING_FREE_SPOTS) problems.push(`${h.name} holds #${h.number}, above ${FOUNDING_FREE_SPOTS}`);
      if (ents[i].lifetimeChatUnlocks === true && ents[i].foundingFree !== true) problems.push(`${h.name} is a paid member`);
    });
    // A buyer with no dog profile yet holds a number only on their entitlement,
    // so this script can't see it. Any successful purchase means: don't renumber.
    const purchases = await db.collection('payments').where('type', '==', 'founding_member').get();
    const paid = purchases.docs.filter((d) => d.data().status === 'succeeded').length;
    if (paid > 0) problems.push(`${paid} Founding Member purchase(s) exist`);
    if (problems.length) {
      throw new Error(`Refusing to renumber, because numbers are already public or promised: ${problems.join('; ')}.`);
    }
  }

  const plan = [];
  let highestKept = 0;
  holders.forEach((h, i) => {
    const entRef = entSnaps[i].ref;
    const ent = ents[i];
    const status = describeEntitlement(ent);
    const target = renumber ? i + 1 : h.number;
    const moves = target !== h.number;
    const label = moves ? `#${h.number} -> #${target}` : `#${h.number}`;

    if (target <= FOUNDING_FREE_SPOTS) {
      highestKept = Math.max(highestKept, target);
      const entitlementOk =
        ent.lifetimeChatUnlocks === true && ent.foundingFree === true && asNumber(ent.foundingNumber) === target;
      if (entitlementOk && !moves) {
        plan.push({ h, status, action: `${label}: keep (already a free member)` });
        return;
      }
      plan.push({
        h, status,
        action: `${label}: ${moves ? 'renumber and ' : ''}grant free Founding Member`,
        apply: (batch) => {
          if (moves) batch.update(h.ref, { foundingPackNumber: target });
          batch.set(entRef, {
            lifetimeChatUnlocks: true,
            foundingFree: true,
            foundingNumber: target,
            source: ent.lifetimeChatUnlocks === true ? (ent.source || 'founding_member') : 'founding_free',
            freeGrantedAt: now,
          }, { merge: true });
        },
      });
      return;
    }

    if (ent.lifetimeChatUnlocks === true) {
      highestKept = Math.max(highestKept, h.number);
      if (asNumber(ent.foundingNumber) === h.number) {
        plan.push({ h, status, action: `${label}: keep (paid)` });
        return;
      }
      plan.push({
        h, status, action: `${label}: keep (paid), record the number`,
        apply: (batch) => batch.set(entRef, { foundingNumber: h.number }, { merge: true }),
      });
      return;
    }

    plan.push({
      h, status, action: `${label}: remove the number (above ${FOUNDING_FREE_SPOTS} and not paid)`,
      apply: (batch) => batch.update(h.ref, { foundingPackNumber: admin.firestore.FieldValue.delete() }),
    });
  });

  // Renumbering sets the counter to exactly the dogs that remain. Otherwise it
  // only ever goes down, and never below what's still in use.
  const counterAfter = renumber
    ? holders.length
    : Math.max(Math.min(counterBefore, FOUNDING_FREE_SPOTS), highestKept);
  const counterChanges = counterAfter !== counterBefore;

  console.log(`Firebase project: ${admin.app().options.projectId}`);
  console.log(`counters/foundingPack: ${counterBefore}${counterChanges ? ` -> ${counterAfter}` : ' (unchanged)'}`);
  console.log(`Dogs holding a number: ${holders.length}${renumber ? ' (renumbering)' : ''}\n`);
  for (const { h, status, action } of plan) {
    console.log(`${h.name.padEnd(20).slice(0, 20)}  ${h.uid}  ${status.padEnd(12)}  ${action}`);
  }

  const writes = plan.filter((p) => p.apply);
  if (!confirm) {
    console.log(`\nDry run: ${writes.length} change(s) and ${counterChanges ? 'a counter change' : 'no counter change'} would be made. Re-run with --confirm to apply.`);
    return;
  }

  for (let i = 0; i < writes.length; i += 200) {
    const batch = db.batch();
    writes.slice(i, i + 200).forEach((p) => p.apply(batch));
    await batch.commit();
  }

  if (counterChanges) {
    // If a signup or a payment moved the counter while this ran, stop rather
    // than risk handing out a number twice. Running again fixes it up.
    await db.runTransaction(async (tx) => {
      const current = asNumber((await tx.get(counterRef)).data()?.count) ?? 0;
      if (current !== counterBefore) {
        throw new Error(`counters/foundingPack moved from ${counterBefore} to ${current} while this ran. Run the script again.`);
      }
      tx.set(counterRef, { count: counterAfter }, { merge: true });
    });
  }

  console.log(`\nApplied ${writes.length} change(s).${counterChanges ? ` Counter set to ${counterAfter}.` : ''}`);
}

main().catch((error) => {
  console.error('Founding ladder backfill failed:', error.message || error);
  process.exit(1);
});
