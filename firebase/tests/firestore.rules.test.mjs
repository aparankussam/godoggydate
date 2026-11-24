// Tests for ../../firestore.rules, run against an already running Firestore
// emulator under a throwaway project id (demo-rules-test), so no app data is
// touched. See README.md in this folder.
//
//   cd firebase/tests && npm ci && npm test
//
// The emulator is found through FIRESTORE_EMULATOR_HOST (default 127.0.0.1:8080).

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

setLogLevel('error');

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const rules = readFileSync(process.env.FIRESTORE_RULES_PATH || new URL('../../firestore.rules', import.meta.url), 'utf8');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules, host, port: Number(port) },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ── Who is calling ────────────────────────────────────────────────────────────
const as = (uid, provider) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: provider, identities: {} } }).firestore();
const google = (uid) => as(uid, 'google.com');
const apple = (uid) => as(uid, 'apple.com');
const guest = (uid) => as(uid, 'anonymous');
const password = (uid) => as(uid, 'password');
const signedOut = () => testEnv.unauthenticatedContext().firestore();

/** Seed documents with the rules switched off. */
async function seed(write) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => write(ctx.firestore()));
}

const PHOTO = 'https://firebasestorage.googleapis.com/v0/b/b.appspot.com/o/dogs%2Fu%2Fu%2Fphotos%2F1_a.jpg?alt=media&token=t';

/** A dog as the web and iPhone forms save it (real onboarding output, nulls included). */
function dogDoc(uid, overrides = {}) {
  return {
    name: 'Waffles',
    breed: 'Corgi Mix',
    age: 'adult',
    sex: 'F',
    size: 'S',
    energyLevel: 60,
    temperament: ['Playful 🎮'],
    playStyles: ['wrestling 🤼'],
    notGoodWith: [],
    behaviorFlags: [],
    photos: [PHOTO, PHOTO, PHOTO],
    prompts: [{ prompt: "My dog's personality in 3 words:", answer: 'Professional sock thief.' }],
    city: 'Ann Arbor',
    state: 'MI',
    location: 'Ann Arbor, MI',
    lat: 42.28,
    lng: -83.74,
    vaccinated: true,
    rabiesExpiry: null,
    adoptionDate: null,
    birthYear: null,
    birthMonth: null,
    birthDay: null,
    coverPhotoIndex: null,
    coverFocusX: null,
    coverFocusY: null,
    ownerId: uid,
    createdAt: 1795273613005,
    updatedAt: 1795273613267,
    ...overrides,
  };
}

const text = (n) => 'x'.repeat(n);

// ── dogs: who may create one ──────────────────────────────────────────────────
describe('dogs/{uid} create', () => {
  it('an anonymous guest cannot create a dog, not even a hollow one', async () => {
    await assertFails(setDoc(doc(guest('g1'), 'dogs/g1'), { name: 'x' }));
    await assertFails(setDoc(doc(guest('g1'), 'dogs/g1'), dogDoc('g1')));
  });

  it('a Google account can create its own complete dog', async () => {
    await assertSucceeds(setDoc(doc(google('u1'), 'dogs/u1'), dogDoc('u1')));
  });

  it('an Apple account can create its own dog', async () => {
    await assertSucceeds(setDoc(doc(apple('u2'), 'dogs/u2'), dogDoc('u2')));
  });

  it('other sign-in providers (password, custom) cannot', async () => {
    await assertFails(setDoc(doc(password('u3'), 'dogs/u3'), dogDoc('u3')));
    await assertFails(setDoc(doc(as('u4', 'custom'), 'dogs/u4'), dogDoc('u4')));
  });

  it('nobody signed out can', async () => {
    await assertFails(setDoc(doc(signedOut(), 'dogs/u5'), dogDoc('u5')));
  });

  it("an account can only create the dog with its own id", async () => {
    await assertFails(setDoc(doc(google('u1'), 'dogs/someone-else'), dogDoc('u1')));
  });

  it('a hollow doc is allowed by the rules (the Founding number is what needs a finished profile)', async () => {
    await assertSucceeds(setDoc(doc(google('u6'), 'dogs/u6'), { name: 'x' }));
  });

  it('server-only fields cannot be set at creation', async () => {
    for (const field of [
      { foundingPackNumber: 1 },
      { trustScore: 1 },
      { ratingCount: 9 },
      { meetAgainRate: 1 },
      { ai: { vibe: 'x' } },
      { householdMemberIds: ['a'] },
      { householdMemberNames: { a: 'x' } },
    ]) {
      await assertFails(setDoc(doc(google('u7'), 'dogs/u7'), dogDoc('u7', field)));
    }
  });
});

// ── dogs: size and shape caps ─────────────────────────────────────────────────
describe('dogs/{uid} size and shape', () => {
  const create = (overrides) => setDoc(doc(google('u1'), 'dogs/u1'), dogDoc('u1', overrides));

  it('text fields stop at their caps (name 60, breed 80, city 80, bio and notes 1000)', async () => {
    await assertSucceeds(create({ name: text(60), breed: text(80), city: text(80), bio: text(1000), healthNotes: text(1000) }));
    await testEnv.clearFirestore();
    await assertFails(create({ name: text(61) }));
    await assertFails(create({ breed: text(81) }));
    await assertFails(create({ city: text(81) }));
    await assertFails(create({ bio: text(1001) }));
    await assertFails(create({ healthNotes: text(1001) }));
    await assertFails(create({ location: text(161) }));
    await assertFails(create({ state: text(41) }));
  });

  it('a 900 KB bio is refused', async () => {
    await assertFails(create({ bio: text(900 * 1024) }));
  });

  it('a name that is not a string is refused', async () => {
    await assertFails(create({ name: { nested: 'map' } }));
    await assertFails(create({ name: 12345 }));
  });

  it('numbers and booleans must be numbers and booleans', async () => {
    await assertFails(create({ energyLevel: 'high' }));
    await assertFails(create({ lat: '42' }));
    await assertFails(create({ vaccinated: 'yes' }));
    await assertFails(create({ publicPage: 'no' }));
  });

  it('photos: at most 6, each a string of at most 1000 characters', async () => {
    await assertSucceeds(create({ photos: Array(6).fill(PHOTO) }));
    await testEnv.clearFirestore();
    await assertFails(create({ photos: Array(7).fill(PHOTO) }));
    await assertFails(create({ photos: [PHOTO, text(1001)] }));
    await assertFails(create({ photos: [PHOTO, PHOTO, PHOTO, PHOTO, PHOTO, text(5000)] }));
    await assertFails(create({ photos: [PHOTO, 42] }));
    await assertFails(create({ photos: 'https://evil.example/x.png' }));
    await assertSucceeds(create({ photos: [PHOTO, '_placeholder_', '_placeholder_'] }));
  });

  it('chip lists: at most 12 entries (temperament, playStyles, notGoodWith, behaviorFlags)', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `chip ${i}`);
    await assertSucceeds(create({ temperament: twelve, playStyles: twelve, notGoodWith: twelve, behaviorFlags: twelve }));
    await testEnv.clearFirestore();
    const thirteen = [...twelve, 'one more'];
    for (const field of ['temperament', 'playStyles', 'notGoodWith', 'behaviorFlags']) {
      await assertFails(create({ [field]: thirteen }));
    }
    await assertFails(create({ temperament: [text(5000)] }));
    await assertFails(create({ temperament: 'Playful' }));
  });

  it('prompts: answers up to 300 characters, at most 6 prompts', async () => {
    const entry = (answer) => ({ prompt: 'Q', answer });
    await assertSucceeds(create({ prompts: [entry(text(300))] }));
    await testEnv.clearFirestore();
    await assertFails(create({ prompts: [entry(text(301))] }));
    await assertFails(create({ prompts: Array(7).fill(entry('a')) }));
    await assertFails(create({ prompts: [entry('ok'), entry('ok'), entry(text(301))] }));
    await assertFails(create({ prompts: ['not a map'] }));
  });

  it('a document with an absurd number of keys is refused', async () => {
    const many = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${i}`, 1]));
    await assertFails(create(many));
  });

  it('the profile fields the form limits allow (PROFILE_TEXT_LIMITS) all pass', async () => {
    await assertSucceeds(create({ name: text(50), breed: text(60), city: text(60), prompts: [{ prompt: 'Q', answer: text(300) }] }));
  });

  it('a field a newer app version adds is not refused (no whitelist)', async () => {
    await assertSucceeds(create({ publicPage: false, somethingNew: 'ok' }));
  });
});

// ── dogs: updates, reads, deletes ─────────────────────────────────────────────
describe('dogs/{uid} update, read, delete', () => {
  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, 'dogs/u1'), { ...dogDoc('u1'), foundingPackNumber: 7, trustScore: 0.9, ratingCount: 3 }));
  });

  it('the owner can edit their profile, including the cover photo and public-page switch', async () => {
    const db = google('u1');
    await assertSucceeds(updateDoc(doc(db, 'dogs/u1'), { bio: 'Loves fetch', updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(db, 'dogs/u1'), { coverPhotoIndex: 1, coverFocusX: 50, coverFocusY: 40 }));
    await assertSucceeds(updateDoc(doc(db, 'dogs/u1'), { publicPage: false }));
    await assertSucceeds(updateDoc(doc(db, 'dogs/u1'), { bestFriendMatchId: null }));
  });

  it('server-only fields cannot be changed, removed or forged by the owner', async () => {
    const db = google('u1');
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { foundingPackNumber: 1 }));
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { trustScore: 1 }));
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { ratingCount: 100 }));
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { ai: { x: 1 } }));
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { householdMemberIds: ['mallory'] }));
  });

  it('an update cannot push a field over its cap', async () => {
    const db = google('u1');
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { bio: text(900 * 1024) }));
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { photos: Array(7).fill(PHOTO) }));
    await assertFails(updateDoc(doc(db, 'dogs/u1'), { name: text(61) }));
  });

  it("nobody else can edit or delete someone's dog", async () => {
    await assertFails(updateDoc(doc(google('u2'), 'dogs/u1'), { bio: 'hacked' }));
    await assertFails(deleteDoc(doc(google('u2'), 'dogs/u1')));
    await assertFails(updateDoc(doc(guest('g1'), 'dogs/u1'), { bio: 'hacked' }));
  });

  it('any signed-in account can read a dog, a signed-out visitor cannot', async () => {
    await assertSucceeds(getDoc(doc(google('u2'), 'dogs/u1')));
    await assertSucceeds(getDoc(doc(guest('g1'), 'dogs/u1')));
    await assertFails(getDoc(doc(signedOut(), 'dogs/u1')));
  });

  it('the owner can delete their own dog', async () => {
    await assertSucceeds(deleteDoc(doc(google('u1'), 'dogs/u1')));
  });
});

// ── users, private docs, entitlements ─────────────────────────────────────────
describe('users/{uid} and private docs', () => {
  it('the owner writes the terms acceptance, a guest too', async () => {
    const terms = { termsVersion: '2026-11', ageConfirmed18: true };
    await assertSucceeds(setDoc(doc(google('u1'), 'users/u1'), terms, { merge: true }));
    await assertSucceeds(setDoc(doc(guest('g1'), 'users/g1'), terms, { merge: true }));
    await assertFails(setDoc(doc(google('u1'), 'users/u1'), { termsVersion: text(41) }, { merge: true }));
    await assertFails(setDoc(doc(google('u1'), 'users/u1'), { ageConfirmed18: 'yes' }, { merge: true }));
  });

  it("nobody reads or writes someone else's user doc", async () => {
    await seed((db) => setDoc(doc(db, 'users/u1'), { termsVersion: '2026-11' }));
    await assertFails(getDoc(doc(google('u2'), 'users/u1')));
    await assertFails(setDoc(doc(google('u2'), 'users/u1'), { termsVersion: 'x' }));
    await assertFails(deleteDoc(doc(google('u1'), 'users/u1')));
  });

  it("the private location doc is the owner's alone and is size-limited", async () => {
    const mine = google('u1');
    await assertSucceeds(setDoc(doc(mine, 'users/u1/private/dogProfile'), { zip: '48104', city: 'Ann Arbor', state: 'MI', lat: 42.28, lng: -83.74 }, { merge: true }));
    await assertFails(setDoc(doc(mine, 'users/u1/private/dogProfile'), { zip: '1234567890123' }, { merge: true }));
    await assertFails(setDoc(doc(mine, 'users/u1/private/dogProfile'), { city: text(81) }, { merge: true }));
    await assertFails(setDoc(doc(mine, 'users/u1/private/dogProfile'), { lat: 'x' }, { merge: true }));
    await assertFails(getDoc(doc(google('u2'), 'users/u1/private/dogProfile')));
    await assertFails(setDoc(doc(google('u2'), 'users/u1/private/dogProfile'), { zip: '00000' }));
  });

  it('push tokens: up to 50 per kind', async () => {
    const mine = google('u1');
    const tokens = (n) => Array.from({ length: n }, (_, i) => `token-${i}`);
    await assertSucceeds(setDoc(doc(mine, 'users/u1/private/push'), { fcmWebTokens: tokens(50), expoPushTokens: tokens(2) }, { merge: true }));
    await assertFails(setDoc(doc(mine, 'users/u1/private/push'), { fcmWebTokens: tokens(51) }, { merge: true }));
  });

  it('entitlements (Founding Member, Pro, lifetime chat) cannot be written or deleted by anyone', async () => {
    await seed((db) => setDoc(doc(db, 'users/u1/private/entitlements'), { lifetimeChatUnlocks: false, foundingNumber: 3 }));
    for (const db of [google('u1'), google('u2'), guest('g1')]) {
      await assertFails(setDoc(doc(db, 'users/u1/private/entitlements'), { lifetimeChatUnlocks: true }, { merge: true }));
      await assertFails(updateDoc(doc(db, 'users/u1/private/entitlements'), { foundingNumber: 1 }));
      await assertFails(deleteDoc(doc(db, 'users/u1/private/entitlements')));
    }
    await assertFails(setDoc(doc(google('u9'), 'users/u9/private/entitlements'), { lifetimeChatUnlocks: true, source: 'founding_member' }));
  });

  it('the owner can read their own entitlements, nobody else can', async () => {
    await seed((db) => setDoc(doc(db, 'users/u1/private/entitlements'), { lifetimeChatUnlocks: true }));
    await assertSucceeds(getDoc(doc(google('u1'), 'users/u1/private/entitlements')));
    await assertFails(getDoc(doc(google('u2'), 'users/u1/private/entitlements')));
  });

  it('the founding counter is public to read and closed to writes', async () => {
    await seed((db) => setDoc(doc(db, 'counters/foundingPack'), { count: 4 }));
    await assertSucceeds(getDoc(doc(signedOut(), 'counters/foundingPack')));
    await assertFails(setDoc(doc(google('u1'), 'counters/foundingPack'), { count: 0 }));
    await assertFails(setDoc(doc(google('u1'), 'counters/foundingPack'), { count: 4 }, { merge: true }));
  });

  it('payments, unlocks, stripe events, invites and ZIP density are server-only', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'payments/p1'), { userId: 'u1', status: 'succeeded' });
      await setDoc(doc(db, 'matchUnlocks/m1'), { userId: 'u1' });
      await setDoc(doc(db, 'stripeEvents/e1'), { type: 'x' });
      await setDoc(doc(db, 'householdInvites/ABC123'), { dogId: 'u1' });
      await setDoc(doc(db, 'zipDensity/48104'), { count: 3 });
      await setDoc(doc(db, 'moderationLog/l1'), { kind: 'x' });
      await setDoc(doc(db, 'opsThrottle/t1'), { scope: 'x' });
    });
    await assertSucceeds(getDoc(doc(google('u1'), 'payments/p1'))); // the payer reads their own record
    await assertFails(getDoc(doc(google('u2'), 'payments/p1')));
    for (const path of ['matchUnlocks/m1', 'stripeEvents/e1', 'householdInvites/ABC123', 'zipDensity/48104', 'moderationLog/l1', 'opsThrottle/t1']) {
      await assertFails(getDoc(doc(google('u1'), path)));
      await assertFails(setDoc(doc(google('u1'), path), { x: 1 }));
    }
    await assertFails(setDoc(doc(google('u1'), 'payments/p2'), { userId: 'u1', status: 'succeeded' }));
  });
});

// ── matches and messages ──────────────────────────────────────────────────────
describe('matches and messages', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'matches/a_b'), {
        dog1UserId: 'a', dog2UserId: 'b', dog1Id: 'a', dog2Id: 'b',
        chatUnlocked: false, dog1ChatUnlocked: false, dog2ChatUnlocked: false, chatFreeZone: true,
      });
    });
  });

  const message = (overrides = {}) => ({ text: 'hello', fromUserId: 'a', senderId: 'a', isSystem: false, read: false, createdAt: new Date(), ...overrides });
  const send = (db, data) => setDoc(doc(db, 'matches/a_b/messages/m1'), data);

  it('a party sends a normal message and a valid playdate card', async () => {
    await assertSucceeds(send(google('a'), message()));
    await assertSucceeds(setDoc(doc(google('a'), 'matches/a_b/messages/m2'), message({
      type: 'playdate_proposal',
      playdate: { date: '2026-12-01', time: '10:30', place: 'Dog park' },
    })));
  });

  it('message text stops at 1000 characters', async () => {
    await assertSucceeds(send(google('a'), message({ text: text(1000) })));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/m3'), message({ text: text(1001) })));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/m4'), message({ text: text(900 * 1024) })));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/m5'), message({ text: 42 })));
  });

  it('a playdate card has only date, time and place, each at most 200 characters', async () => {
    const card = (playdate, id) => setDoc(doc(google('a'), `matches/a_b/messages/${id}`), message({ type: 'playdate_proposal', playdate }));
    await assertSucceeds(card({ date: text(200), time: text(200), place: text(200) }, 'p1'));
    await assertFails(card({ date: '2026-12-01', time: '10:30', place: text(201) }, 'p2'));
    await assertFails(card({ date: text(201), place: 'x' }, 'p3'));
    await assertFails(card({ date: '2026-12-01', place: 'x', extra: 'nope' }, 'p4'));
    await assertFails(card('a string', 'p5'));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/p6'), message({ type: 'something_else' })));
  });

  it('a message cannot claim to be a system banner or come from someone else', async () => {
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/s1'), message({ isSystem: true })));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/s2'), message({ fromUserId: 'b' })));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/s3'), message({ senderId: text(129) })));
    await assertFails(setDoc(doc(google('a'), 'matches/a_b/messages/s4'), message({ surprise: 'field' })));
  });

  it('only the two people in a match read or write its thread', async () => {
    await seed((db) => setDoc(doc(db, 'matches/a_b/messages/old'), message()));
    await assertSucceeds(getDoc(doc(google('b'), 'matches/a_b/messages/old')));
    await assertFails(getDoc(doc(google('mallory'), 'matches/a_b/messages/old')));
    await assertFails(getDocs(collection(google('mallory'), 'matches/a_b/messages')));
    await assertFails(getDoc(doc(guest('g1'), 'matches/a_b/messages/old')));
    await assertFails(setDoc(doc(google('mallory'), 'matches/a_b/messages/x'), message({ fromUserId: 'mallory' })));
    await assertFails(getDoc(doc(google('mallory'), 'matches/a_b')));
    await assertFails(updateDoc(doc(google('mallory'), 'matches/a_b'), { lastMessage: 'x' }));
  });

  it('messages cannot be edited or deleted afterwards', async () => {
    await seed((db) => setDoc(doc(db, 'matches/a_b/messages/old'), message()));
    await assertFails(updateDoc(doc(google('a'), 'matches/a_b/messages/old'), { text: 'changed' }));
    await assertFails(deleteDoc(doc(google('a'), 'matches/a_b/messages/old')));
  });

  it('a block in either direction stops new messages', async () => {
    await seed((db) => setDoc(doc(db, 'blocks/b/blocked/a'), { targetUserId: 'a' }));
    await assertFails(send(google('a'), message()));
    await assertFails(setDoc(doc(google('b'), 'matches/a_b/messages/m9'), message({ fromUserId: 'b', senderId: 'b' })));
  });
});

// ── swipes, blocks, ratings, reports, reminders ───────────────────────────────
describe('swipes', () => {
  it('a valid decision is written by its owner only', async () => {
    const decision = { action: 'like', targetUserId: 'b', timestamp: new Date() };
    await assertSucceeds(setDoc(doc(google('a'), 'swipes/a/decisions/b'), decision));
    await assertSucceeds(setDoc(doc(google('a'), 'swipes/a/decisions/c'), { ...decision, targetDogId: 'c', targetUserId: 'c' }, { merge: true }));
    await assertFails(setDoc(doc(google('mallory'), 'swipes/a/decisions/b'), decision));
  });

  it('only the known fields, a real action and a bounded id are accepted', async () => {
    const decision = { action: 'like', targetUserId: 'b', timestamp: new Date() };
    await assertFails(setDoc(doc(google('a'), 'swipes/a/decisions/b'), { ...decision, action: 'superlike' }));
    await assertFails(setDoc(doc(google('a'), 'swipes/a/decisions/b'), { ...decision, bio: text(900 * 1024) }));
    await assertFails(setDoc(doc(google('a'), 'swipes/a/decisions/b'), { ...decision, targetUserId: text(129) }));
    await assertFails(setDoc(doc(google('a'), 'swipes/a/decisions/b'), { action: 'like', timestamp: new Date() }));
  });

  it("decisions are private: others can't list them, and can only read a like that targets them", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'swipes/a/decisions/b'), { action: 'like', targetUserId: 'b' });
      await setDoc(doc(db, 'swipes/a/decisions/c'), { action: 'pass', targetUserId: 'c' });
    });
    await assertSucceeds(getDoc(doc(google('b'), 'swipes/a/decisions/b')));
    await assertFails(getDoc(doc(google('c'), 'swipes/a/decisions/c'))); // a pass stays private
    await assertFails(getDoc(doc(google('mallory'), 'swipes/a/decisions/b')));
    await assertFails(getDocs(collection(google('b'), 'swipes/a/decisions')));
    await assertSucceeds(getDocs(collection(google('a'), 'swipes/a/decisions')));
  });
});

describe('blocks', () => {
  it('the owner blocks and unblocks; only { targetUserId, createdAt } is accepted', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'blocks/a/blocked/b'), { targetUserId: 'b', createdAt: new Date() }));
    await assertFails(setDoc(doc(google('a'), 'blocks/a/blocked/c'), { targetUserId: 'c', createdAt: new Date(), note: text(900 * 1024) }));
    await assertFails(setDoc(doc(google('a'), 'blocks/a/blocked/d'), { targetUserId: 'someone-else', createdAt: new Date() }));
    await assertFails(setDoc(doc(google('mallory'), 'blocks/a/blocked/e'), { targetUserId: 'e' }));
    await assertSucceeds(deleteDoc(doc(google('a'), 'blocks/a/blocked/b')));
  });

  it("nobody reads another person's block list", async () => {
    await seed((db) => setDoc(doc(db, 'blocks/a/blocked/b'), { targetUserId: 'b' }));
    await assertFails(getDoc(doc(google('b'), 'blocks/a/blocked/b')));
    await assertFails(getDocs(collection(google('b'), 'blocks/a/blocked')));
  });

  it('the blockedBy index is written by the server only', async () => {
    await assertFails(setDoc(doc(google('a'), 'blocks/b/blockedBy/a'), { createdAt: new Date() }));
  });
});

describe('ratings', () => {
  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, 'matches/a_b'), { dog1UserId: 'a', dog2UserId: 'b', dog1Id: 'a', dog2Id: 'b' }));
  });
  const rating = (overrides = {}) => ({ raterId: 'a', matchId: 'a_b', dogId: 'b', stars: 5, wouldMeetAgain: true, createdAt: new Date(), ...overrides });

  it('a party rates the other dog once, with 1 to 5 stars', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'ratings/a_a_b'), rating()));
    await assertFails(setDoc(doc(google('a'), 'ratings/a_a_b2'), rating({ matchId: 'a_b2' }))); // wrong match id for the doc id
    await assertFails(setDoc(doc(google('b'), 'ratings/b_a_b'), rating({ raterId: 'b', dogId: 'b' }))); // rating yourself
  });

  it('stars outside 1 to 5, non-integers and padded documents are refused', async () => {
    await assertFails(setDoc(doc(google('a'), 'ratings/a_a_b'), rating({ stars: 6 })));
    await assertFails(setDoc(doc(google('a'), 'ratings/a_a_b'), rating({ stars: 0 })));
    await assertFails(setDoc(doc(google('a'), 'ratings/a_a_b'), rating({ stars: 4.5 })));
    await assertFails(setDoc(doc(google('a'), 'ratings/a_a_b'), rating({ wouldMeetAgain: 'yes' })));
    const padded = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 1]));
    await assertFails(setDoc(doc(google('a'), 'ratings/a_a_b'), rating(padded)));
  });

  it('someone outside the match cannot rate it, and ratings are private to the rater', async () => {
    await assertFails(setDoc(doc(google('mallory'), 'ratings/mallory_a_b'), rating({ raterId: 'mallory' })));
    await seed((db) => setDoc(doc(db, 'ratings/a_a_b'), rating()));
    await assertSucceeds(getDoc(doc(google('a'), 'ratings/a_a_b')));
    await assertFails(getDoc(doc(google('b'), 'ratings/a_a_b')));
    await assertFails(updateDoc(doc(google('a'), 'ratings/a_a_b'), { stars: 1 }));
  });
});

describe('reports', () => {
  const report = (overrides = {}) => ({ reporterId: 'a', targetUserId: 'b', reason: 'spam', source: 'profile', createdAt: new Date(), ...overrides });

  it('anyone signed in can report, with their own id', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'reports/r1'), report()));
    await assertSucceeds(setDoc(doc(guest('g1'), 'reports/r2'), report({ reporterId: 'g1' })));
    await assertSucceeds(setDoc(doc(google('a'), 'reports/r3'), report({ matchId: 'a_b', eventId: 'e1' })));
    await assertFails(setDoc(doc(google('a'), 'reports/r4'), report({ reporterId: 'someone-else' })));
    await assertFails(setDoc(doc(signedOut(), 'reports/r5'), report()));
  });

  it('reason and free text are capped', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'reports/r1'), report({ reason: text(100), text: text(1000) })));
    await assertFails(setDoc(doc(google('a'), 'reports/r2'), report({ reason: text(101) })));
    await assertFails(setDoc(doc(google('a'), 'reports/r3'), report({ text: text(1001) })));
    await assertFails(setDoc(doc(google('a'), 'reports/r4'), report({ text: text(900 * 1024) })));
    await assertFails(setDoc(doc(google('a'), 'reports/r5'), report({ targetUserId: text(129) })));
    await assertFails(setDoc(doc(google('a'), 'reports/r6'), report({ source: text(61) })));
    await assertFails(setDoc(doc(google('a'), 'reports/r7'), { reporterId: 'a', reason: 'spam' })); // no target
  });

  it('reports are never readable, editable or deletable from a client', async () => {
    await seed((db) => setDoc(doc(db, 'reports/r1'), report()));
    await assertFails(getDoc(doc(google('a'), 'reports/r1')));
    await assertFails(updateDoc(doc(google('a'), 'reports/r1'), { reason: 'other' }));
    await assertFails(deleteDoc(doc(google('a'), 'reports/r1')));
  });
});

describe('dog reminders (household)', () => {
  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, 'dogs/a'), { name: 'A', householdMemberIds: ['sitter'] }));
  });

  it('the owner and a household member read and write, nobody else does', async () => {
    const reminder = { label: 'Heartworm', type: 'heartworm', dueDate: new Date(), createdAt: new Date() };
    await assertSucceeds(setDoc(doc(google('a'), 'dogs/a/reminders/r1'), reminder));
    await assertSucceeds(setDoc(doc(google('sitter'), 'dogs/a/reminders/r2'), reminder));
    await assertSucceeds(getDoc(doc(google('sitter'), 'dogs/a/reminders/r1')));
    await assertFails(setDoc(doc(google('mallory'), 'dogs/a/reminders/r3'), reminder));
    await assertFails(getDoc(doc(google('mallory'), 'dogs/a/reminders/r1')));
    await assertSucceeds(deleteDoc(doc(google('sitter'), 'dogs/a/reminders/r2')));
  });

  it('a reminder label stops at 200 characters', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'dogs/a/reminders/r1'), { label: text(200), type: 'vet', dueDate: new Date() }));
    await assertFails(setDoc(doc(google('a'), 'dogs/a/reminders/r2'), { label: text(201), type: 'vet', dueDate: new Date() }));
    await assertFails(setDoc(doc(google('a'), 'dogs/a/reminders/r3'), { label: text(900 * 1024), type: 'vet', dueDate: new Date() }));
  });
});

// ── Pack Days are written by the server only ──────────────────────────────────
describe('packDays', () => {
  it('signed-in members read them; nobody writes from a client', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), { title: 'Walk', hostUid: 'a' }));
    await assertSucceeds(getDoc(doc(google('b'), 'packDays/e1')));
    await assertFails(getDoc(doc(signedOut(), 'packDays/e1')));
    await assertFails(setDoc(doc(google('a'), 'packDays/e2'), { title: 'Mine', hostUid: 'a' }));
    await assertFails(updateDoc(doc(google('a'), 'packDays/e1'), { official: true }));
  });
});

// ── Pack Day check-ins ────────────────────────────────────────────────────────
describe('packDays/{id}/checkins', () => {
  const MIN = 60_000;
  const seedEvent = (startsInMin, extra = {}) =>
    seed(async (db) => {
      await setDoc(doc(db, 'packDays/e1'), {
        hostUid: 'host', status: 'open', attendeeUids: ['host', 'a'],
        startsAtMs: Date.now() + startsInMin * MIN, durationMinutes: 60, ...extra,
      });
      await setDoc(doc(db, 'dogs/a'), { name: 'Luna', householdMemberIds: ['hh'] });
    });
  const mine = (uid, dogId, over = {}) => ({ uid, dogId, at: serverTimestamp(), method: 'qr', ...over });
  const path = (uid) => `packDays/e1/checkins/${uid}`;

  it('an RSVP\'d attendee checks in once the window is open, and members can read', async () => {
    await seedEvent(10);
    await assertSucceeds(setDoc(doc(google('a'), path('a')), mine('a', 'a')));
    await assertSucceeds(setDoc(doc(google('host'), path('host')), mine('host', 'host', { method: 'location' })));
    await assertSucceeds(getDocs(collection(google('b'), 'packDays/e1/checkins')));
    await assertFails(getDocs(collection(signedOut(), 'packDays/e1/checkins')));
  });

  it('refuses someone who did not RSVP, or checking in as someone else', async () => {
    await seedEvent(10);
    await assertFails(setDoc(doc(google('b'), path('b')), mine('b', 'b')));
    await assertFails(setDoc(doc(google('b'), path('a')), mine('a', 'a')));
    await assertFails(setDoc(doc(google('b'), path('b')), mine('b', 'a')));
  });

  it('a household member may check in for the dog; a stranger may not', async () => {
    await seedEvent(10);
    await assertSucceeds(setDoc(doc(google('hh'), path('hh')), mine('hh', 'a')));
    await assertFails(setDoc(doc(google('x'), path('x')), mine('x', 'a')));
  });

  it('only inside the window: 30 minutes before the start until it ends', async () => {
    await seedEvent(45);
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a')));
    await seedEvent(-90);
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a')));
    await seedEvent(10, { status: 'cancelled' });
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a')));
  });

  it('exact shape only, server time, no update or delete', async () => {
    await seedEvent(10);
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a', { method: 'telepathy' })));
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a', { at: new Date(0) })));
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a', { extra: 1 })));
    await assertSucceeds(setDoc(doc(google('a'), path('a')), mine('a', 'a')));
    await assertFails(updateDoc(doc(google('a'), path('a')), { method: 'location' }));
    await assertFails(setDoc(doc(google('a'), path('a')), mine('a', 'a')));
    await assertFails(deleteDoc(doc(google('a'), path('a'))));
  });
});
