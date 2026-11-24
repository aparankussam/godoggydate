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
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, setLogLevel, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';

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

describe('where we go (placeTags, places, placeAsks)', () => {
  const tag = { ownerId: 'a', placeId: 'austin-tx__vet__dr-patel', category: 'vet', name: 'Dr. Patel', cityKey: 'austin-tx' };

  it('an owner reads and removes only their own tag; nobody creates or edits one', async () => {
    await seed((db) => setDoc(doc(db, 'placeTags/a__p1'), tag));
    await assertSucceeds(getDoc(doc(google('a'), 'placeTags/a__p1')));
    await assertFails(getDoc(doc(google('b'), 'placeTags/a__p1')));
    await assertFails(getDocs(collection(google('b'), 'placeTags')));
    await assertFails(setDoc(doc(google('a'), 'placeTags/a__p2'), tag));
    await assertFails(updateDoc(doc(google('a'), 'placeTags/a__p1'), { name: 'Other' }));
    await assertFails(deleteDoc(doc(google('b'), 'placeTags/a__p1')));
    await assertSucceeds(deleteDoc(doc(google('a'), 'placeTags/a__p1')));
  });

  it('places and placeAsks are readable by members and never writable', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'places/p1'), { name: 'Dr. Patel', ownerCount: 3 });
      await setDoc(doc(db, 'placeAsks/a__vet'), { askerUid: 'a', category: 'vet' });
    });
    for (const path of ['places/p1', 'placeAsks/a__vet']) {
      await assertSucceeds(getDoc(doc(google('b'), path)));
      await assertFails(getDoc(doc(signedOut(), path)));
      await assertFails(updateDoc(doc(google('a'), path), { ownerCount: 99 }));
      await assertFails(deleteDoc(doc(google('a'), path)));
    }
    await assertFails(setDoc(doc(google('a'), 'places/p2'), { name: 'X', ownerCount: 50 }));
    await assertFails(setDoc(doc(google('a'), 'placeAsks/a__groomer'), { askerUid: 'a' }));
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

// ── Lost dog alert ────────────────────────────────────────────────────────────
describe('lost dog alert', () => {
  const alertDoc = (uid, over = {}) => ({
    ownerId: uid, dogId: uid, dogName: 'Waffles', breed: 'Corgi Mix', size: 'S', markings: 'White chest',
    photoUrl: PHOTO, microchipped: true, medicines: ['Needs Apoquel daily'], city: 'Ann Arbor', state: 'MI',
    status: 'active', createdAt: serverTimestamp(), ...over,
  });
  /** What the app writes: the alert and the one-active pointer in one batch. */
  async function openAlert(db, uid, alertId, over = {}) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'lostAlerts', alertId), alertDoc(uid, over));
    batch.set(doc(db, 'lostActive', uid), { alertId, createdAt: serverTimestamp() });
    await batch.commit();
  }
  async function closeAlert(db, uid, alertId) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'lostAlerts', alertId), { status: 'found', foundAt: serverTimestamp() });
    batch.delete(doc(db, 'lostActive', uid));
    await batch.commit();
  }
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dogs/a'), { name: 'Waffles' });
      await setDoc(doc(db, 'dogs/b'), { name: 'Biscuit' });
    });
  });

  it('an owner opens an alert for their own dog', async () => {
    await assertSucceeds(openAlert(google('a'), 'a', 'alert1abc'));
  });

  it('refuses a second active alert, but allows one after the first is found', async () => {
    await assertSucceeds(openAlert(google('a'), 'a', 'alert1abc'));
    await assertFails(openAlert(google('a'), 'a', 'alert2abc'));
    await assertSucceeds(closeAlert(google('a'), 'a', 'alert1abc'));
    await assertSucceeds(openAlert(google('a'), 'a', 'alert2abc'));
  });

  it('refuses an alert without the pointer, or for someone else\'s dog', async () => {
    await assertFails(setDoc(doc(google('a'), 'lostAlerts/alert1abc'), alertDoc('a')));
    await assertFails(openAlert(google('b'), 'b', 'alert9abc', { ownerId: 'a', dogId: 'a' }));
    await assertFails(openAlert(google('b'), 'b', 'alert9abc', { dogId: 'a' }));
  });

  it('refuses guests, signed-out callers and a dog that does not exist', async () => {
    await assertFails(openAlert(guest('a'), 'a', 'alert1abc'));
    await assertFails(openAlert(google('nodog'), 'nodog', 'alert1abc'));
    await assertFails(setDoc(doc(signedOut(), 'lostAlerts/alert1abc'), alertDoc('a')));
  });

  it('refuses extra fields (a phone or address cannot ride along) and oversized text', async () => {
    await assertFails(openAlert(google('a'), 'a', 'alert1abc', { ownerPhone: '555 010 0199' }));
    await assertFails(openAlert(google('a'), 'a', 'alert1abc', { markings: text(201) }));
    await assertFails(openAlert(google('a'), 'a', 'alert1abc', { status: 'found' }));
    await assertFails(openAlert(google('a'), 'a', 'alert1abc', { createdAt: new Date(0) }));
  });

  it('the pointer cannot be deleted while the alert is still active', async () => {
    await assertSucceeds(openAlert(google('a'), 'a', 'alert1abc'));
    await assertFails(deleteDoc(doc(google('a'), 'lostActive/a')));
  });

  it('only the owner closes an alert, and only status and foundAt change', async () => {
    await assertSucceeds(openAlert(google('a'), 'a', 'alert1abc'));
    await assertFails(updateDoc(doc(google('b'), 'lostAlerts/alert1abc'), { status: 'found', foundAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(google('a'), 'lostAlerts/alert1abc'), { status: 'found', foundAt: serverTimestamp(), dogName: 'Other' }));
    await assertFails(updateDoc(doc(google('a'), 'lostAlerts/alert1abc'), { markings: 'changed' }));
    await assertSucceeds(updateDoc(doc(google('a'), 'lostAlerts/alert1abc'), { lastSeen: 'By the creek' }));
    await assertSucceeds(closeAlert(google('a'), 'a', 'alert1abc'));
    await assertFails(deleteDoc(doc(google('a'), 'lostAlerts/alert1abc')));
  });

  it('signed-in members read an alert; the public (signed out) does not', async () => {
    await assertSucceeds(openAlert(google('a'), 'a', 'alert1abc'));
    await assertSucceeds(getDoc(doc(google('b'), 'lostAlerts/alert1abc')));
    await assertFails(getDoc(doc(signedOut(), 'lostAlerts/alert1abc')));
  });

  it('sightings (exact pins, finder contact) are readable by the owner only and never writable', async () => {
    await assertSucceeds(openAlert(google('a'), 'a', 'alert1abc'));
    await seed((db) => setDoc(doc(db, 'lostAlerts/alert1abc/sightings/s1'), { message: 'Seen', lat: 42.28, lng: -83.74 }));
    await assertSucceeds(getDoc(doc(google('a'), 'lostAlerts/alert1abc/sightings/s1')));
    await assertFails(getDoc(doc(google('b'), 'lostAlerts/alert1abc/sightings/s1')));
    await assertFails(getDocs(collection(google('b'), 'lostAlerts/alert1abc/sightings')));
    await assertFails(setDoc(doc(google('b'), 'lostAlerts/alert1abc/sightings/s2'), { message: 'x' }));
    await assertFails(setDoc(doc(google('a'), 'lostAlerts/alert1abc/sightings/s2'), { message: 'x' }));
  });

  it('the lost kit is private to its owner, with bounded fields; rate counters are server-only', async () => {
    const kit = { microchip: '985112345678901', vetPhone: '555 010 0100', markings: 'White chest', photoUrl: PHOTO };
    await assertSucceeds(setDoc(doc(google('a'), 'users/a/private/lostKit'), kit));
    await assertFails(setDoc(doc(google('a'), 'users/a/private/lostKit'), { ...kit, markings: text(201) }));
    await assertFails(getDoc(doc(google('b'), 'users/a/private/lostKit')));
    await assertFails(setDoc(doc(google('b'), 'users/a/private/lostKit'), kit));
    await assertFails(setDoc(doc(google('a'), 'lostRate/x'), { n: 1 }));
    await assertFails(getDoc(doc(google('a'), 'lostRate/x')));
  });
});

// ── Pack Day group chat ───────────────────────────────────────────────────────
// Members are the RSVP list; writes stop 48 hours after the event ENDS (start +
// duration), by the rules' own clock, not just the UI.
describe('packDays/{eventId}/messages', () => {
  const HOUR = 3_600_000;
  const NOW = Date.now();
  /** An event that started `startedHoursAgo` hours ago and ran 1 hour. */
  const event = (startedHoursAgo, extra = {}) => ({
    title: 'Walk', hostUid: 'host', status: 'open', attendeeUids: ['host', 'a', 'b'],
    startsAtMs: NOW - startedHoursAgo * HOUR, durationMinutes: 60, ...extra,
  });
  const msg = (uid, extra = {}) => ({ fromUserId: uid, text: 'hello', kind: 'text', createdAt: serverTimestamp(), ...extra });
  const post = (db, uid, extra, id = 'm1') => setDoc(doc(db, 'packDays/e1/messages', id), msg(uid, extra));

  it('members read and post; non-members and signed-out visitors do neither', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5)));
    await seed((db) => setDoc(doc(db, 'packDays/e1/messages/old'), { fromUserId: 'a', text: 'hi', kind: 'text' }));
    await assertSucceeds(post(google('a'), 'a'));
    await assertSucceeds(getDoc(doc(google('b'), 'packDays/e1/messages/old')));
    await assertFails(post(google('mallory'), 'mallory'));
    await assertFails(getDoc(doc(google('mallory'), 'packDays/e1/messages/old')));
    await assertFails(getDoc(doc(signedOut(), 'packDays/e1/messages/old')));
  });

  it('a message must be your own, time-stamped by the server, with only known fields', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5)));
    await assertFails(post(google('a'), 'b'));
    await assertFails(setDoc(doc(google('a'), 'packDays/e1/messages/m2'), msg('a', { createdAt: new Date(NOW - 99 * HOUR) })));
    await assertFails(post(google('a'), 'a', { moderated: false }, 'm3'));
    await assertFails(post(google('a'), 'a', { text: text(501) }, 'm4'));
    await assertFails(post(google('a'), 'a', { text: '' }, 'm5'));
    await assertSucceeds(post(google('a'), 'a', { kind: 'here', text: '' }, 'm6'));
    await assertSucceeds(post(google('a'), 'a', { kind: 'late', text: '' }, 'm7'));
  });

  it('nobody edits or deletes a message, even their own', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5)));
    await seed((db) => setDoc(doc(db, 'packDays/e1/messages/m1'), { fromUserId: 'a', text: 'hi', kind: 'text' }));
    await assertFails(updateDoc(doc(google('a'), 'packDays/e1/messages/m1'), { text: 'edited' }));
    await assertFails(deleteDoc(doc(google('a'), 'packDays/e1/messages/m1')));
  });

  it('only the host posts the weather check ("headsup")', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5)));
    await assertSucceeds(post(google('host'), 'host', { kind: 'headsup', text: 'Rain expected, still on?' }));
    await assertFails(post(google('a'), 'a', { kind: 'headsup', text: 'Rain expected, still on?' }, 'm2'));
  });

  it('writes stop 48 hours after the event ends, reads stay open', async () => {
    // Started 49h ago, ended 48h ago: closed.
    await seed((db) => setDoc(doc(db, 'packDays/closed'), event(49)));
    await seed((db) => setDoc(doc(db, 'packDays/closed/messages/m0'), { fromUserId: 'a', text: 'hi', kind: 'text' }));
    // Started 47h ago, ended 46h ago: still writable (album time).
    await seed((db) => setDoc(doc(db, 'packDays/open'), event(47)));
    await assertFails(setDoc(doc(google('a'), 'packDays/closed/messages/m1'), msg('a')));
    await assertSucceeds(getDoc(doc(google('a'), 'packDays/closed/messages/m0')));
    await assertSucceeds(setDoc(doc(google('a'), 'packDays/open/messages/m1'), msg('a')));
  });

  it('a cancelled event is read-only straight away', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5, { status: 'cancelled' })));
    await assertFails(post(google('a'), 'a'));
  });

  it('a muted member cannot post; a removed member (off the RSVP list) cannot read or post', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5, { attendeeUids: ['host', 'a'] })));
    await seed((db) => setDoc(doc(db, 'packDays/e1/chatControl/state'), { mutedUids: ['a'], removedUids: ['b'] }));
    await seed((db) => setDoc(doc(db, 'packDays/e1/messages/m0'), { fromUserId: 'host', text: 'hi', kind: 'text' }));
    await assertFails(post(google('a'), 'a'));
    await assertSucceeds(getDoc(doc(google('a'), 'packDays/e1/messages/m0')));
    await assertFails(post(google('b'), 'b'));
    await assertFails(getDoc(doc(google('b'), 'packDays/e1/messages/m0')));
  });

  it('photos need a real URL and an event that has started', async () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/b/o/packDays%2Fe1%2Fphotos%2Fa%2F1.jpg?alt=media';
    await seed((db) => setDoc(doc(db, 'packDays/started'), event(1)));
    await seed((db) => setDoc(doc(db, 'packDays/future'), event(-5)));
    await assertSucceeds(setDoc(doc(google('a'), 'packDays/started/messages/p1'), msg('a', { kind: 'photo', text: '', photoUrl: url })));
    await assertFails(setDoc(doc(google('a'), 'packDays/started/messages/p2'), msg('a', { kind: 'photo', text: '', photoUrl: 'javascript:1' })));
    await assertFails(setDoc(doc(google('a'), 'packDays/started/messages/p3'), msg('a', { kind: 'photo', text: '' })));
    await assertFails(setDoc(doc(google('a'), 'packDays/started/messages/p4'), msg('a', { kind: 'text', photoUrl: url })));
    await assertFails(setDoc(doc(google('a'), 'packDays/future/messages/p5'), msg('a', { kind: 'photo', text: '', photoUrl: url })));
  });

  it('chatControl is readable by members and writable by no client (host tools are a callable)', async () => {
    await seed((db) => setDoc(doc(db, 'packDays/e1'), event(-5)));
    await seed((db) => setDoc(doc(db, 'packDays/e1/chatControl/state'), { pinned: null }));
    await assertSucceeds(getDoc(doc(google('a'), 'packDays/e1/chatControl/state')));
    await assertFails(getDoc(doc(google('mallory'), 'packDays/e1/chatControl/state')));
    await assertFails(setDoc(doc(google('host'), 'packDays/e1/chatControl/state'), { mutedUids: ['a'] }));
  });

  it('a report can name the single chat message it is about', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'reports/r1'), {
      reporterId: 'a', targetUserId: 'b', reason: 'inappropriate', source: 'packday', eventId: 'e1', messageId: 'm1',
    }));
    await assertFails(setDoc(doc(google('a'), 'reports/r2'), {
      reporterId: 'a', targetUserId: 'b', reason: 'inappropriate', source: 'packday', eventId: 'e1', messageId: text(200),
    }));
  });
});

// ── City feed posts: live reads only, server writes only ──────────────────────
describe('cityPosts', () => {
  const live = () => ({ authorUid: 'a', city: 'Ann Arbor', template: 'ask', text: 'Vet?', expiresAtMs: Date.now() + 3600_000 });

  it('signed-in members read posts (expiry is a query filter); signed-out cannot', async () => {
    await seed((db) => setDoc(doc(db, 'cityPosts/p1'), live()));
    await assertSucceeds(getDoc(doc(google('b'), 'cityPosts/p1')));
    await assertFails(getDoc(doc(signedOut(), 'cityPosts/p1')));
    await assertSucceeds(getDocs(query(collection(google('b'), 'cityPosts'), where('city', '==', 'Ann Arbor'), where('expiresAtMs', '>', Date.now()))));
  });

  it('nobody writes posts, counters or digest markers from a client', async () => {
    await assertFails(setDoc(doc(google('a'), 'cityPosts/p3'), live()));
    await seed((db) => setDoc(doc(db, 'cityPosts/p1'), live()));
    await assertFails(updateDoc(doc(google('a'), 'cityPosts/p1'), { expiresAtMs: Date.now() + 99 * 3600_000 }));
    await assertFails(deleteDoc(doc(google('b'), 'cityPosts/p1')));
    await assertFails(setDoc(doc(google('a'), 'pushCounters/a_2026-01-01'), { count: 0 }));
    await assertFails(getDoc(doc(google('a'), 'pushCounters/a_2026-01-01')));
    await assertFails(setDoc(doc(google('a'), 'cityFeedDigests/x'), {}));
  });

  it('a report can name the post it is about', async () => {
    await assertSucceeds(setDoc(doc(google('a'), 'reports/rp1'), {
      reporterId: 'a', targetUserId: 'b', reason: 'spam', source: 'cityfeed', postId: 'p1',
    }));
  });
});

// ── Pack groups are written by the server only ────────────────────────────────
describe('packGroups', () => {
  it('signed-in members read them; nobody writes from a client', async () => {
    await seed((db) => setDoc(doc(db, 'packGroups/g1'), { name: 'Riverside Sunday Pack', hostUid: 'a', memberUids: ['a'] }));
    await assertSucceeds(getDoc(doc(google('b'), 'packGroups/g1')));
    await assertFails(getDoc(doc(signedOut(), 'packGroups/g1')));
    await assertFails(setDoc(doc(google('b'), 'packGroups/g2'), { name: 'Mine', hostUid: 'b', memberUids: ['b'] }));
    // Not even the host can edit directly, or add themselves to someone else's list.
    await assertFails(updateDoc(doc(google('a'), 'packGroups/g1'), { status: 'paused' }));
    await assertFails(updateDoc(doc(google('b'), 'packGroups/g1'), { memberUids: ['a', 'b'] }));
    await assertFails(deleteDoc(doc(google('a'), 'packGroups/g1')));
  });

  it('has no group chat yet (default deny)', async () => {
    await assertFails(setDoc(doc(google('a'), 'packGroups/g1/messages/m1'), { text: 'hi' }));
  });
});
