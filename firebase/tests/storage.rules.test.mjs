// Tests for ../../storage.rules, run against an already running Storage
// emulator under a throwaway project id (demo-rules-test). See README.md.
//
// The emulator is found through FIREBASE_STORAGE_EMULATOR_HOST (default 127.0.0.1:9199).

import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const [host, port] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
const rules = readFileSync(process.env.STORAGE_RULES_PATH || new URL('../../storage.rules', import.meta.url), 'utf8');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    storage: { rules, host, port: Number(port) },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

const as = (uid, provider) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: provider, identities: {} } }).storage();
const google = (uid) => as(uid, 'google.com');
const apple = (uid) => as(uid, 'apple.com');
const guest = (uid) => as(uid, 'anonymous');
const signedOut = () => testEnv.unauthenticatedContext().storage();

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const jpeg = { contentType: 'image/jpeg' };

describe('dog photos: dogs/{uid}/{dogId}/photos/{file}', () => {
  it('a Google or Apple account uploads photos into its own folder', async () => {
    await assertSucceeds(uploadBytes(ref(google('u1'), 'dogs/u1/u1/photos/1_a.jpg'), BYTES, jpeg));
    await assertSucceeds(uploadBytes(ref(apple('u2'), 'dogs/u2/u2/photos/1_a.png'), BYTES, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(google('u1'), 'dogs/u1/u1/photos/2_b.webp'), BYTES, { contentType: 'image/webp' }));
  });

  it('an anonymous guest cannot upload', async () => {
    await assertFails(uploadBytes(ref(guest('g1'), 'dogs/g1/g1/photos/1_a.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(signedOut(), 'dogs/g1/g1/photos/1_a.jpg'), BYTES, jpeg));
  });

  it("nobody uploads into someone else's folder", async () => {
    await assertFails(uploadBytes(ref(google('u1'), 'dogs/u2/u2/photos/1_a.jpg'), BYTES, jpeg));
  });

  it('only photo types are accepted (no SVG, HTML or scripts)', async () => {
    await assertFails(uploadBytes(ref(google('u1'), 'dogs/u1/u1/photos/x.svg'), BYTES, { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(google('u1'), 'dogs/u1/u1/photos/x.html'), BYTES, { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(google('u1'), 'dogs/u1/u1/photos/x.js'), BYTES, { contentType: 'application/javascript' }));
  });

  it('files outside the photo and video folders are refused', async () => {
    await assertFails(uploadBytes(ref(google('u1'), 'dogs/u1/u1/other/x.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(google('u1'), 'elsewhere/u1/x.jpg'), BYTES, jpeg));
  });

  it('any signed-in account reads a photo, a signed-out visitor cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'dogs/u1/u1/photos/read.jpg'), BYTES, jpeg);
    });
    await assertSucceeds(getBytes(ref(google('u2'), 'dogs/u1/u1/photos/read.jpg')));
    await assertSucceeds(getBytes(ref(guest('g1'), 'dogs/u1/u1/photos/read.jpg')));
    await assertFails(getBytes(ref(signedOut(), 'dogs/u1/u1/photos/read.jpg')));
  });

  it('only the owner deletes their photos', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'dogs/u1/u1/photos/del.jpg'), BYTES, jpeg);
    });
    await assertFails(deleteObject(ref(google('u2'), 'dogs/u1/u1/photos/del.jpg')));
    await assertSucceeds(deleteObject(ref(google('u1'), 'dogs/u1/u1/photos/del.jpg')));
  });
});

describe('videos and avatars', () => {
  it('video: a real account uploads a video to its own folder, a guest cannot', async () => {
    await assertSucceeds(uploadBytes(ref(google('u1'), 'dogs/u1/u1/video/v.mp4'), BYTES, { contentType: 'video/mp4' }));
    await assertFails(uploadBytes(ref(guest('g1'), 'dogs/g1/g1/video/v.mp4'), BYTES, { contentType: 'video/mp4' }));
    await assertFails(uploadBytes(ref(google('u1'), 'dogs/u1/u1/video/v.jpg'), BYTES, jpeg));
  });

  it('avatars: a real account uploads its own, a guest cannot', async () => {
    await assertSucceeds(uploadBytes(ref(google('u1'), 'avatars/u1/me.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(guest('g1'), 'avatars/g1/me.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(google('u1'), 'avatars/u2/me.jpg'), BYTES, jpeg));
  });
});

describe('Pack Day album: packDays/{eventId}/photos/{uid}/{file}', () => {
  it('a real account uploads a photo into its own folder, with the dog-photo limits', async () => {
    await assertSucceeds(uploadBytes(ref(google('u1'), 'packDays/e1/photos/u1/1.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(guest('g1'), 'packDays/e1/photos/g1/1.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(google('u1'), 'packDays/e1/photos/u2/1.jpg'), BYTES, jpeg));
    await assertFails(uploadBytes(ref(google('u1'), 'packDays/e1/photos/u1/x.svg'), BYTES, { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(google('u1'), 'packDays/e1/photos/u1/big.jpg'), new Uint8Array(10 * 1024 * 1024 + 1), jpeg));
  });

  it('signed-in people read, signed-out visitors cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'packDays/e1/photos/u1/r.jpg'), BYTES, jpeg);
    });
    await assertSucceeds(getBytes(ref(google('u2'), 'packDays/e1/photos/u1/r.jpg')));
    await assertFails(getBytes(ref(signedOut(), 'packDays/e1/photos/u1/r.jpg')));
  });
});
