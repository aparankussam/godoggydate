// mobile/lib/myBark.ts
// The owner's own recording of their dog's bark. Snoot Boop plays it on every
// boop in place of the built-in boop. Kept in the app's documents folder (the
// recorder writes to a cache folder the OS may clear).
// shortcut: stored on this device only, not synced; upload to Firebase Storage if owners want it on every device.

import { File, Paths } from 'expo-file-system';

function barkFile(uid: string): File {
  return new File(Paths.document, `my-bark-${uid}.m4a`);
}

/** The saved bark's uri, or null when there isn't one (or storage is unreadable). */
export function myBarkUri(uid: string): string | null {
  if (!uid) return null;
  try {
    const file = barkFile(uid);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Keeps a fresh recording as this dog's bark, replacing any earlier one. */
export function saveMyBark(uid: string, recordingUri: string): string {
  const dest = barkFile(uid);
  if (dest.exists) dest.delete();
  new File(recordingUri).copy(dest);
  return dest.uri;
}

export function deleteMyBark(uid: string): void {
  try {
    const file = barkFile(uid);
    if (file.exists) file.delete();
  } catch {
    /* already gone */
  }
}
