// mobile/lib/adventurePhotos.ts
// The proof photo for a stamped Adventure Passport quest, kept in the app's
// documents folder. The stamp itself syncs (lib/adventures.ts); the photo does not.
// shortcut: photos stay on this device, not synced; upload to Firebase Storage if owners switch phones.

import { File, Paths } from 'expo-file-system';

function photoFile(uid: string, questId: string): File {
  return new File(Paths.document, `adventure-${uid}-${questId}.jpg`);
}

/** The saved proof photo's uri, or null when there isn't one on this device. */
export function adventurePhotoUri(uid: string, questId: string): string | null {
  try {
    const file = photoFile(uid, questId);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Keeps a picked photo as the proof for a quest, replacing any earlier one. */
export function saveAdventurePhoto(uid: string, questId: string, pickedUri: string): string {
  const dest = photoFile(uid, questId);
  if (dest.exists) dest.delete();
  new File(pickedUri).copy(dest);
  return dest.uri;
}

export function deleteAdventurePhoto(uid: string, questId: string): void {
  try {
    const file = photoFile(uid, questId);
    if (file.exists) file.delete();
  } catch {
    /* already gone */
  }
}
