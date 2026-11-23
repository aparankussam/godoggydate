// firebase/functions/src/photoUrl.ts
// MIRROR of shared/photoUrl.ts. Do not edit this copy by hand.
//
// The functions deploy uploads only firebase/functions (tsconfig rootDir is
// src), so this package can't import ../../shared at runtime. Everything below
// this header is byte-identical to shared/photoUrl.ts from the first `export`
// line down, and shared/serverMirrors.test.ts fails if the two drift. To change
// it, edit shared/photoUrl.ts, then copy its body here.

export const PHOTO_PLACEHOLDER = '_placeholder_';

/** The longest photo URL either app can produce is ~350 characters. */
export const MAX_PHOTO_URL_LENGTH = 1000;

export interface PhotoUrlPolicy {
  /** Storage bucket names that belong to this Firebase project. */
  buckets: readonly string[];
  /** True only inside the Firebase emulators, which serve photos from
   *  http://127.0.0.1:<port>/ or http://localhost:<port>/ instead. */
  allowEmulator?: boolean;
  /** Storage emulator port (default 9199). */
  emulatorPort?: number;
}

// Percent-encoded object names only contain these. Listing them (rather than
// "anything but whitespace") keeps control characters and backslashes out.
const OBJECT = "[A-Za-z0-9\\-._~%!$&'()*+,;=:@/]+";
const QUERY = "(?:\\?[A-Za-z0-9\\-._~%!$&'()*+,;=:@/?]*)?";
const PROD_URL = new RegExp(`^https://firebasestorage\\.googleapis\\.com/v0/b/([A-Za-z0-9._-]+)/o/(${OBJECT})${QUERY}$`);
const EMULATOR_URL = new RegExp(`^http://(?:127\\.0\\.0\\.1|localhost):(\\d{2,5})/v0/b/([A-Za-z0-9._-]+)/o/(${OBJECT})${QUERY}$`);

/** The decoded object path (e.g. "dogs/<uid>/<uid>/photos/1_a.jpg") of a
 *  Firebase Storage URL for one of this project's buckets, or null. */
export function storagePhotoObjectPath(url: unknown, policy: PhotoUrlPolicy): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_PHOTO_URL_LENGTH) return null;

  let bucket: string | undefined;
  let encodedObject: string | undefined;
  const prod = PROD_URL.exec(url);
  if (prod) {
    bucket = prod[1];
    encodedObject = prod[2];
  } else if (policy.allowEmulator) {
    const emulator = EMULATOR_URL.exec(url);
    if (emulator && Number(emulator[1]) === (policy.emulatorPort ?? 9199)) {
      bucket = emulator[2];
      encodedObject = emulator[3];
    }
  }
  if (bucket === undefined || encodedObject === undefined) return null;
  if (!policy.buckets.includes(bucket)) return null;

  try {
    return decodeURIComponent(encodedObject);
  } catch {
    return null;
  }
}

/** True for a Firebase Storage download URL for one of this project's buckets. */
export function isStoragePhotoUrl(url: unknown, policy: PhotoUrlPolicy): boolean {
  return storagePhotoObjectPath(url, policy) !== null;
}

/** True when the URL points into the dog owner's own upload folder
 *  (dogs/<uid>/...), which is the only place storage.rules lets them write. */
export function isOwnStoragePhotoUrl(url: unknown, uid: string, policy: PhotoUrlPolicy): boolean {
  if (!uid) return false;
  const objectPath = storagePhotoObjectPath(url, policy);
  return objectPath !== null && objectPath.startsWith(`dogs/${uid}/`);
}

/**
 * Splits a photos array into what stays and what is dropped. '_placeholder_'
 * and this project's Storage URLs stay; every other entry (other hosts, data:
 * URLs, empty strings, non-strings) is dropped. `kept` is the same order.
 */
export function splitDogPhotos(
  photos: unknown,
  policy: PhotoUrlPolicy,
): { kept: string[]; dropped: unknown[] } {
  const kept: string[] = [];
  const dropped: unknown[] = [];
  if (!Array.isArray(photos)) return { kept, dropped };
  for (const entry of photos) {
    if (entry === PHOTO_PLACEHOLDER || isStoragePhotoUrl(entry, policy)) {
      kept.push(entry as string);
    } else {
      dropped.push(entry);
    }
  }
  return { kept, dropped };
}
