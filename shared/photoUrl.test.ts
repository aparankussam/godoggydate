import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PHOTO_PLACEHOLDER,
  isOwnStoragePhotoUrl,
  isStoragePhotoUrl,
  splitDogPhotos,
  storagePhotoObjectPath,
} from './photoUrl.ts';

const POLICY = { buckets: ['godoggydate.appspot.com', 'godoggydate.firebasestorage.app'] };
const EMULATOR = { buckets: ['demo-godoggydate.appspot.com'], allowEmulator: true };

const UID = 'abc123UID';
const OWN = `https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/dogs%2F${UID}%2F${UID}%2Fphotos%2F1795273612688_dog1.jpg?alt=media&token=54f4fb1f-ce2a-450f-be0d-ae11489c5292`;

test("a download URL for this project's bucket is a photo", () => {
  assert.equal(isStoragePhotoUrl(OWN, POLICY), true);
  assert.equal(
    isStoragePhotoUrl('https://firebasestorage.googleapis.com/v0/b/godoggydate.firebasestorage.app/o/dogs%2Fa%2Fb%2Fphotos%2Fx.jpg?alt=media&token=t', POLICY),
    true,
  );
  assert.equal(storagePhotoObjectPath(OWN, POLICY), `dogs/${UID}/${UID}/photos/1795273612688_dog1.jpg`);
});

test('another bucket, another host or another scheme is not', () => {
  for (const url of [
    'https://firebasestorage.googleapis.com/v0/b/someone-elses.appspot.com/o/dogs%2Fa.jpg?alt=media',
    'https://evil.example/v0/b/godoggydate.appspot.com/o/dogs%2Fa.jpg',
    'http://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/dogs%2Fa.jpg',
    'https://firebasestorage.googleapis.com.evil.example/v0/b/godoggydate.appspot.com/o/a.jpg',
    'https://firebasestorage.googleapis.com@evil.example/v0/b/godoggydate.appspot.com/o/a.jpg',
    'https://evil.example/?https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/a.jpg',
    'https://storage.googleapis.com/godoggydate.appspot.com/dogs/a.jpg',
    'https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/',
    'https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/a b.jpg',
    'https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/a\\b.jpg',
    'https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/a.jpg#<script>',
    'https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/a.jpg\n',
    'https://firebasestorage.googleapis.com/v0/b/godoggydate.appspot.com/o/%E0%A4%A',
    'http://127.0.0.1:9199/v0/b/godoggydate.appspot.com/o/a.jpg',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    '//evil.example/x.jpg',
    'evil.example/x.jpg',
    '',
    ' ',
    PHOTO_PLACEHOLDER,
  ]) {
    assert.equal(isStoragePhotoUrl(url, POLICY), false, url);
  }
  assert.equal(isStoragePhotoUrl(null, POLICY), false);
  assert.equal(isStoragePhotoUrl(42, POLICY), false);
  assert.equal(isStoragePhotoUrl(undefined, POLICY), false);
  assert.equal(isStoragePhotoUrl({}, POLICY), false);
});

test('an overlong URL is refused', () => {
  assert.equal(isStoragePhotoUrl(OWN + 'a'.repeat(2000), POLICY), false);
});

test('the emulator host is only accepted when running in the emulator', () => {
  const emulatorUrl = 'http://127.0.0.1:9199/v0/b/demo-godoggydate.appspot.com/o/dogs%2Fu%2Fu%2Fphotos%2F1_a.jpg?alt=media&token=t';
  assert.equal(isStoragePhotoUrl(emulatorUrl, EMULATOR), true);
  assert.equal(isStoragePhotoUrl(emulatorUrl.replace('127.0.0.1', 'localhost'), EMULATOR), true);
  assert.equal(isStoragePhotoUrl(emulatorUrl, { buckets: EMULATOR.buckets }), false);
  assert.equal(isStoragePhotoUrl(emulatorUrl, { ...EMULATOR, allowEmulator: false }), false);
  // Wrong port, wrong host, wrong bucket stay refused even in the emulator.
  assert.equal(isStoragePhotoUrl(emulatorUrl.replace(':9199', ':8080'), EMULATOR), false);
  assert.equal(isStoragePhotoUrl(emulatorUrl.replace('127.0.0.1', 'evil.example'), EMULATOR), false);
  assert.equal(isStoragePhotoUrl(emulatorUrl.replace('demo-godoggydate', 'other'), EMULATOR), false);
  assert.equal(isStoragePhotoUrl(emulatorUrl, { ...EMULATOR, emulatorPort: 9200 }), false);
  assert.equal(isStoragePhotoUrl(emulatorUrl.replace(':9199', ':9200'), { ...EMULATOR, emulatorPort: 9200 }), true);
});

test("only the owner's own upload folder counts as their photo", () => {
  assert.equal(isOwnStoragePhotoUrl(OWN, UID, POLICY), true);
  assert.equal(isOwnStoragePhotoUrl(OWN, 'someoneElse', POLICY), false);
  assert.equal(isOwnStoragePhotoUrl(OWN, '', POLICY), false);
  assert.equal(isOwnStoragePhotoUrl('https://evil.example/x.jpg', UID, POLICY), false);
  // A uid that is a prefix of another must not match ("dogs/abc/" vs "dogs/abcd/").
  assert.equal(isOwnStoragePhotoUrl(OWN.replace(`${UID}%2F${UID}`, `${UID}x%2F${UID}x`), UID, POLICY), false);
});

test('splitting keeps placeholders and Storage URLs, drops everything else', () => {
  const { kept, dropped } = splitDogPhotos(
    [OWN, PHOTO_PLACEHOLDER, 'https://evil.example/pixel.png', 'data:image/png;base64,AAAA', '', 7, null, OWN],
    POLICY,
  );
  assert.deepEqual(kept, [OWN, PHOTO_PLACEHOLDER, OWN]);
  assert.deepEqual(dropped, ['https://evil.example/pixel.png', 'data:image/png;base64,AAAA', '', 7, null]);
  assert.deepEqual(splitDogPhotos([], POLICY), { kept: [], dropped: [] });
  assert.deepEqual(splitDogPhotos(undefined, POLICY), { kept: [], dropped: [] });
});
